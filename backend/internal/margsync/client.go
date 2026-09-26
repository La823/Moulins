// Package margsync talks to the Marg ERP "Live Order API" (EDE) and mirrors
// its master data (products, party ledgers) into local tables.
//
// Ported from api test/marg_api.py + api test/Decryptionlogic.txt: every
// response is base64 -> AES-128-CBC decrypt (key bytes reused as the IV,
// per Marg's own scheme, not a bug to "fix") -> base64 -> raw deflate
// decompress -> JSON.
package margsync

import (
	"bytes"
	"compress/flate"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const baseURL = "https://corporate.margerp.com/api/eOnlineData"

// Credentials holds the client identity Marg issues per integration.
type Credentials struct {
	CompanyCode string
	MargID      int
	APIKey      string
}

// CredentialsFromEnv reads MARG_COMPANY_CODE / MARG_ID / MARG_API_KEY.
// Returns an error (not log.Fatal) since a missing/misconfigured Marg
// integration shouldn't take down the rest of the API.
func CredentialsFromEnv() (Credentials, error) {
	companyCode := os.Getenv("MARG_COMPANY_CODE")
	apiKey := os.Getenv("MARG_API_KEY")
	margIDStr := os.Getenv("MARG_ID")
	if companyCode == "" || apiKey == "" || margIDStr == "" {
		return Credentials{}, fmt.Errorf("MARG_COMPANY_CODE, MARG_ID, and MARG_API_KEY must all be set")
	}
	var margID int
	if _, err := fmt.Sscanf(margIDStr, "%d", &margID); err != nil {
		return Credentials{}, fmt.Errorf("MARG_ID must be an integer: %w", err)
	}
	return Credentials{CompanyCode: companyCode, MargID: margID, APIKey: apiKey}, nil
}

// keyBytes fits the UTF-8 key into a 16-byte buffer (zero-padded/truncated),
// matching the C# reference exactly: the same bytes are reused as the IV.
func keyBytes(key string) []byte {
	buf := make([]byte, 16)
	copy(buf, []byte(key))
	return buf
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty data")
	}
	padLen := int(data[len(data)-1])
	if padLen <= 0 || padLen > len(data) {
		return nil, fmt.Errorf("invalid PKCS7 padding")
	}
	return data[:len(data)-padLen], nil
}

func decrypt(data, key string) (string, error) {
	encrypted, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	k := keyBytes(key)
	block, err := aes.NewCipher(k)
	if err != nil {
		return "", err
	}
	if len(encrypted)%aes.BlockSize != 0 {
		return "", fmt.Errorf("ciphertext is not a multiple of the block size")
	}
	mode := cipher.NewCBCDecrypter(block, k) // IV = key, per Marg's scheme
	padded := make([]byte, len(encrypted))
	mode.CryptBlocks(padded, encrypted)
	plain, err := pkcs7Unpad(padded)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// decompress base64-decodes then raw-deflate decompresses (no zlib/gzip
// header — matches .NET's DeflateStream, despite the Python reference
// naming the variable "gzip").
func decompress(compressed string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(compressed)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	r := flate.NewReader(bytes.NewReader(raw))
	defer r.Close()
	out, err := io.ReadAll(r)
	if err != nil {
		return "", fmt.Errorf("deflate decompress: %w", err)
	}
	return string(out), nil
}

// unwrapResponse runs the full pipeline: response text -> decrypted ->
// decompressed -> JSON text. Some server responses (rate-limit / error
// messages, e.g. "Full sync limit exceeded") skip AES entirely and are
// only base64 + raw-deflate — if the normal AES+deflate unwrap fails,
// fall back to deflate-only (matches api test/webtool/server.py's
// unwrap_with_fallback).
func unwrapResponse(responseText, key string) (string, error) {
	decrypted, err := decrypt(responseText, key)
	if err == nil {
		if decompressed, derr := decompress(decrypted); derr == nil {
			return decompressed, nil
		}
	}

	decompressed, ferr := decompress(responseText)
	if ferr == nil {
		return decompressed, nil
	}

	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return "", fmt.Errorf("decompress: %w", ferr)
}

// A large delta (a couple of days of a distributor's activity, or a full
// pull of ~3,000 batch rows) regularly takes Marg well over a minute to
// assemble before it sends the first byte, so 60s was low enough to fail
// real syncs. The sync runs in the background and is bounded separately by
// the run's own 2h context, so a generous client timeout costs nothing.
var httpClient = &http.Client{Timeout: 5 * time.Minute}

func post(endpoint string, payload interface{}) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, baseURL+"/"+endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("marg API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// The body is a JSON string literal (quoted), not bare base64 — unquote it.
	var text string
	if err := json.Unmarshal(respBody, &text); err != nil {
		text = string(respBody)
	}
	return text, nil
}

type mst2017Request struct {
	CompanyCode string `json:"CompanyCode"`
	MargID      int    `json:"MargID"`
	Datetime    string `json:"Datetime"`
	Index       int    `json:"Index"`
}

// MargProductRow mirrors one pro_N/pro_U line exactly as Marg sends it.
type MargProductRow struct {
	Rid        string `json:"rid"`
	CatCode    string `json:"catcode"`
	Code       string `json:"code"`
	Name       string `json:"name"`
	Stock      string `json:"stock"`
	Remark     string `json:"remark"`
	Company    string `json:"company"`
	ShopCode   string `json:"shopcode"`
	MRP        string `json:"MRP"`
	Rate       string `json:"Rate"`
	Deal       string `json:"Deal"`
	Free       string `json:"Free"`
	PRate      string `json:"PRate"`
	IsDeleted  string `json:"Is_Deleted"`
	CurBatch   string `json:"curbatch"`
	Exp        string `json:"exp"`
	GCode      string `json:"gcode"`
	MargCode   string `json:"MargCode"`
	Conversion string `json:"Conversion"`
	Salt       string `json:"Salt"`
	Gcode6     string `json:"Gcode6"`
	// Rate tiers. These arrive as JSON *numbers*, unlike MRP/Rate/PRate
	// above which Marg sends as strings — declaring them as string would
	// make the whole row fail to unmarshal. RateF is not a duplicate of
	// PRate: it differs on ~6% of rows.
	RateB float64 `json:"RateB"`
	RateC float64 `json:"RateC"`
	RateD float64 `json:"RateD"`
	RateF float64 `json:"RateF"`
}

// MargRateRow is one pro_R line — Marg's "rate-only update" feed. It has no
// name/rid/Is_Deleted, just a code plus the current pricing and stock, and
// note "Curbatch" is capitalised here where pro_N spells it "curbatch".
type MargRateRow struct {
	Code     string  `json:"code"`
	CurBatch string  `json:"Curbatch"`
	Stock    string  `json:"stock"`
	MRP      string  `json:"MRP"`
	Rate     string  `json:"Rate"`
	PRate    string  `json:"PRate"`
	Deal     string  `json:"Deal"`
	Free     string  `json:"Free"`
	RateB    float64 `json:"RateB"`
	RateC    float64 `json:"RateC"`
	RateD    float64 `json:"RateD"`
	RateF    float64 `json:"RateF"`
}

// MargStockRow is one pro_S line — Marg's "stock-only update" feed.
type MargStockRow struct {
	Code  string `json:"code"`
	Stock string `json:"stock"`
}

// MargStypeRow is one row of Marg's generic sub-master/lookup table. Rows
// are grouped by Sgcode (e.g. "AREA", "SALT", "COMMCD") and within a group,
// Scode is the short reference code other rows point to and Name is the
// human-readable value it resolves to. Product rows reference the "COMMCD"
// (commodity code / HSN) group via their Gcode6 field.
type MargStypeRow struct {
	Rid       string `json:"rid"`
	Sgcode    string `json:"sgcode"`
	Scode     string `json:"scode"`
	Name      string `json:"name"`
	IsDeleted string `json:"Is_Deleted"`
}

// MargPartyRow mirrors one Party line exactly as Marg sends it.
type MargPartyRow struct {
	Rid        string `json:"rid"`
	Area       string `json:"area"`
	Code       string `json:"code"`
	Address    string `json:"address"`
	Name       string `json:"name"`
	Balance    string `json:"balance"`
	Pdc        string `json:"pdc"`
	Gcode      string `json:"gcode"`
	Opening    string `json:"opening"`
	IsDeleted  string `json:"Is_Deleted"`
	Phone1     string `json:"phone1"`
	Phone2     string `json:"phone2"`
	Phone3     string `json:"phone3"`
	Phone4     string `json:"phone4"`
	Email1     string `json:"email1"`
	Email2     string `json:"email2"`
	Email3     string `json:"email3"`
	Bank       string `json:"bank"`
	Branch     string `json:"branch"`
	MargCode   string `json:"MargCode"`
	GSTIN      string `json:"GSTIN"`
	DlNo       string `json:"DlNo"`
	LedgerCode string `json:"LedgerCode"`
}

type mst2017Details struct {
	ProN     []MargProductRow `json:"pro_N"`
	ProU     []MargProductRow `json:"pro_U"`
	// pro_R / pro_S are delta-only feeds that were previously parsed into
	// nothing at all, so a rate or stock change delivered through them was
	// dropped on the floor.
	ProR     []MargRateRow    `json:"pro_R"`
	ProS     []MargStockRow   `json:"pro_S"`
	Stype    []MargStypeRow   `json:"Stype"`
	Party    []MargPartyRow   `json:"Party"`
	Status   string           `json:"Status"`
	Message  string           `json:"Message"`
	DateTime string           `json:"DateTime"`
	// Datastatus is Marg's own completeness flag ("Completed" on a whole
	// response). It used to be parsed into nothing at all, which meant a
	// short-but-"Sucess" response was applied as if it were complete —
	// see ValidatePull.
	Datastatus string `json:"Datastatus"`
}

// Datastatus / DateTime / row-count accessors, so callers outside this
// package (the sync runner) can inspect a parsed pull without the struct
// itself needing to be exported.
func (d mst2017Details) Datastatus_() string { return d.Datastatus }
func (d mst2017Details) DateTime_() string   { return d.DateTime }
func (d mst2017Details) RowCount() int       { return len(d.ProN) + len(d.ProU) }
func (d mst2017Details) PartyCount() int     { return len(d.Party) }

type mst2017Response struct {
	Details mst2017Details `json:"Details"`
}

// ParseMST2017JSON parses an already-decrypted MargMST2017 JSON payload
// (Details.pro_N/pro_U/Party/...). Used to seed from a previously captured
// full pull when Marg's full-sync rate limit is in effect, bypassing the
// network fetch + decrypt steps.
func ParseMST2017JSON(jsonBytes []byte) (mst2017Details, error) {
	jsonBytes = bytes.TrimPrefix(jsonBytes, []byte{0xEF, 0xBB, 0xBF})
	var parsed mst2017Response
	if err := json.Unmarshal(jsonBytes, &parsed); err != nil {
		return mst2017Details{}, fmt.Errorf("parse MargMST2017 JSON: %w", err)
	}
	return parsed.Details, nil
}

type liveOrderDispatchStatusRequest struct {
	CompanyCode string `json:"CompanyCode"`
	MargID      int    `json:"MargID"`
	SalesmanID  string `json:"SalesmanID"`
	Type        string `json:"Type"`
	Datetime    string `json:"Datetime"`
	Index       string `json:"index"`
}

// FetchLiveOrderDispatchStatusRaw calls LiveOrderDispatchStatus2017 and
// returns the decrypted/decompressed JSON as-is, for inspecting the actual
// response shape before committing to a parsed struct.
func FetchLiveOrderDispatchStatusRaw(creds Credentials, salesmanID, datetime string) (string, error) {
	return FetchLiveOrderDispatchStatusRawWithIndex(creds, salesmanID, datetime, "0")
}

// FetchLiveOrderDispatchStatusRawWithIndex is the same call with an
// explicit index — the response's own "Index" field may be a pagination
// cursor for a follow-up call rather than a fixed value, still being
// verified.
func FetchLiveOrderDispatchStatusRawWithIndex(creds Credentials, salesmanID, datetime, index string) (string, error) {
	respText, err := post("LiveOrderDispatchStatus2017", liveOrderDispatchStatusRequest{
		CompanyCode: creds.CompanyCode,
		MargID:      creds.MargID,
		SalesmanID:  salesmanID,
		Type:        "S",
		Datetime:    datetime,
		Index:       index,
	})
	if err != nil {
		return "", err
	}
	return unwrapResponse(respText, creds.APIKey)
}

// FetchMST2017Raw calls MargMST2017 and returns the decrypted/decompressed
// JSON as-is, before parsing — for inspecting/capturing the actual response
// shape. Same datetime semantics as FetchMST2017 (blank = full pull).
func FetchMST2017Raw(creds Credentials, datetime string) (string, error) {
	respText, err := post("MargMST2017", mst2017Request{
		CompanyCode: creds.CompanyCode,
		MargID:      creds.MargID,
		Datetime:    datetime,
		Index:       0,
	})
	if err != nil {
		return "", err
	}
	return unwrapResponse(respText, creds.APIKey)
}

// FetchMST2017 pulls master data (products + party ledgers). datetime blank
// = full pull; a prior sync's DateTime = delta pull (only what changed).
func FetchMST2017(creds Credentials, datetime string) (mst2017Details, error) {
	respText, err := post("MargMST2017", mst2017Request{
		CompanyCode: creds.CompanyCode,
		MargID:      creds.MargID,
		Datetime:    datetime,
		Index:       0,
	})
	if err != nil {
		return mst2017Details{}, err
	}

	jsonText, err := unwrapResponse(respText, creds.APIKey)
	if err != nil {
		return mst2017Details{}, fmt.Errorf("unwrap MargMST2017 response: %w", err)
	}
	jsonBytes := bytes.TrimPrefix([]byte(jsonText), []byte{0xEF, 0xBB, 0xBF}) // strip UTF-8 BOM some responses include

	var parsed mst2017Response
	if err := json.Unmarshal(jsonBytes, &parsed); err != nil {
		return mst2017Details{}, fmt.Errorf("parse MargMST2017 JSON: %w", err)
	}
	if parsed.Details.Status != "" && parsed.Details.Status != "Sucess" && parsed.Details.Status != "Success" {
		// "No Record Found" on a delta pull just means nothing changed
		// since lastSyncedAt — a normal, successful no-op, not a failure.
		if strings.Contains(parsed.Details.Message, "No Record Found") || parsed.Details.Status == "No Record Found" {
			return mst2017Details{DateTime: datetime}, nil
		}
		return mst2017Details{}, fmt.Errorf("marg MST2017 returned status %q: %s", parsed.Details.Status, parsed.Details.Message)
	}
	return parsed.Details, nil
}

// InsertOrderLineRequest is one call to InsertOrderDetail — one order line.
// Every field is sent as a string, matching Marg's own captured test
// payload (api test/insert_order_test_payload.json), including the
// numeric-looking ones — not a transcription error, that's what their
// server actually expects.
type InsertOrderLineRequest struct {
	OrderID           string `json:"OrderID"`
	OrderNo           string `json:"OrderNo"`
	CustomerID        string `json:"CustomerID"`
	MargID            string `json:"MargID"`
	Type              string `json:"Type"`
	Sid               string `json:"Sid"`
	ProductCode       string `json:"ProductCode"`
	Quantity          string `json:"Quantity"`
	Free              string `json:"Free"`
	Lat               string `json:"Lat"`
	Lng               string `json:"Lng"`
	Address           string `json:"Address"`
	GpsID             string `json:"GpsID"`
	UserType          string `json:"UserType"`
	Points            string `json:"Points"`
	Discounts         string `json:"Discounts"`
	Transport         string `json:"Transport"`
	Delivery          string `json:"Delivery"`
	Bankname          string `json:"Bankname"`
	BankAdd1          string `json:"BankAdd1"`
	BankAdd2          string `json:"BankAdd2"`
	ShipName          string `json:"shipname"`
	ShipAdd1          string `json:"shipAdd1"`
	ShipAdd2          string `json:"shipAdd2"`
	ShipAdd3          string `json:"shipAdd3"`
	PaymentMode       string `json:"paymentmode"`
	PaymentModeAmount string `json:"paymentmodeAmount"`
	PaymentRemarks    string `json:"payment_remarks"`
	OrderRemarks      string `json:"order_remarks"`
	CustMobile        string `json:"CustMobile"`
	CompanyCode       string `json:"CompanyCode"`
	OrderFrom         string `json:"OrderFrom"`
}

type insertOrderDetailEntry struct {
	OrderID string `json:"OrderID"`
	OrderNo string `json:"OrderNo"`
}

type insertOrderDetailInner struct {
	OrderDetails []insertOrderDetailEntry `json:"OrderDetails"`
	CustomerID   string                   `json:"CustomerID"`
	Status       string                   `json:"Status"`
	Message      string                   `json:"Message"`
}

type insertOrderDetailResponse struct {
	Details insertOrderDetailInner `json:"Details"`
}

// InsertOrderDetailResult is the parsed, successful outcome of one
// InsertOrderDetail call.
type InsertOrderDetailResult struct {
	OrderID string
	OrderNo string
}

// InsertOrderDetail pushes one order line into Marg ERP. Call once per
// product line, reusing the same req.OrderID across all lines of one order
// (per api test/API_Reference.txt §2.3).
func InsertOrderDetail(creds Credentials, req InsertOrderLineRequest) (InsertOrderDetailResult, error) {
	respText, err := post("InsertOrderDetail", req)
	if err != nil {
		return InsertOrderDetailResult{}, err
	}

	jsonText, err := unwrapResponse(respText, creds.APIKey)
	if err != nil {
		return InsertOrderDetailResult{}, fmt.Errorf("unwrap InsertOrderDetail response: %w", err)
	}
	jsonBytes := bytes.TrimPrefix([]byte(jsonText), []byte{0xEF, 0xBB, 0xBF})

	var parsed insertOrderDetailResponse
	if err := json.Unmarshal(jsonBytes, &parsed); err != nil {
		return InsertOrderDetailResult{}, fmt.Errorf("parse InsertOrderDetail JSON: %w", err)
	}
	if parsed.Details.Status != "" && parsed.Details.Status != "Sucess" && parsed.Details.Status != "Success" {
		return InsertOrderDetailResult{}, fmt.Errorf("marg InsertOrderDetail returned status %q: %s", parsed.Details.Status, parsed.Details.Message)
	}
	if len(parsed.Details.OrderDetails) == 0 {
		return InsertOrderDetailResult{}, fmt.Errorf("marg InsertOrderDetail returned no OrderDetails")
	}
	return InsertOrderDetailResult{
		OrderID: parsed.Details.OrderDetails[0].OrderID,
		OrderNo: parsed.Details.OrderDetails[0].OrderNo,
	}, nil
}
