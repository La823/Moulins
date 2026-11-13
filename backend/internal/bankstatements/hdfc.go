package bankstatements

import (
	"context"
	"crypto/aes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// HDFC SmartStatement, as it worked on 12 Nov 2026:
//  1. GET the link from the email → a password form with hidden ke (jobkey)
//     and seqence.
//  2. GET CRSGetToken?jobkey=<ke> → a one-time token.
//  3. POST webresources/app/htmlformat with pwd = scramble(token + password)
//     (the cipher in the page's js/encrypt.js).
//  4. The answer is a page holding Data("<base64 AES key>", "<base64 blob>"):
//     the statement HTML, AES-ECB/PKCS7, decrypted in the browser.

// errRejected means HDFC answered without a statement — most likely a wrong
// password. Such an email is not retried, so a bad password can't get the
// link locked by repeated tries.
var errRejected = errors.New("HDFC did not return a statement")

const browserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

// scramble is HDFC's js/encrypt.js: a random first byte, then each character
// shifted by the previous output byte and XORed with "toUpperCase", as hex.
func scramble(s string) string {
	const key = "toUpperCase"
	prev := rand.IntN(255) + 1
	var b strings.Builder
	fmt.Fprintf(&b, "%02X", prev)
	for i := 0; i < len(s); i++ {
		v := ((int(s[i]) + prev) % 255) ^ int(key[i%len(key)])
		fmt.Fprintf(&b, "%02X", v)
		prev = v
	}
	return b.String()
}

var (
	hiddenKeRe  = regexp.MustCompile(`id="ke"\s+value='([^']+)'`)
	hiddenSeqRe = regexp.MustCompile(`id="seqence"\s+value='([^']+)'`)
	dataCallRe  = regexp.MustCompile(`Data\("([^"]+)","([^"]+)"\)`)
)

// fetchStatement opens one statement link with the password and returns the
// decrypted statement HTML.
func fetchStatement(ctx context.Context, link, password string) (string, error) {
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Timeout: 90 * time.Second, Jar: jar}
	do := func(req *http.Request) (string, error) {
		req.Header.Set("User-Agent", browserUA)
		res, err := c.Do(req)
		if err != nil {
			return "", err
		}
		defer res.Body.Close()
		b, err := io.ReadAll(io.LimitReader(res.Body, 40<<20))
		if err != nil {
			return "", err
		}
		if res.StatusCode != http.StatusOK {
			return "", fmt.Errorf("HDFC answered %d for %s", res.StatusCode, req.URL.Path)
		}
		return string(b), nil
	}

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	page, err := do(req)
	if err != nil {
		return "", err
	}
	ke, seq := hiddenKeRe.FindStringSubmatch(page), hiddenSeqRe.FindStringSubmatch(page)
	if ke == nil || seq == nil {
		return "", errors.New("HDFC password page not as expected (link expired or page changed)")
	}
	base := link[:strings.Index(link, "GetStatement.jsp")]

	req, _ = http.NewRequestWithContext(ctx, http.MethodGet, base+"CRSGetToken?jobkey="+url.QueryEscape(ke[1]), nil)
	token, err := do(req)
	if err != nil {
		return "", err
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return "", errors.New("HDFC gave no token")
	}

	form := url.Values{"ke": {ke[1]}, "seqence": {seq[1]}, "pwd": {scramble(token + password)}}
	req, _ = http.NewRequestWithContext(ctx, http.MethodPost, base+"webresources/app/htmlformat", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", link)
	answer, err := do(req)
	if err != nil {
		return "", err
	}
	m := dataCallRe.FindStringSubmatch(answer)
	if m == nil {
		return "", fmt.Errorf("%w: %s", errRejected, snippet(answer))
	}
	return decryptAES(m[1], strings.ReplaceAll(m[2], `\n`, ""))
}

func decryptAES(keyB64, dataB64 string) (string, error) {
	key, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		return "", fmt.Errorf("statement key: %w", err)
	}
	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", fmt.Errorf("statement data: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	bs := block.BlockSize()
	if len(data) == 0 || len(data)%bs != 0 {
		return "", errors.New("statement data is not whole AES blocks")
	}
	out := make([]byte, len(data))
	for i := 0; i < len(data); i += bs { // ECB
		block.Decrypt(out[i:i+bs], data[i:i+bs])
	}
	pad := int(out[len(out)-1])
	if pad < 1 || pad > bs {
		return "", errors.New("statement data has bad padding")
	}
	return string(out[:len(out)-pad]), nil
}

// snippet is a page's visible text, cut short, for error messages.
func snippet(page string) string {
	t := regexp.MustCompile(`(?s)<(script|style)[^>]*>.*?</(script|style)>|<[^>]+>`).ReplaceAllString(page, " ")
	t = strings.Join(strings.Fields(html.UnescapeString(t)), " ")
	if len(t) > 300 {
		t = t[:300]
	}
	return t
}

// Statement is everything read from one statement page.
type Statement struct {
	AccountNo, CustomerName, CustomerID, CustomerAddress string
	PeriodFrom, PeriodTo                                 time.Time
	AccountType, ProductType, Currency                   string
	JointHolder1, JointHolder2, Nominee, AccountStatus   string
	AccountOpenedOn                                      *time.Time
	ODLimit, HoldBalance, ExpectedAQB, AvailableBalance  *float64
	BranchName, BranchAddress, BranchPhone, IFSC, MICR   string
	OpeningBalance, DebitAmount, CreditAmount, Closing   *float64
	DebitCount, CreditCount                              *int
	StatementRef                                         string
	HTML                                                 string // scripts and embedded images removed
	Lines                                                []Line
}

// Line is one transaction row.
type Line struct {
	TxnDate, ValueDate                        *time.Time
	Narration, RefNo, TxnType                 string
	Withdrawal, Deposit, ClosingBalance, Col8 *float64
}

type textNode struct{ id, text string }

// ParseStatement reads the decrypted statement page.
func ParseStatement(page string) (*Statement, error) {
	doc, err := html.Parse(strings.NewReader(page))
	if err != nil {
		return nil, err
	}
	// Every visible text in order, with the id of its nearest element that
	// has one. Fields are read by id where HDFC gives them a stable one, and
	// by "the text after this label" elsewhere.
	var texts []textNode
	var table *html.Node
	var walk func(n *html.Node, id string)
	walk = func(n *html.Node, id string) {
		if n.Type == html.ElementNode {
			if n.Data == "script" || n.Data == "style" {
				return
			}
			if v := attr(n, "id"); v != "" {
				id = v
			}
			if n.Data == "table" && table == nil && strings.Contains(nodeText(n), "Transaction details") {
				table = n
			}
		}
		if n.Type == html.TextNode {
			if t := clean(n.Data); t != "" {
				texts = append(texts, textNode{id, t})
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c, id)
		}
	}
	walk(doc, "")

	byID := func(id string) string {
		var parts []string
		for _, t := range texts {
			if t.id == id {
				parts = append(parts, t.text)
			}
		}
		return strings.Join(parts, " ")
	}
	after := func(label string) string {
		for i, t := range texts {
			if strings.EqualFold(t.text, label) && i+1 < len(texts) {
				return texts[i+1].text
			}
		}
		return ""
	}

	s := &Statement{
		AccountNo:        byID("AccNo"),
		CustomerName:     byID("FS_Custom_Full_Name"),
		CustomerID:       byID("P_Cust_ID1"),
		CustomerAddress:  byID("P_ADD1"),
		AccountType:      after("Type of Account"),
		ProductType:      after("Product Type"),
		Currency:         byID("Pt_Currency_content"),
		JointHolder1:     byID("Pt_jhname1_content"),
		JointHolder2:     byID("Pt_jhname2_content"),
		Nominee:          byID("Pt_Nominee_content"),
		AccountStatus:    byID("Pt_Acountstatus_content"),
		AccountOpenedOn:  date("02 Jan 2006", byID("Pt_accountopened_content")),
		ODLimit:          amount(byID("Pt_odlimit_content")),
		HoldBalance:      amount(byID("Pt_HB_content")),
		ExpectedAQB:      amount(byID("Pt_AQB_content")),
		AvailableBalance: amount(byID("Aval_Bal")),
		BranchName:       byID("Pt_branch_content"),
		BranchAddress:    byID("Pt_branchadd_content"),
		BranchPhone:      byID("Pt_branchph_content"),
		IFSC:             byID("Pt_neft_content"),
		MICR:             byID("Pt_micr_content"),
		OpeningBalance:   amount(after("Opening Balance")),
		DebitAmount:      amount(after("Debit Amount")),
		CreditAmount:     amount(after("Credit Amount")),
		Closing:          amount(after("Closing Balance")),
		DebitCount:       count(after("Debit Count")),
		CreditCount:      count(after("Credit Count")),
		StatementRef:     byID("BlockText215"),
	}
	from, to := date("02/01/2006", byID("P_FROM_DATE1")), date("02/01/2006", byID("P_TO_DATE1"))
	if s.AccountNo == "" || from == nil || to == nil {
		return nil, errors.New("statement page not as expected: account number or period missing")
	}
	s.PeriodFrom, s.PeriodTo = *from, *to

	if table != nil {
		for _, tr := range findAll(table, "tr") {
			tds := findAll(tr, "td")
			if len(tds) < 7 {
				continue
			}
			cell := func(i int) string {
				if i < len(tds) {
					return clean(nodeText(tds[i]))
				}
				return ""
			}
			s.Lines = append(s.Lines, Line{
				TxnDate:        date("02/01/2006", cell(0)),
				Narration:      cell(1),
				RefNo:          cell(2),
				ValueDate:      date("02-01-2006", cell(3)),
				Withdrawal:     amount(cell(4)),
				Deposit:        amount(cell(5)),
				ClosingBalance: amount(cell(6)),
				Col8:           amount(cell(7)),
				TxnType:        cell(8),
			})
		}
	}
	if s.DebitCount != nil && s.CreditCount != nil && len(s.Lines) != *s.DebitCount+*s.CreditCount {
		return nil, fmt.Errorf("statement says %d debits + %d credits but %d lines were read", *s.DebitCount, *s.CreditCount, len(s.Lines))
	}

	s.HTML = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(page, "")
	s.HTML = regexp.MustCompile(`data:[a-zA-Z/+.-]+;base64,[A-Za-z0-9+/=\s]+`).ReplaceAllString(s.HTML, "")
	return s, nil
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func nodeText(n *html.Node) string {
	var b strings.Builder
	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
			b.WriteByte(' ')
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(n)
	return b.String()
}

func findAll(n *html.Node, tag string) []*html.Node {
	var out []*html.Node
	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == tag {
			out = append(out, n)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(n)
	return out
}

// clean collapses whitespace (HDFC pads with &nbsp; and double spaces).
func clean(s string) string {
	return strings.Join(strings.Fields(strings.ReplaceAll(s, " ", " ")), " ")
}

// amount reads "-63,71,776.55"; "-" or blank is no amount.
func amount(s string) *float64 {
	s = strings.ReplaceAll(strings.TrimSpace(s), ",", "")
	if s == "" || s == "-" {
		return nil
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil
	}
	return &f
}

func count(s string) *int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return nil
	}
	return &n
}

func date(layout, s string) *time.Time {
	t, err := time.Parse(layout, strings.TrimSpace(s))
	if err != nil {
		return nil
	}
	return &t
}
