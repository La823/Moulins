package bankstatements

import (
	"crypto/aes"
	"encoding/base64"
	"strconv"
	"strings"
	"testing"
)

// unscramble is what HDFC's server must do with scramble's output.
func unscramble(t *testing.T, hex string) string {
	const key = "toUpperCase"
	b := make([]int, len(hex)/2)
	for i := range b {
		v, err := strconv.ParseUint(hex[2*i:2*i+2], 16, 8)
		if err != nil {
			t.Fatal(err)
		}
		b[i] = int(v)
	}
	var out strings.Builder
	for i := 1; i < len(b); i++ {
		c := ((b[i] ^ int(key[(i-1)%len(key)])) - b[i-1] + 255) % 255
		out.WriteByte(byte(c))
	}
	return out.String()
}

func TestScrambleRoundTrip(t *testing.T) {
	in := "Vv6H0x2bU1Zd5LkP9qR3sT7uW1yX4zA2cE6gI8kM0oTEST1234"
	for range 50 { // the first byte is random
		got := scramble(in)
		if got != strings.ToUpper(got) || len(got) != 2*(len(in)+1) {
			t.Fatalf("bad shape %q", got)
		}
		if back := unscramble(t, got); back != in {
			t.Fatalf("round trip: got %q", back)
		}
	}
}

// Same as the page's JS: the first character is shifted by the random first
// byte and XORed with 't'.
func TestScrambleFirstByte(t *testing.T) {
	got := scramble("M")
	seed, _ := strconv.ParseUint(got[:2], 16, 8)
	want := ((int('M') + int(seed)) % 255) ^ int('t')
	if g, _ := strconv.ParseUint(got[2:4], 16, 8); int(g) != want {
		t.Fatalf("first char: got %02X want %02X", g, want)
	}
}

func TestDecryptAES(t *testing.T) {
	key := []byte("0123456789abcdef")
	plain := []byte("<html>statement</html>")
	pad := 16 - len(plain)%16
	for range pad {
		plain = append(plain, byte(pad))
	}
	block, _ := aes.NewCipher(key)
	ct := make([]byte, len(plain))
	for i := 0; i < len(plain); i += 16 {
		block.Encrypt(ct[i:i+16], plain[i:i+16])
	}
	got, err := decryptAES(base64.StdEncoding.EncodeToString(key), base64.StdEncoding.EncodeToString(ct))
	if err != nil || got != "<html>statement</html>" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestStatementLink(t *testing.T) {
	h := `<a href="https://smartstatements.hdfc.bank.in/HDFCRestFulService/GetStatement.jsp?jobkey=12ab&amp;utm_tag=View">View</a>`
	if got := statementLink(h); got != "https://smartstatements.hdfc.bank.in/HDFCRestFulService/GetStatement.jsp?jobkey=12ab&utm_tag=View" {
		t.Fatalf("got %q", got)
	}
}

func TestParseStatementMinimal(t *testing.T) {
	page := `<html><body>
	<p id="FS_Custom_Full_Name">M/s.  Example Traders</p>
	<label id="P_Cust_ID1">11111111</label>
	<label id="P_FROM_DATE1">11/11/2026</label><label id="P_TO_DATE1">11/11/2026</label>
	<p>Type of Account</p><p>Current Account</p><p>Product Type</p><p>MSME - FLEXI PLUS ACCOUNT</p>
	<label id="AccNo">99990000001111</label>
	<label id="Pt_odlimit_content">10000000.00</label>
	<label id="Pt_accountopened_content">03 Jun 2026</label>
	<p>Opening Balance</p><p>-63,71,776.55 </p><p>Debit Amount</p><p>55,679.00</p>
	<p>Credit&nbsp; Amount</p><p>0.00</p><p>Closing Balance</p><p>-64,27,455.55</p>
	<p>Debit Count</p><p>1</p><p>Credit Count</p><p>0</p>
	<table><thead><tr><th>Date</th><th>Transaction details</th></tr></thead><tbody>
	<tr><td>11/11/2026</td><td>CHQ PAID-CTS S4-SOME BRANCH</td><td>000000000327</td><td>11-11-2026</td>
	    <td>55,679.00</td><td>-</td><td>-64,27,455.55</td><td>55,679.00</td><td>Cheque Txn</td></tr>
	</tbody></table>
	<img src="data:image/png;base64,AAAA"><script>x()</script></body></html>`
	s, err := ParseStatement(page)
	if err != nil {
		t.Fatal(err)
	}
	if s.AccountNo != "99990000001111" || s.ProductType != "MSME - FLEXI PLUS ACCOUNT" || s.AccountType != "Current Account" ||
		s.CustomerName != "M/s. Example Traders" || s.PeriodFrom.Format("2006-01-02") != "2026-11-11" {
		t.Fatalf("header: %+v", s)
	}
	if *s.OpeningBalance != -6371776.55 || *s.CreditAmount != 0 || *s.ODLimit != 10000000 || s.AccountOpenedOn.Day() != 3 {
		t.Fatalf("amounts: open %v credit %v limit %v", *s.OpeningBalance, *s.CreditAmount, *s.ODLimit)
	}
	if len(s.Lines) != 1 {
		t.Fatalf("lines: %d", len(s.Lines))
	}
	l := s.Lines[0]
	if l.RefNo != "000000000327" || *l.Withdrawal != 55679 || l.Deposit != nil || l.TxnType != "Cheque Txn" || l.ValueDate == nil {
		t.Fatalf("line: %+v", l)
	}
	if strings.Contains(s.HTML, "base64,AAAA") || strings.Contains(s.HTML, "x()") {
		t.Fatal("stored html still has images or scripts")
	}
}

// A page claiming more lines than it has must fail, not save a short statement.
func TestParseStatementCountMismatch(t *testing.T) {
	page := `<label id="AccNo">1</label><label id="P_FROM_DATE1">11/11/2026</label><label id="P_TO_DATE1">11/11/2026</label>
	<p>Debit Count</p><p>2</p><p>Credit Count</p><p>0</p>`
	if _, err := ParseStatement(page); err == nil {
		t.Fatal("expected a count mismatch error")
	}
}
