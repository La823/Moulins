package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MargProductBatch is one batch line under a deduped Marg product.
type MargProductBatch struct {
	ID        uuid.UUID `json:"id"`
	Code      string    `json:"code"`
	CurBatch  string    `json:"curbatch"`
	Exp       string    `json:"exp"`
	Stock     float64   `json:"stock"`
	MRP       *float64  `json:"mrp,omitempty"`
	Rate      *float64  `json:"rate,omitempty"`
	PRate     *float64  `json:"prate,omitempty"`
	IsDeleted bool      `json:"is_deleted"`
}

// GetLiveMargBatchesByBaseCode returns every live (not deleted) batch for a
// deduped Marg product, sorted by expiry ascending (FEFO — batches with no
// usable expiry sort last). Used to build the Marg order-push batch picker,
// where the earliest-expiry batch is offered as the default pick.
func GetLiveMargBatchesByBaseCode(ctx context.Context, db *pgxpool.Pool, baseCode string) ([]MargProductBatch, error) {
	rows, err := db.Query(ctx, `
		SELECT b.id, b.code, b.curbatch, b.exp, b.stock, b.mrp, b.rate, b.prate, b.is_deleted
		FROM margmaster_product_batches b
		JOIN margmaster_products p ON p.id = b.margmaster_product_id
		WHERE p.base_code = $1 AND b.is_deleted = FALSE
		ORDER BY NULLIF(trim(b.exp), '') ASC NULLS LAST, b.curbatch`,
		baseCode,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	batches := []MargProductBatch{}
	for rows.Next() {
		var b MargProductBatch
		if err := rows.Scan(&b.ID, &b.Code, &b.CurBatch, &b.Exp, &b.Stock, &b.MRP, &b.Rate, &b.PRate, &b.IsDeleted); err != nil {
			return nil, err
		}
		batches = append(batches, b)
	}
	return batches, rows.Err()
}

// MargProductWithBatches is one deduped Marg product plus every batch
// row that rolls up into it (the "batchwise clubbed, stock per batch"
// view the admin/employee Marg-master page shows).
type MargProductWithBatches struct {
	ID              uuid.UUID          `json:"id"`
	BaseCode        string             `json:"base_code"`
	Name            string             `json:"name"`
	Company         *string            `json:"company,omitempty"`
	Salt            *string            `json:"salt,omitempty"`
	GCode           *string            `json:"gcode,omitempty"`
	MRP             *float64           `json:"mrp,omitempty"`
	Rate            *float64           `json:"rate,omitempty"`
	PRate           *float64           `json:"prate,omitempty"`
	TotalStock      float64            `json:"total_stock"`
	BatchCount      int                `json:"batch_count"`
	CurrentBatch    *string            `json:"current_batch,omitempty"`
	Exp             *string            `json:"exp,omitempty"`
	IsDeleted       bool               `json:"is_deleted"`
	SyncedAt        time.Time          `json:"synced_at"`
	Batches         []MargProductBatch `json:"batches"`
	LinkedProductID *uuid.UUID         `json:"linked_product_id,omitempty"`
}

// MargProductPage is one page of deduped Marg products plus the total
// matching row count (for page-count display) and the full list of
// distinct companies among ALL products (not just this page — used to
// populate the company filter dropdown).
type MargProductPage struct {
	Products  []MargProductWithBatches `json:"products"`
	Total     int                      `json:"total"`
	Companies []string                 `json:"companies"`
}

// GetMargProductsWithBatches returns one page of deduped Marg products
// (ordered by name) with their batch rows nested. search filters on
// name/base_code (case-insensitive substring); company filters to an
// exact company match; either pass "" for no filter. limit/offset page
// the *deduped product* rows, not batches.
func GetMargProductsWithBatches(ctx context.Context, db *pgxpool.Pool, search, company string, limit, offset int) (MargProductPage, error) {
	var page MargProductPage

	if err := db.QueryRow(ctx, `
		SELECT COUNT(*) FROM margmaster_products
		WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR base_code ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR company = $2)`,
		search, company,
	).Scan(&page.Total); err != nil {
		return page, err
	}

	companyRows, err := db.Query(ctx, `
		SELECT DISTINCT company FROM margmaster_products
		WHERE company IS NOT NULL AND company != '' ORDER BY company`,
	)
	if err != nil {
		return page, err
	}
	page.Companies = []string{}
	for companyRows.Next() {
		var c string
		if err := companyRows.Scan(&c); err != nil {
			companyRows.Close()
			return page, err
		}
		page.Companies = append(page.Companies, c)
	}
	companyRows.Close()
	if err := companyRows.Err(); err != nil {
		return page, err
	}

	rows, err := db.Query(ctx, `
		SELECT mp.id, mp.base_code, mp.name, mp.company, mp.salt, mp.gcode, mp.mrp, mp.rate, mp.prate,
		       mp.total_stock, mp.batch_count, mp.current_batch, mp.exp, mp.is_deleted, mp.synced_at, pr.id
		FROM margmaster_products mp
		LEFT JOIN products pr ON pr.marg_code = mp.base_code
		WHERE ($1 = '' OR mp.name ILIKE '%' || $1 || '%' OR mp.base_code ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR mp.company = $2)
		ORDER BY mp.name
		LIMIT $3 OFFSET $4`,
		search, company, limit, offset,
	)
	if err != nil {
		return page, err
	}
	defer rows.Close()

	products := []MargProductWithBatches{}
	ids := []uuid.UUID{}
	byID := map[uuid.UUID]*MargProductWithBatches{}
	for rows.Next() {
		var p MargProductWithBatches
		if err := rows.Scan(&p.ID, &p.BaseCode, &p.Name, &p.Company, &p.Salt, &p.GCode, &p.MRP, &p.Rate, &p.PRate,
			&p.TotalStock, &p.BatchCount, &p.CurrentBatch, &p.Exp, &p.IsDeleted, &p.SyncedAt, &p.LinkedProductID); err != nil {
			return page, err
		}
		p.Batches = []MargProductBatch{}
		products = append(products, p)
		ids = append(ids, p.ID)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	for i := range products {
		byID[products[i].ID] = &products[i]
	}
	if len(ids) == 0 {
		page.Products = products
		return page, nil
	}

	batchRows, err := db.Query(ctx, `
		SELECT margmaster_product_id, id, code, curbatch, exp, stock, mrp, rate, prate, is_deleted
		FROM margmaster_product_batches
		WHERE margmaster_product_id = ANY($1::uuid[])
		ORDER BY curbatch`,
		uuidStrings(ids),
	)
	if err != nil {
		return page, err
	}
	defer batchRows.Close()

	for batchRows.Next() {
		var productID uuid.UUID
		var b MargProductBatch
		if err := batchRows.Scan(&productID, &b.ID, &b.Code, &b.CurBatch, &b.Exp, &b.Stock, &b.MRP, &b.Rate, &b.PRate, &b.IsDeleted); err != nil {
			return page, err
		}
		if p, ok := byID[productID]; ok {
			p.Batches = append(p.Batches, b)
		}
	}
	if err := batchRows.Err(); err != nil {
		return page, err
	}
	page.Products = products
	return page, nil
}

// MargParty is one Marg ledger account row.
type MargParty struct {
	ID              uuid.UUID  `json:"id"`
	Rid             string     `json:"rid"`
	Code            *string    `json:"code,omitempty"`
	Name            *string    `json:"name,omitempty"`
	Area            *string    `json:"area,omitempty"`
	Address         *string    `json:"address,omitempty"`
	Balance         *float64   `json:"balance,omitempty"`
	Gcode           *string    `json:"gcode,omitempty"`
	IsDeleted       bool       `json:"is_deleted"`
	Phone1          *string    `json:"phone1,omitempty"`
	Email1          *string    `json:"email1,omitempty"`
	GSTIN           *string    `json:"gstin,omitempty"`
	LedgerCode      *string    `json:"ledgercode,omitempty"`
	SyncedAt        time.Time  `json:"synced_at"`
	LinkedPartnerID *uuid.UUID `json:"linked_partner_id,omitempty"`
}

// MargPartyPage is one page of Marg parties plus the total matching count.
type MargPartyPage struct {
	Parties []MargParty `json:"parties"`
	Total   int         `json:"total"`
}

// GetMargParties returns one page of synced Marg parties, ordered by name.
// search filters on name/code/area/rid (case-insensitive substring), pass
// "" for none.
func GetMargParties(ctx context.Context, db *pgxpool.Pool, search string, limit, offset int) (MargPartyPage, error) {
	var page MargPartyPage

	if err := db.QueryRow(ctx, `
		SELECT COUNT(*) FROM margmaster_party
		WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR code ILIKE '%' || $1 || '%' OR area ILIKE '%' || $1 || '%' OR rid ILIKE '%' || $1 || '%'`,
		search,
	).Scan(&page.Total); err != nil {
		return page, err
	}

	rows, err := db.Query(ctx, `
		SELECT mp.id, mp.rid, mp.code, mp.name, mp.area, mp.address, mp.balance, mp.gcode, mp.is_deleted,
		       mp.phone1, mp.email1, mp.gstin, mp.ledgercode, mp.synced_at, u.id
		FROM margmaster_party mp
		LEFT JOIN users u ON u.rid = mp.rid AND u.role = 'partner'
		WHERE $1 = '' OR mp.name ILIKE '%' || $1 || '%' OR mp.code ILIKE '%' || $1 || '%' OR mp.area ILIKE '%' || $1 || '%' OR mp.rid ILIKE '%' || $1 || '%'
		ORDER BY mp.name
		LIMIT $2 OFFSET $3`,
		search, limit, offset,
	)
	if err != nil {
		return page, err
	}
	defer rows.Close()

	parties := []MargParty{}
	for rows.Next() {
		var p MargParty
		if err := rows.Scan(&p.ID, &p.Rid, &p.Code, &p.Name, &p.Area, &p.Address, &p.Balance, &p.Gcode,
			&p.IsDeleted, &p.Phone1, &p.Email1, &p.GSTIN, &p.LedgerCode, &p.SyncedAt, &p.LinkedPartnerID); err != nil {
			return page, err
		}
		parties = append(parties, p)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	page.Parties = parties
	return page, nil
}

// GetMargPartyByRid looks up a single synced Marg party by its rid — used
// by a logged-in partner's own balance view, keyed off users.rid.
func GetMargPartyByRid(ctx context.Context, db *pgxpool.Pool, rid string) (*MargParty, error) {
	var p MargParty
	err := db.QueryRow(ctx, `
		SELECT id, rid, code, name, area, address, balance, gcode, is_deleted,
		       phone1, email1, gstin, ledgercode, synced_at
		FROM margmaster_party WHERE rid = $1`,
		rid,
	).Scan(&p.ID, &p.Rid, &p.Code, &p.Name, &p.Area, &p.Address, &p.Balance, &p.Gcode,
		&p.IsDeleted, &p.Phone1, &p.Email1, &p.GSTIN, &p.LedgerCode, &p.SyncedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}
