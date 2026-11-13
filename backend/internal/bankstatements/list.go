package bankstatements

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Account is a configured account with its latest saved position, for the
// top of the page.
type Account struct {
	AccountNo       string     `json:"account_no"`
	Bank            string     `json:"bank"`
	Last4           string     `json:"last4"`
	Active          bool       `json:"active"`
	CustomerName    *string    `json:"customer_name,omitempty"`
	ProductType     *string    `json:"product_type,omitempty"`
	BranchName      *string    `json:"branch_name,omitempty"`
	IFSC            *string    `json:"ifsc,omitempty"`
	ODLimit         *float64   `json:"od_limit,omitempty"`
	LatestClosing   *float64   `json:"latest_closing,omitempty"`
	LatestPeriodTo  *time.Time `json:"latest_period_to,omitempty"`
	LastFetchedAt   *time.Time `json:"last_fetched_at,omitempty"`
	FirstPeriodFrom *time.Time `json:"first_period_from,omitempty"`
	StatementCount  int        `json:"statement_count"`
}

// StatementLine is one transaction, for the page.
type StatementLine struct {
	LineNo         int        `json:"line_no"`
	TxnDate        *time.Time `json:"txn_date,omitempty"`
	Narration      *string    `json:"narration,omitempty"`
	RefNo          *string    `json:"ref_no,omitempty"`
	ValueDate      *time.Time `json:"value_date,omitempty"`
	Withdrawal     *float64   `json:"withdrawal,omitempty"`
	Deposit        *float64   `json:"deposit,omitempty"`
	ClosingBalance *float64   `json:"closing_balance,omitempty"`
	TxnType        *string    `json:"txn_type,omitempty"`
}

// StatementSummary is one saved statement with its lines.
type StatementSummary struct {
	ID              uuid.UUID       `json:"id"`
	AccountNo       string          `json:"account_no"`
	PeriodFrom      time.Time       `json:"period_from"`
	PeriodTo        time.Time       `json:"period_to"`
	OpeningBalance  *float64        `json:"opening_balance,omitempty"`
	DebitAmount     *float64        `json:"debit_amount,omitempty"`
	CreditAmount    *float64        `json:"credit_amount,omitempty"`
	ClosingBalance  *float64        `json:"closing_balance,omitempty"`
	DebitCount      *int            `json:"debit_count,omitempty"`
	CreditCount     *int            `json:"credit_count,omitempty"`
	EmailReceivedAt *time.Time      `json:"email_received_at,omitempty"`
	FetchedAt       time.Time       `json:"fetched_at"`
	Lines           []StatementLine `json:"lines"`
}

// Problem is a statement email that could not be read.
type Problem struct {
	GmailMessageID string     `json:"gmail_message_id"`
	AccountNo      string     `json:"account_no"`
	Subject        *string    `json:"subject,omitempty"`
	ReceivedAt     *time.Time `json:"received_at,omitempty"`
	Status         string     `json:"status"`
	Attempts       int        `json:"attempts"`
	LastError      *string    `json:"last_error,omitempty"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// Overview is everything the Bank Statements page shows.
type Overview struct {
	Accounts   []Account          `json:"accounts"`
	Statements []StatementSummary `json:"statements"`
	Problems   []Problem          `json:"problems"`
}

// List returns the accounts, the statements of accountNo ("" = every
// account) whose period touches [from, to], newest first, and any emails
// that failed and were not later saved.
func List(ctx context.Context, db *pgxpool.Pool, accountNo string, from, to time.Time) (*Overview, error) {
	out := &Overview{Accounts: []Account{}, Statements: []StatementSummary{}, Problems: []Problem{}}

	rows, err := db.Query(ctx, `
		SELECT a.account_no, a.bank, a.last4, a.active,
		       l.customer_name, l.product_type, l.branch_name, l.ifsc, l.od_limit::float8,
		       l.closing_balance::float8, l.period_to, l.fetched_at,
		       (SELECT min(period_from) FROM bank_statements s WHERE s.account_no = a.account_no),
		       (SELECT count(*) FROM bank_statements s WHERE s.account_no = a.account_no)
		FROM bank_statement_accounts a
		LEFT JOIN LATERAL (SELECT * FROM bank_statements s WHERE s.account_no = a.account_no
		                   ORDER BY period_to DESC, fetched_at DESC LIMIT 1) l ON true
		ORDER BY a.active DESC, a.account_no`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.AccountNo, &a.Bank, &a.Last4, &a.Active, &a.CustomerName, &a.ProductType, &a.BranchName,
			&a.IFSC, &a.ODLimit, &a.LatestClosing, &a.LatestPeriodTo, &a.LastFetchedAt, &a.FirstPeriodFrom, &a.StatementCount); err != nil {
			rows.Close()
			return nil, err
		}
		out.Accounts = append(out.Accounts, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = db.Query(ctx, `
		SELECT id, account_no, period_from, period_to, opening_balance::float8, debit_amount::float8, credit_amount::float8,
		       closing_balance::float8, debit_count, credit_count, email_received_at, fetched_at
		FROM bank_statements
		WHERE ($1 = '' OR account_no = $1) AND period_to >= $2 AND period_from <= $3
		ORDER BY period_from DESC, account_no`, accountNo, from, to)
	if err != nil {
		return nil, err
	}
	byID := map[uuid.UUID]int{}
	var ids []string
	for rows.Next() {
		var s StatementSummary
		if err := rows.Scan(&s.ID, &s.AccountNo, &s.PeriodFrom, &s.PeriodTo, &s.OpeningBalance, &s.DebitAmount, &s.CreditAmount,
			&s.ClosingBalance, &s.DebitCount, &s.CreditCount, &s.EmailReceivedAt, &s.FetchedAt); err != nil {
			rows.Close()
			return nil, err
		}
		s.Lines = []StatementLine{}
		byID[s.ID] = len(out.Statements)
		ids = append(ids, s.ID.String())
		out.Statements = append(out.Statements, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(ids) > 0 {
		rows, err = db.Query(ctx, `
			SELECT statement_id, line_no, txn_date, narration, ref_no, value_date,
			       withdrawal::float8, deposit::float8, closing_balance::float8, txn_type
			FROM bank_statement_lines WHERE statement_id = ANY($1::uuid[])
			ORDER BY statement_id, line_no`, ids)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var sid uuid.UUID
			var l StatementLine
			if err := rows.Scan(&sid, &l.LineNo, &l.TxnDate, &l.Narration, &l.RefNo, &l.ValueDate,
				&l.Withdrawal, &l.Deposit, &l.ClosingBalance, &l.TxnType); err != nil {
				rows.Close()
				return nil, err
			}
			if i, ok := byID[sid]; ok {
				out.Statements[i].Lines = append(out.Statements[i].Lines, l)
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	rows, err = db.Query(ctx, `
		SELECT gmail_message_id, account_no, subject, received_at, status, attempts, last_error, updated_at
		FROM bank_statement_emails
		WHERE status IN ('failed', 'rejected') AND ($1 = '' OR account_no = $1)
		ORDER BY updated_at DESC LIMIT 20`, accountNo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p Problem
		if err := rows.Scan(&p.GmailMessageID, &p.AccountNo, &p.Subject, &p.ReceivedAt, &p.Status, &p.Attempts, &p.LastError, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out.Problems = append(out.Problems, p)
	}
	return out, rows.Err()
}

// ErrNotFound means there is no statement with that id.
var ErrNotFound = errors.New("statement not found")

// StatementHTML returns the statement page as HDFC sent it.
func StatementHTML(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (string, error) {
	var h *string
	err := db.QueryRow(ctx, `SELECT statement_html FROM bank_statements WHERE id = $1`, id).Scan(&h)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if h == nil {
		return "", nil
	}
	return *h, nil
}
