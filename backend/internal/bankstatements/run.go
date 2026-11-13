package bankstatements

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Notify sends one user an in-app notification with a push, i.e.
// services.SendDirectNotification (passed in to keep this package free of
// the services import, which runs the scheduler that calls Run).
type Notify func(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, title, body string, deepLink *string) error

// maxAttempts is how many times an email that failed for a passing reason
// (network, HDFC down) is tried before it is left for a person to look at.
const maxAttempts = 3

// Result is how one run went.
type Result struct {
	Saved   []string // "50200121551530 11/11/2026"
	Skipped int      // emails already handled
	Errors  []string
}

var running sync.Mutex

// Run reads statement emails from the last `days` days for every active
// account and saves the ones not saved yet. notify may be nil (no alerts).
func Run(ctx context.Context, db *pgxpool.Pool, days int, notify Notify) Result {
	running.Lock()
	defer running.Unlock()
	var res Result

	rt, err := GetCredential(ctx, db, CredGmailToken)
	if err != nil {
		res.Errors = append(res.Errors, err.Error())
		alertOnce(ctx, db, notify, "gmail-token", "Bank statements: Gmail not connected", err.Error())
		return res
	}
	g, err := newGmail(ctx, rt)
	if err != nil {
		res.Errors = append(res.Errors, err.Error())
		alertOnce(ctx, db, notify, "gmail-signin", "Bank statements: Gmail signed out",
			"The statement mailbox (arora.pardeep1973) needs to be signed in again; daily bank statements are not being read. "+err.Error())
		return res
	}

	type account struct{ no, last4, sender, credKey string }
	var accounts []account
	rows, err := db.Query(ctx, `SELECT account_no, last4, sender, credential_key FROM bank_statement_accounts WHERE active ORDER BY account_no`)
	if err != nil {
		res.Errors = append(res.Errors, err.Error())
		return res
	}
	for rows.Next() {
		var a account
		if err := rows.Scan(&a.no, &a.last4, &a.sender, &a.credKey); err != nil {
			rows.Close()
			res.Errors = append(res.Errors, err.Error())
			return res
		}
		accounts = append(accounts, a)
	}
	rows.Close()

	for _, a := range accounts {
		password, err := GetCredential(ctx, db, a.credKey)
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			alertOnce(ctx, db, notify, "pwd-"+a.no, "Bank statements: password missing", "No statement password saved for account ***"+a.last4+".")
			continue
		}
		ids, err := g.search(ctx, fmt.Sprintf(`from:%s subject:%s newer_than:%dd`, a.sender, a.last4, days), 500)
		if err != nil {
			res.Errors = append(res.Errors, "gmail search: "+err.Error())
			continue
		}
		done, err := handledEmails(ctx, db, ids)
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		for i := len(ids) - 1; i >= 0; i-- { // oldest first
			id := ids[i]
			if done[id] {
				res.Skipped++
				continue
			}
			label, err := readOne(ctx, db, g, id, a.no, a.last4, a.sender, password)
			if err == nil {
				if label != "" {
					res.Saved = append(res.Saved, label)
				}
				continue
			}
			res.Errors = append(res.Errors, err.Error())
			log.Printf("bank statements: %s: %v", id, err)
			status := "failed"
			if errors.Is(err, errRejected) {
				status = "rejected"
			}
			var attempts int
			_ = db.QueryRow(ctx, `
				INSERT INTO bank_statement_emails (gmail_message_id, account_no, status, attempts, last_error, updated_at)
				VALUES ($1, $2, $3, 1, $4, now())
				ON CONFLICT (gmail_message_id) DO UPDATE SET status = $3, attempts = bank_statement_emails.attempts + 1,
				       last_error = $4, updated_at = now()
				RETURNING attempts`, id, a.no, status, err.Error()).Scan(&attempts)
			if status == "rejected" {
				alertOnce(ctx, db, notify, "rejected-"+a.no, "Bank statements: HDFC refused the password",
					"HDFC did not open the statement for ***"+a.last4+". The statement password may have changed; update it in the passwords table.")
			} else if attempts == maxAttempts {
				alertOnce(ctx, db, notify, "failed-"+id, "Bank statements: a statement could not be read",
					"A statement email for ***"+a.last4+" failed "+strconv.Itoa(maxAttempts)+" times: "+err.Error())
			}
		}
	}
	return res
}

// handledEmails: of these message ids, the ones not to read again — saved,
// refused by HDFC, not statements, or failed too often.
func handledEmails(ctx context.Context, db *pgxpool.Pool, ids []string) (map[string]bool, error) {
	out := map[string]bool{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := db.Query(ctx, `
		SELECT gmail_message_id FROM bank_statement_emails
		WHERE gmail_message_id = ANY($1::text[])
		  AND (status IN ('saved', 'rejected', 'ignored') OR attempts >= $2)`, ids, maxAttempts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// readOne reads one email and saves its statement. It returns "" with no
// error for an email that turns out not to be a statement for this account.
func readOne(ctx context.Context, db *pgxpool.Pool, g *gmail, id, accountNo, last4, sender, password string) (string, error) {
	e, err := g.message(ctx, id)
	if err != nil {
		return "", err
	}
	if !strings.Contains(strings.ToLower(e.From), strings.ToLower(sender)) || !strings.Contains(e.Subject, "***"+last4) {
		_, err := db.Exec(ctx, `
			INSERT INTO bank_statement_emails (gmail_message_id, account_no, subject, received_at, status, attempts, updated_at)
			VALUES ($1, $2, $3, $4, 'ignored', 0, now()) ON CONFLICT (gmail_message_id) DO NOTHING`, id, accountNo, e.Subject, e.ReceivedAt)
		return "", err
	}
	link := statementLink(e.HTML)
	if link == "" {
		return "", errors.New("no statement link in the email: " + e.Subject)
	}
	fctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	page, err := fetchStatement(fctx, link, password)
	cancel()
	if err != nil {
		return "", err
	}
	s, err := ParseStatement(page)
	if err != nil {
		return "", err
	}
	if s.AccountNo != accountNo {
		return "", fmt.Errorf("statement is for account %s, expected %s", s.AccountNo, accountNo)
	}
	if err := save(ctx, db, s, e); err != nil {
		return "", fmt.Errorf("save: %w", err)
	}
	return accountNo + " " + s.PeriodFrom.Format("02/01/2006"), nil
}

func save(ctx context.Context, db *pgxpool.Pool, s *Statement, e *email) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO bank_statements (
			account_no, period_from, period_to, customer_name, customer_id, customer_address,
			account_type, product_type, currency, joint_holder_1, joint_holder_2, nominee,
			account_opened_on, account_status, od_limit, hold_balance, expected_aqb, available_balance,
			branch_name, branch_address, branch_phone, ifsc, micr,
			opening_balance, debit_amount, credit_amount, closing_balance, debit_count, credit_count,
			statement_ref, statement_html, gmail_message_id, email_subject, email_received_at, fetched_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
		        $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34, now())
		ON CONFLICT (account_no, period_from, period_to) DO UPDATE SET
			customer_name = EXCLUDED.customer_name, customer_id = EXCLUDED.customer_id, customer_address = EXCLUDED.customer_address,
			account_type = EXCLUDED.account_type, product_type = EXCLUDED.product_type, currency = EXCLUDED.currency,
			joint_holder_1 = EXCLUDED.joint_holder_1, joint_holder_2 = EXCLUDED.joint_holder_2, nominee = EXCLUDED.nominee,
			account_opened_on = EXCLUDED.account_opened_on, account_status = EXCLUDED.account_status,
			od_limit = EXCLUDED.od_limit, hold_balance = EXCLUDED.hold_balance, expected_aqb = EXCLUDED.expected_aqb,
			available_balance = EXCLUDED.available_balance, branch_name = EXCLUDED.branch_name,
			branch_address = EXCLUDED.branch_address, branch_phone = EXCLUDED.branch_phone, ifsc = EXCLUDED.ifsc, micr = EXCLUDED.micr,
			opening_balance = EXCLUDED.opening_balance, debit_amount = EXCLUDED.debit_amount, credit_amount = EXCLUDED.credit_amount,
			closing_balance = EXCLUDED.closing_balance, debit_count = EXCLUDED.debit_count, credit_count = EXCLUDED.credit_count,
			statement_ref = EXCLUDED.statement_ref, statement_html = EXCLUDED.statement_html,
			gmail_message_id = EXCLUDED.gmail_message_id, email_subject = EXCLUDED.email_subject,
			email_received_at = EXCLUDED.email_received_at, fetched_at = now()
		RETURNING id`,
		s.AccountNo, s.PeriodFrom, s.PeriodTo, nz(s.CustomerName), nz(s.CustomerID), nz(s.CustomerAddress),
		nz(s.AccountType), nz(s.ProductType), nz(s.Currency), nz(s.JointHolder1), nz(s.JointHolder2), nz(s.Nominee),
		s.AccountOpenedOn, nz(s.AccountStatus), s.ODLimit, s.HoldBalance, s.ExpectedAQB, s.AvailableBalance,
		nz(s.BranchName), nz(s.BranchAddress), nz(s.BranchPhone), nz(s.IFSC), nz(s.MICR),
		s.OpeningBalance, s.DebitAmount, s.CreditAmount, s.Closing, s.DebitCount, s.CreditCount,
		nz(s.StatementRef), s.HTML, e.ID, e.Subject, e.ReceivedAt).Scan(&id)
	if err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM bank_statement_lines WHERE statement_id = $1`, id); err != nil {
		return err
	}
	if len(s.Lines) > 0 {
		var tdate, narr, ref, vdate, wd, dep, bal, c8, typ []string
		for _, l := range s.Lines {
			tdate, narr, ref, vdate = append(tdate, ds(l.TxnDate)), append(narr, l.Narration), append(ref, l.RefNo), append(vdate, ds(l.ValueDate))
			wd, dep, bal, c8, typ = append(wd, fs(l.Withdrawal)), append(dep, fs(l.Deposit)), append(bal, fs(l.ClosingBalance)), append(c8, fs(l.Col8)), append(typ, l.TxnType)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO bank_statement_lines (statement_id, line_no, txn_date, narration, ref_no, value_date,
			                                  withdrawal, deposit, closing_balance, col8, txn_type)
			SELECT $1, n, NULLIF(td, '')::date, NULLIF(na, ''), NULLIF(rf, ''), NULLIF(vd, '')::date,
			       NULLIF(w, '')::numeric, NULLIF(d, '')::numeric, NULLIF(b, '')::numeric, NULLIF(c, '')::numeric, NULLIF(t, '')
			FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
			     WITH ORDINALITY AS x(td, na, rf, vd, w, d, b, c, t, n)`,
			id, tdate, narr, ref, vdate, wd, dep, bal, c8, typ); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO bank_statement_emails (gmail_message_id, account_no, subject, received_at, status, attempts, last_error, statement_id, updated_at)
		VALUES ($1, $2, $3, $4, 'saved', 1, NULL, $5, now())
		ON CONFLICT (gmail_message_id) DO UPDATE SET subject = $3, received_at = $4, status = 'saved',
		       attempts = bank_statement_emails.attempts + 1, last_error = NULL, statement_id = $5, updated_at = now()`,
		e.ID, s.AccountNo, e.Subject, e.ReceivedAt, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func nz(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func ds(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

func fs(f *float64) string {
	if f == nil {
		return ""
	}
	return strconv.FormatFloat(*f, 'f', 2, 64)
}

// alerted remembers which alerts were sent today, so the hourly check
// doesn't repeat one every hour (it can repeat after a restart).
var (
	alertMu sync.Mutex
	alerted = map[string]string{}
)

func alertOnce(ctx context.Context, db *pgxpool.Pool, notify Notify, key, title, body string) {
	log.Printf("bank statements: %s: %s", title, body)
	if notify == nil {
		return
	}
	today := time.Now().Format("2006-01-02")
	alertMu.Lock()
	if alerted[key] == today {
		alertMu.Unlock()
		return
	}
	alerted[key] = today
	alertMu.Unlock()

	rows, err := db.Query(ctx, `SELECT id FROM users WHERE role = 'admin'`)
	if err != nil {
		log.Printf("bank statements: list admins: %v", err)
		return
	}
	var admins []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if rows.Scan(&id) == nil {
			admins = append(admins, id)
		}
	}
	rows.Close()
	for _, id := range admins {
		if err := notify(ctx, db, id, title, body, nil); err != nil {
			log.Printf("bank statements: notify %s: %v", id, err)
		}
	}
}
