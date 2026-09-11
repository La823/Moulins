// Package purchaseordermaster serves the master purchase-order list —
// originally a one-off import of the old "Moulins" tracking sheet
// (migration 108), and now also where new POs are created directly
// (CreateHandler), continuing the same sr_no/po_number sequence.
package purchaseordermaster

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/mailer"
	"github.com/lavanyaarora/server/internal/models"
)

const defaultPageSize = 40

// GET /admin/purchase-order-master?page=1&pageSize=40
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
		if pageSize < 1 || pageSize > 200 {
			pageSize = defaultPageSize
		}
		sortColumn := r.URL.Query().Get("sortBy")
		sortDir := r.URL.Query().Get("sortDir")
		search := r.URL.Query().Get("search")
		poNumber := r.URL.Query().Get("poNumber")
		hasProductCode := r.URL.Query().Get("hasProductCode")
		status := r.URL.Query().Get("status")

		rows, total, err := models.ListPurchaseOrderMaster(r.Context(), db, pageSize, (page-1)*pageSize, sortColumn, sortDir, search, poNumber, hasProductCode, status)
		if err != nil {
			log.Printf("list purchase order master error: %v", err)
			http.Error(w, "could not fetch purchase order master list", http.StatusInternalServerError)
			return
		}

		missingProductCode, err := models.CountMissingProductCode(r.Context(), db)
		if err != nil {
			log.Printf("count missing product code error: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"rows":               rows,
			"total":              total,
			"page":               page,
			"pageSize":           pageSize,
			"missingProductCode": missingProductCode,
		})
	}
}

// GET /admin/purchase-order-master/active?limit=10
// Used by the /panel/purchase-orders overview page to show what's currently
// open — every PO defaults to status "Active" on creation.
func ListActiveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit < 1 || limit > 100 {
			limit = 10
		}

		rows, total, err := models.ListActivePurchaseOrders(r.Context(), db, limit)
		if err != nil {
			log.Printf("list active purchase orders error: %v", err)
			http.Error(w, "could not fetch active purchase orders", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"rows":  rows,
			"total": total,
		})
	}
}

// POST /admin/purchase-order-master — create a new PO directly in the
// master list (see CreatePurchaseOrderInMaster).
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateMasterPORequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ManufacturerID == uuid.Nil {
			http.Error(w, "manufacturer_id is required", http.StatusBadRequest)
			return
		}
		if req.ProductName == "" {
			http.Error(w, "product_name is required", http.StatusBadRequest)
			return
		}
		if req.PODate == "" {
			http.Error(w, "po_date is required", http.StatusBadRequest)
			return
		}

		id, poNumber, err := models.CreatePurchaseOrderInMaster(r.Context(), db, req)
		if err != nil {
			log.Printf("create master PO error: %v", err)
			http.Error(w, "could not create purchase order", http.StatusInternalServerError)
			return
		}

		models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), &poNumber, "created", nil, &req.ProductName, actorID(r))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]any{
			"id":        id,
			"po_number": poNumber,
		})
	}
}

// GET /admin/purchase-order-master/product-names?search=para&limit=15
func SearchProductNamesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := r.URL.Query().Get("search")
		if search == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]string{})
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit < 1 || limit > 50 {
			limit = 15
		}

		names, err := models.SearchMasterProductNames(r.Context(), db, search, limit)
		if err != nil {
			log.Printf("search master product names error: %v", err)
			http.Error(w, "could not search product names", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(names)
	}
}

func actorID(r *http.Request) *uuid.UUID {
	id, err := uuid.Parse(r.Context().Value("user_id").(string))
	if err != nil {
		return nil
	}
	return &id
}

// unitName looks up a unit's display name for a readable log entry;
// returns the raw id string if the lookup fails so nothing is lost.
func unitName(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) string {
	var name string
	if err := db.QueryRow(ctx, "SELECT name FROM units WHERE id = $1", id).Scan(&name); err != nil {
		return id.String()
	}
	return name
}

// PATCH /admin/purchase-order-master/{id}/mrp-unit
// Body: {"mrp_unit_id": "<uuid>" | null}
func UpdateMrpUnitHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			MrpUnitID *string `json:"mrp_unit_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var unitID *uuid.UUID
		if req.MrpUnitID != nil && *req.MrpUnitID != "" {
			parsed, err := uuid.Parse(*req.MrpUnitID)
			if err != nil {
				http.Error(w, "invalid mrp_unit_id", http.StatusBadRequest)
				return
			}
			unitID = &parsed
		}

		var oldUnitID *uuid.UUID
		var poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT mrp_unit_id, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldUnitID, &poNumber)

		if err := models.UpdatePurchaseOrderMasterMrpUnit(r.Context(), db, id, unitID); err != nil {
			log.Printf("update purchase order master mrp unit error: %v", err)
			http.Error(w, "could not update mrp unit", http.StatusInternalServerError)
			return
		}

		if (oldUnitID == nil) != (unitID == nil) || (oldUnitID != nil && unitID != nil && *oldUnitID != *unitID) {
			var oldName, newName *string
			if oldUnitID != nil {
				n := unitName(r.Context(), db, *oldUnitID)
				oldName = &n
			}
			if unitID != nil {
				n := unitName(r.Context(), db, *unitID)
				newName = &n
			}
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "mrp_unit", oldName, newName, actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PATCH /admin/purchase-order-master/{id}/product-code
// Body: {"product_code": "ABC123" | null}
func UpdateProductCodeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			ProductCode *string `json:"product_code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var oldCode, oldName, oldComposition, poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT product_code, product_name, composition, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldCode, &oldName, &oldComposition, &poNumber)

		if err := models.UpdatePurchaseOrderMasterProductCode(r.Context(), db, id, req.ProductCode); err != nil {
			log.Printf("update purchase order master product code error: %v", err)
			http.Error(w, "could not update product code", http.StatusInternalServerError)
			return
		}

		newCode := req.ProductCode
		if newCode != nil && *newCode == "" {
			newCode = nil
		}
		oldVal := ""
		if oldCode != nil {
			oldVal = *oldCode
		}
		newVal := ""
		if newCode != nil {
			newVal = *newCode
		}
		if oldVal != newVal {
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "product_code", oldCode, newCode, actorID(r))
		}

		resp := map[string]any{"status": "updated"}

		// A code that matches a catalog product auto-fills the product's name
		// and composition onto this row too — that's the point of tagging a
		// code in the first place, so the two stay in sync with the catalog.
		if newVal != "" {
			matched, err := models.LookupProductByMargCode(r.Context(), db, newVal)
			if err != nil {
				log.Printf("lookup product by marg code error: %v", err)
			} else if matched != nil {
				if err := models.UpdatePurchaseOrderMasterProductName(r.Context(), db, id, matched.Name); err != nil {
					log.Printf("auto-update product name from code error: %v", err)
				} else {
					oldNameVal := ""
					if oldName != nil {
						oldNameVal = *oldName
					}
					if oldNameVal != matched.Name {
						models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "product_name", oldName, &matched.Name, actorID(r))
					}
					resp["product_name"] = matched.Name
				}

				if err := models.UpdatePurchaseOrderMasterComposition(r.Context(), db, id, matched.KeyIngredients); err != nil {
					log.Printf("auto-update composition from code error: %v", err)
				} else {
					oldCompVal := ""
					if oldComposition != nil {
						oldCompVal = *oldComposition
					}
					newCompVal := ""
					if matched.KeyIngredients != nil {
						newCompVal = *matched.KeyIngredients
					}
					if oldCompVal != newCompVal {
						models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "composition", oldComposition, matched.KeyIngredients, actorID(r))
					}
					resp["composition"] = matched.KeyIngredients
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// PATCH /admin/purchase-order-master/{id}/composition
// Body: {"composition": "..." | null}
func UpdateCompositionHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			Composition *string `json:"composition"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var oldComposition, poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT composition, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldComposition, &poNumber)

		if err := models.UpdatePurchaseOrderMasterComposition(r.Context(), db, id, req.Composition); err != nil {
			log.Printf("update purchase order master composition error: %v", err)
			http.Error(w, "could not update composition", http.StatusInternalServerError)
			return
		}

		newComposition := req.Composition
		if newComposition != nil && *newComposition == "" {
			newComposition = nil
		}
		oldVal := ""
		if oldComposition != nil {
			oldVal = *oldComposition
		}
		newVal := ""
		if newComposition != nil {
			newVal = *newComposition
		}
		if oldVal != newVal {
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "composition", oldComposition, newComposition, actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PATCH /admin/purchase-order-master/{id}/product-name
// Body: {"product_name": "..."}
func UpdateProductNameHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			ProductName string `json:"product_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ProductName == "" {
			http.Error(w, "product_name is required", http.StatusBadRequest)
			return
		}

		var oldName, poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT product_name, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldName, &poNumber)

		if err := models.UpdatePurchaseOrderMasterProductName(r.Context(), db, id, req.ProductName); err != nil {
			log.Printf("update purchase order master product name error: %v", err)
			http.Error(w, "could not update product name", http.StatusInternalServerError)
			return
		}

		if oldName == nil || *oldName != req.ProductName {
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "product_name", oldName, &req.ProductName, actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// GET /admin/purchase-order-master/{id}/logs
func LogsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		if _, err := strconv.Atoi(id); err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		entries, err := models.ListPOLogsForOrder(r.Context(), db, models.POSourceMaster, id)
		if err != nil {
			log.Printf("list purchase order master logs error: %v", err)
			http.Error(w, "could not fetch logs", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(entries)
	}
}

// poMailRow is the subset of a master row needed to compose the
// manufacturer email — its own small SELECT rather than reusing
// PurchaseOrderMasterRow, since the email doesn't need every column.
type poMailRow struct {
	PoNumber       *string
	PoDate         *string
	ProductName    *string
	ProductCode    *string
	Composition    *string
	Quantity       *float64
	Mrp            *string
	Rate           *float64
	Specifications *string
	Type           *string
	Company        *string
}

func fetchPOMailRow(ctx context.Context, db *pgxpool.Pool, id int) (*poMailRow, error) {
	var row poMailRow
	err := db.QueryRow(ctx,
		`SELECT po_number, po_date::text, product_name, product_code, composition, quantity, mrp, rate, specifications, type, company
		 FROM purchase_order_master WHERE id = $1`, id,
	).Scan(&row.PoNumber, &row.PoDate, &row.ProductName, &row.ProductCode, &row.Composition,
		&row.Quantity, &row.Mrp, &row.Rate, &row.Specifications, &row.Type, &row.Company)
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func mailField(label string, value *string) string {
	if value == nil || *value == "" {
		return ""
	}
	return fmt.Sprintf(`<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">%s</td><td style="padding:4px 0;color:#111827;">%s</td></tr>`,
		html.EscapeString(label), html.EscapeString(*value))
}

func buildPOMailBody(row *poMailRow) (subject, body string) {
	poNumber := ""
	if row.PoNumber != nil {
		poNumber = *row.PoNumber
	}
	subject = fmt.Sprintf("Purchase Order %s", poNumber)

	var qty, mrp, rate *string
	if row.Quantity != nil {
		s := fmt.Sprintf("%g", *row.Quantity)
		qty = &s
	}
	mrp = row.Mrp
	if row.Rate != nil {
		s := fmt.Sprintf("%.2f", *row.Rate)
		rate = &s
	}

	var rowsHTML strings.Builder
	rowsHTML.WriteString(mailField("P-O Number", row.PoNumber))
	rowsHTML.WriteString(mailField("P-O Date", row.PoDate))
	rowsHTML.WriteString(mailField("Product Name", row.ProductName))
	rowsHTML.WriteString(mailField("Product Code", row.ProductCode))
	rowsHTML.WriteString(mailField("Composition", row.Composition))
	rowsHTML.WriteString(mailField("Quantity", qty))
	rowsHTML.WriteString(mailField("MRP", mrp))
	rowsHTML.WriteString(mailField("Rate", rate))
	rowsHTML.WriteString(mailField("Specifications", row.Specifications))
	rowsHTML.WriteString(mailField("Type", row.Type))

	body = fmt.Sprintf(`
		<div style="font-family:sans-serif;font-size:14px;">
			<p>Please find the purchase order details below.</p>
			<table style="border-collapse:collapse;">%s</table>
		</div>`, rowsHTML.String())
	return subject, body
}

// POST /admin/purchase-order-master/{id}/send-mail
// Emails the PO's details to every address on file for the manufacturer
// named in the row's `company` column. 400 if there's no manufacturer match
// or it has no emails; the send itself is logged like any other field
// change for an audit trail.
func SendMailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		row, err := fetchPOMailRow(r.Context(), db, id)
		if err != nil {
			http.Error(w, "purchase order not found", http.StatusNotFound)
			return
		}
		if row.Company == nil || *row.Company == "" {
			http.Error(w, "this purchase order has no manufacturer set", http.StatusBadRequest)
			return
		}

		mfr, err := models.GetManufacturerByName(r.Context(), db, *row.Company)
		if err != nil {
			log.Printf("send PO mail: manufacturer lookup error: %v", err)
			http.Error(w, "could not look up manufacturer", http.StatusInternalServerError)
			return
		}
		if mfr == nil {
			http.Error(w, fmt.Sprintf("no manufacturer record matches %q", *row.Company), http.StatusBadRequest)
			return
		}
		emails := make([]string, 0, len(mfr.Emails))
		for _, e := range mfr.Emails {
			if strings.TrimSpace(e) != "" {
				emails = append(emails, strings.TrimSpace(e))
			}
		}
		if len(emails) == 0 {
			http.Error(w, fmt.Sprintf("%s has no email address on file", mfr.Name), http.StatusBadRequest)
			return
		}

		subject, body := buildPOMailBody(row)
		messageID, conversationID, internetMessageID, err := mailer.SendMultipleTracked(r.Context(), mailer.ConfigFromEnv(), emails, subject, body)
		if err != nil {
			log.Printf("send PO mail: send failed: %v", err)
			http.Error(w, "could not send email", http.StatusInternalServerError)
			return
		}

		if err := models.RecordPurchaseOrderEmail(r.Context(), db, id, row.PoNumber, messageID, conversationID, internetMessageID, emails, subject, body, actorID(r)); err != nil {
			log.Printf("send PO mail: record email error: %v", err)
		}
		models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), row.PoNumber, "email_sent", nil, strPtr(strings.Join(emails, ", ")), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"status": "sent", "sent_to": emails})
	}
}

// GET /admin/purchase-order-master/{id}/emails
// Returns every email recorded as sent for this PO, each with any replies
// found live in the mailbox for its conversation (if the send was tracked
// and mail reading is configured). A per-email reply lookup failure doesn't
// fail the whole request — it's reported inline on that email instead, so
// one broken conversation lookup doesn't hide the others.
func GetEmailsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		sent, err := models.ListPurchaseOrderEmails(r.Context(), db, id)
		if err != nil {
			log.Printf("list purchase order emails error: %v", err)
			http.Error(w, "could not fetch emails", http.StatusInternalServerError)
			return
		}

		outgoingReplies, err := models.ListOutgoingRepliesForPO(r.Context(), db, id)
		if err != nil {
			log.Printf("list outgoing PO replies error: %v", err)
		}
		// Keyed by the Graph message id each outgoing reply answered, so it
		// can be merged into the right inbound reply's thread below.
		outgoingByMessageID := map[string][]models.PurchaseOrderEmail{}
		for _, o := range outgoingReplies {
			if o.InReplyToMessageID == nil {
				continue
			}
			outgoingByMessageID[*o.InReplyToMessageID] = append(outgoingByMessageID[*o.InReplyToMessageID], o)
		}

		cfg := mailer.ConfigFromEnv()
		type emailWithReplies struct {
			models.PurchaseOrderEmail
			Replies    []mailer.ConversationMessage `json:"replies"`
			ReplyError string                       `json:"reply_error,omitempty"`
		}
		// sent is ordered most-recent-first; the subject/timing fallback only
		// looks for replies received between its own send time and the next
		// (more recent) send, so a reply gets attributed to the send it was
		// actually answering rather than showing up under every prior send
		// to the same PO too — the internet_message_id path doesn't need
		// that windowing since it's a hard match.
		result := make([]emailWithReplies, 0, len(sent))
		for i, e := range sent {
			item := emailWithReplies{PurchaseOrderEmail: e}

			if e.InternetMessageID != nil && *e.InternetMessageID != "" {
				messages, err := mailer.FetchRepliesByInReplyTo(r.Context(), cfg, *e.InternetMessageID)
				if err != nil {
					item.ReplyError = err.Error()
				} else {
					item.Replies = messages
				}
			} else if e.Subject != nil && *e.Subject != "" {
				// Fallback for emails sent before internet_message_id
				// tracking was added.
				var before time.Time
				if i > 0 {
					before = sent[i-1].SentAt
				}
				messages, err := mailer.FetchRepliesBySubject(r.Context(), cfg, *e.Subject, e.SentAt, before)
				if err != nil {
					item.ReplyError = err.Error()
				} else {
					item.Replies = messages
				}
			}

			// Merge in our own persisted replies to whichever inbound
			// messages we just found — each one answered a specific Graph
			// message id, so it slots in after that message rather than
			// anywhere else in the thread.
			for _, inbound := range item.Replies {
				for _, o := range outgoingByMessageID[inbound.ID] {
					body := ""
					if o.Body != nil {
						body = *o.Body
					}
					item.Replies = append(item.Replies, mailer.ConversationMessage{
						ID:               fmt.Sprintf("reply-%d", o.ID),
						From:             cfg.Sender,
						ReceivedDateTime: o.SentAt,
						BodyPreview:      body,
						IsFromSender:     true,
					})
				}
			}
			sort.Slice(item.Replies, func(a, b int) bool {
				return item.Replies[a].ReceivedDateTime.Before(item.Replies[b].ReceivedDateTime)
			})

			result = append(result, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func strPtr(s string) *string { return &s }

// POST /admin/purchase-order-master/{id}/emails/reply
// Body: {"message_id": "<Graph id of the reply being answered>", "body": "..."}
// Sends via Graph's /reply action against that specific message, which
// keeps it correctly threaded (In-Reply-To/References set by Graph itself)
// without any tracking-token juggling on our side.
func ReplyToEmailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			MessageID string `json:"message_id"`
			Body      string `json:"body"`
			To        string `json:"to"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.MessageID == "" {
			http.Error(w, "message_id is required", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Body) == "" {
			http.Error(w, "body is required", http.StatusBadRequest)
			return
		}

		if err := mailer.ReplyToMessage(r.Context(), mailer.ConfigFromEnv(), req.MessageID, req.Body); err != nil {
			log.Printf("reply to PO email error: %v", err)
			http.Error(w, "could not send reply", http.StatusInternalServerError)
			return
		}

		var poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT po_number FROM purchase_order_master WHERE id = $1", id).Scan(&poNumber)

		if err := models.RecordPurchaseOrderReply(r.Context(), db, id, poNumber, req.MessageID, req.To, req.Body, actorID(r)); err != nil {
			log.Printf("record PO reply error: %v", err)
		}
		models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "email_replied", nil, strPtr(req.Body), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "sent"})
	}
}
