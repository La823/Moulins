// Package margede pulls bills from Marg's Corporate EDE API
// (MargCorporateEDE) into marg_ede_bills / marg_ede_bill_items.
//
// The API returns the whole current financial year in one response: bill
// headers (MDis), bill lines (Dis), plus master blobs (Party, Product,
// Stock, SaleType) that are not stored yet. Transport and decryption are the
// same as the MargMST2017 API, so they are reused from margsync.
//
// Explored and documented in apiTest2Corporate/ before this was written.
package margede

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/lavanyaarora/server/internal/margsync"
)

const endpoint = "MargCorporateEDE"

// maxPages bounds the Index/Datastatus paging loop. Every pull seen so far
// came back "Completed" in one page.
const maxPages = 50

// Credentials for the Corporate EDE integration. These are a different
// company code and keys from the MARG_* ones margsync uses.
type Credentials struct {
	CompanyCode   string
	MargKey       string
	CompanyID     string
	DecryptionKey string
}

// CredentialsFromEnv reads MARG_EDE_COMPANY_CODE / MARG_EDE_MARG_KEY /
// MARG_EDE_COMPANY_ID / MARG_EDE_DECRYPTION_KEY.
func CredentialsFromEnv() (Credentials, error) {
	c := Credentials{
		CompanyCode:   os.Getenv("MARG_EDE_COMPANY_CODE"),
		MargKey:       os.Getenv("MARG_EDE_MARG_KEY"),
		CompanyID:     os.Getenv("MARG_EDE_COMPANY_ID"),
		DecryptionKey: os.Getenv("MARG_EDE_DECRYPTION_KEY"),
	}
	if c.CompanyCode == "" || c.MargKey == "" || c.CompanyID == "" || c.DecryptionKey == "" {
		return Credentials{}, fmt.Errorf("MARG_EDE_COMPANY_CODE, MARG_EDE_MARG_KEY, MARG_EDE_COMPANY_ID and MARG_EDE_DECRYPTION_KEY must all be set")
	}
	return c, nil
}

type request struct {
	CompanyCode string `json:"CompanyCode"`
	Datetime    string `json:"Datetime"`
	MargKey     string `json:"MargKey"`
	Index       string `json:"Index"`
	CompanyID   string `json:"CompanyID"`
	APIType     string `json:"APIType"`
}

// BillRow is one MDis entry exactly as Marg sends it (strings space-padded,
// numbers as floats, dates as "2026-10-17T00:00:00").
type BillRow struct {
	ID       int64   `json:"ID"`
	Voucher  float64 `json:"Voucher"`
	Type     string  `json:"Type"`
	VCN      string  `json:"VCN"`
	Date     string  `json:"Date"`
	CID      string  `json:"CID"`
	Final    float64 `json:"Final"`
	Cash     float64 `json:"Cash"`
	Others   float64 `json:"Others"`
	Salun    string  `json:"Salun"`
	MR       string  `json:"MR"`
	Rout     string  `json:"Rout"`
	Area     string  `json:"Area"`
	ORN      string  `json:"ORN"`
	AddField string  `json:"AddField"`
	ODate    string  `json:"ODate"`
}

// LineRow is one Dis entry exactly as Marg sends it.
type LineRow struct {
	ID        int64   `json:"ID"`
	Voucher   float64 `json:"Voucher"`
	Type      string  `json:"Type"`
	VCN       string  `json:"VCN"`
	Date      string  `json:"Date"`
	CID       string  `json:"CID"`
	PID       float64 `json:"PID"`
	GCode     string  `json:"GCode"`
	Batch     string  `json:"Batch"`
	Qty       float64 `json:"Qty"`
	Free      float64 `json:"Free"`
	MRP       float64 `json:"MRP"`
	Rate      float64 `json:"Rate"`
	Discount  float64 `json:"Discount"`
	Amount    float64 `json:"Amount"`
	GST       float64 `json:"GST"`
	GSTAmount float64 `json:"GSTAmount"`
	AddField  string  `json:"AddField"`
}

// PartyRow is one Party (ledger account) entry exactly as Marg sends it.
type PartyRow struct {
	ID        int64   `json:"ID"`
	GSTNo     string  `json:"GSTNo"`
	Rout      string  `json:"Rout"`
	Area      string  `json:"Area"`
	MR        string  `json:"MR"`
	SCode     string  `json:"SCode"`
	CID       string  `json:"CID"`
	ParNam    string  `json:"ParNam"`
	ParAdd    string  `json:"PARADD"`
	ParAdd1   string  `json:"ParAdd1"`
	ParAdd2   string  `json:"ParAdd2"`
	Rate      string  `json:"Rate"`
	Phone1    string  `json:"Phone1"`
	Phone2    string  `json:"Phone2"`
	Phone3    string  `json:"Phone3"`
	Phone4    string  `json:"Phone4"`
	Credit    float64 `json:"Credit"`
	CRDays    int     `json:"CRDays"`
	CRBills   int     `json:"CRBills"`
	CRStatus  string  `json:"CRStatus"`
	AddField  string  `json:"AddField"`
	DlNo      string  `json:"DlNo"`
	Pin       string  `json:"Pin"`
	Lat       string  `json:"Lat"`
	Lng       string  `json:"Lng"`
	IsDeleted string  `json:"Is_Deleted"`
}

// ProductRow is one Product entry exactly as Marg sends it.
type ProductRow struct {
	ID       int64   `json:"ID"`
	PID      float64 `json:"PID"`
	Code     string  `json:"Code"`
	Name     string  `json:"Name"`
	Unit     string  `json:"Unit"`
	Pack     float64 `json:"Pack"`
	GCode    string  `json:"GCode"`
	GCode3   string  `json:"GCode3"`
	GCode6   string  `json:"GCode6"`
	GST      float64 `json:"GST"`
	AddField string  `json:"AddField"`
}

// StockRow is one Stock (product batch) entry exactly as Marg sends it.
type StockRow struct {
	ID       int64   `json:"ID"`
	PID      float64 `json:"PID"`
	GCode    string  `json:"GCode"`
	Batch    string  `json:"Batch"`
	BatDate  string  `json:"BatDate"`
	Expiry   string  `json:"Expiry"`
	SupInvo  string  `json:"SupInvo"`
	SupDate  string  `json:"SupDate"`
	SupCode  string  `json:"SupCode"`
	Opening  float64 `json:"Opening"`
	Stock    float64 `json:"Stock"`
	BrkStock float64 `json:"BrkStock"`
	LPRate   float64 `json:"LPRate"`
	PRate    float64 `json:"PRate"`
	MRP      float64 `json:"MRP"`
	RateA    float64 `json:"RateA"`
	RateB    float64 `json:"RateB"`
	RateC    float64 `json:"RateC"`
	AddField string  `json:"AddField"`
}

// SaleTypeRow is one entry of Marg's code lists (HSN, company, form, ...).
type SaleTypeRow struct {
	SGCode string `json:"SGCode"`
	SCode  string `json:"SCode"`
	Name   string `json:"Name"`
}

// Details is the part of the response this package uses.
type Details struct {
	Bills      []BillRow     `json:"MDis"`
	Lines      []LineRow     `json:"Dis"`
	Products   []ProductRow  `json:"Product"`
	Parties    []PartyRow    `json:"Party"`
	Stock      []StockRow    `json:"Stock"`
	SaleTypes  []SaleTypeRow `json:"SaleType"`
	Index      string        `json:"Index"`
	Datastatus string        `json:"Datastatus"`
	Status     string        `json:"Status"`
	DateTime   string        `json:"DateTime"`
}

type response struct {
	Details Details `json:"Details"`
}

// ParseJSON parses a decrypted MargCorporateEDE response, e.g. one saved by
// apiTest2Corporate (raw/ede_page000_decrypted.json).
func ParseJSON(b []byte) (Details, error) {
	b = bytes.TrimPrefix(b, []byte{0xEF, 0xBB, 0xBF})
	var r response
	if err := json.Unmarshal(b, &r); err != nil {
		return Details{}, fmt.Errorf("parse MargCorporateEDE JSON: %w", err)
	}
	return r.Details, nil
}

// Fetch pulls bills. datetime "" = full pull (the whole current financial
// year); otherwise only what Marg recorded as changed since then (IST).
func Fetch(creds Credentials, datetime string) (Details, error) {
	var all Details
	index := "0"
	for page := 0; page < maxPages; page++ {
		text, err := margsync.PostAndUnwrap(endpoint, request{
			CompanyCode: creds.CompanyCode,
			Datetime:    datetime,
			MargKey:     creds.MargKey,
			Index:       index,
			CompanyID:   creds.CompanyID,
			APIType:     "2",
		}, creds.DecryptionKey)
		if err != nil {
			return Details{}, err
		}
		d, err := ParseJSON([]byte(text))
		if err != nil {
			return Details{}, err
		}
		if d.Status != "" && d.Status != "Sucess" && d.Status != "Success" {
			return Details{}, fmt.Errorf("marg returned status %q", d.Status)
		}
		all.Bills = append(all.Bills, d.Bills...)
		all.Lines = append(all.Lines, d.Lines...)
		all.Products = append(all.Products, d.Products...)
		all.Parties = append(all.Parties, d.Parties...)
		all.Stock = append(all.Stock, d.Stock...)
		all.SaleTypes = append(all.SaleTypes, d.SaleTypes...)
		all.Index, all.Datastatus, all.Status, all.DateTime = d.Index, d.Datastatus, d.Status, d.DateTime

		if strings.EqualFold(d.Datastatus, "Completed") || d.Index == "" || d.Index == index {
			return all, nil
		}
		index = d.Index
	}
	return Details{}, fmt.Errorf("marg did not report Datastatus=Completed after %d pages", maxPages)
}
