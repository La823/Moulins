package margede

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PartyContact is what a printed bill shows about its party, from the Marg
// ledger (marg_ede_ledger). Empty fields are "".
type PartyContact struct {
	Name    string
	Address []string // address lines, then "City - PIN"
	GSTIN   string
	DLNo    string
	Phone   string
}

// BillPartyContact looks a bill's party up in the Marg ledger by its code.
// ok is false when the code isn't in the ledger. A code can appear more than
// once there (CID is not unique); a live entry is preferred.
func BillPartyContact(ctx context.Context, db *pgxpool.Pool, partyCode string) (PartyContact, bool, error) {
	var name string
	var a1, a2, a3, city, pin, gstin, dl, p1, p2 *string
	err := db.QueryRow(ctx, `
		SELECT name, address1, address2, address3, city, pin, gstin, dl_no, phone1, phone2
		FROM marg_ede_ledger
		WHERE party_code = $1
		ORDER BY marg_deleted, marg_id DESC
		LIMIT 1`, partyCode).Scan(&name, &a1, &a2, &a3, &city, &pin, &gstin, &dl, &p1, &p2)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PartyContact{}, false, nil
		}
		return PartyContact{}, false, err
	}
	s := func(p *string) string {
		if p == nil {
			return ""
		}
		return strings.TrimSpace(*p)
	}
	c := PartyContact{Name: name, GSTIN: s(gstin), DLNo: s(dl)}
	for _, l := range []string{s(a1), s(a2), s(a3)} {
		if l != "" {
			c.Address = append(c.Address, l)
		}
	}
	// "City - PIN", unless the address lines already say it
	joined := strings.ToUpper(strings.Join(c.Address, " "))
	cityPart, pinPart := s(city), s(pin)
	if cityPart != "" && strings.Contains(joined, strings.ToUpper(cityPart)) {
		cityPart = ""
	}
	if pinPart != "" && strings.Contains(joined, pinPart) {
		pinPart = ""
	}
	if place := strings.TrimSpace(strings.Trim(cityPart+" - "+pinPart, " -")); place != "" {
		c.Address = append(c.Address, place)
	}
	for _, p := range []string{s(p1), s(p2)} {
		if p != "" {
			if c.Phone != "" {
				c.Phone += ", "
			}
			c.Phone += p
		}
	}
	return c, true, nil
}
