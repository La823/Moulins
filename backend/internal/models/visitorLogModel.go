package models

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The visitors log (migration 169): sign-ins, and what each visitor looked
// at — product information only. Read on the admin Visitors page.

// VisitorEventKinds are the events the website may send.
var VisitorEventKinds = map[string]bool{
	"product_view": true, "search": true, "division_view": true, "locked_action": true, "request_sent": true,
}

// VisitorEvent is one thing a visitor did. ProductName is filled in from
// the catalogue when stored, never taken from the browser.
type VisitorEvent struct {
	Kind        string     `json:"kind"`
	ProductID   *string    `json:"product_id,omitempty"`
	ProductName *string    `json:"product_name,omitempty"`
	Query       *string    `json:"query,omitempty"`
	ResultCount *int       `json:"result_count,omitempty"`
	Label       *string    `json:"label,omitempty"`
	OccurredAt  *time.Time `json:"occurred_at,omitempty"`
}

func clip(s *string, n int) string {
	if s == nil {
		return ""
	}
	v := strings.TrimSpace(*s)
	if len(v) > n {
		v = v[:n]
	}
	return v
}

// RecordVisitorEvents stores a batch of events in one statement. Unknown
// kinds are dropped; a product id that isn't a product is kept as nothing.
// Times come from the browser only when within the last day, else now.
func RecordVisitorEvents(ctx context.Context, db *pgxpool.Pool, visitorID uuid.UUID, events []VisitorEvent) error {
	var kinds, productIDs, queries, labels []string
	var counts []int32
	var times []time.Time
	now := time.Now()
	for _, e := range events {
		if !VisitorEventKinds[e.Kind] {
			continue
		}
		pid := clip(e.ProductID, 36)
		if _, err := uuid.Parse(pid); err != nil {
			pid = ""
		}
		count := int32(-1)
		if e.ResultCount != nil && *e.ResultCount >= 0 {
			count = int32(*e.ResultCount)
		}
		at := now
		if e.OccurredAt != nil && e.OccurredAt.Before(now.Add(time.Minute)) && e.OccurredAt.After(now.Add(-24*time.Hour)) {
			at = *e.OccurredAt
		}
		kinds = append(kinds, e.Kind)
		productIDs = append(productIDs, pid)
		queries = append(queries, clip(e.Query, 200))
		labels = append(labels, clip(e.Label, 120))
		counts = append(counts, count)
		times = append(times, at)
	}
	if len(kinds) == 0 {
		return nil
	}
	_, err := db.Exec(ctx, `
		INSERT INTO visitor_events (visitor_id, kind, product_id, product_name, query, result_count, label, occurred_at)
		SELECT $1, e.kind, p.id, p.name, NULLIF(e.query, ''), NULLIF(e.cnt, -1), NULLIF(e.label, ''), e.at
		FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::timestamptz[])
		     AS e(kind, pid, query, label, cnt, at)
		LEFT JOIN products p ON p.id = NULLIF(e.pid, '')::uuid`,
		visitorID, kinds, productIDs, queries, labels, counts, times)
	return err
}

// PurgeOldVisitorEvents deletes activity older than 6 months; run daily.
func PurgeOldVisitorEvents(ctx context.Context, db *pgxpool.Pool) (int64, error) {
	tag, err := db.Exec(ctx, `DELETE FROM visitor_events WHERE occurred_at < now() - interval '6 months'`)
	return tag.RowsAffected(), err
}

// AdminVisitorRow is one line of the admin Visitors list.
type AdminVisitorRow struct {
	ID            uuid.UUID  `json:"id"`
	Name          *string    `json:"name"`
	Email         string     `json:"email"`
	PictureURL    *string    `json:"picture_url"`
	CreatedAt     time.Time  `json:"created_at"`
	LastLoginAt   *time.Time `json:"last_login_at"`
	LastSeenAt    *time.Time `json:"last_seen_at"`
	SignInCount   int        `json:"sign_in_count"`
	Events30d     int        `json:"events_30d"`
	ProductViews  int        `json:"product_views"`
	Searches      int        `json:"searches"`
	RequestStatus *string    `json:"request_status"`
	RequestFirm   *string    `json:"request_firm"`
}

// ListVisitors: newest activity first, optionally searched by name or email,
// or only those with an open partnership request.
func ListVisitors(ctx context.Context, db *pgxpool.Pool, search string, openRequestsOnly bool, limit, offset int) ([]AdminVisitorRow, int, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := db.Query(ctx, `
		SELECT v.id, v.name, v.email, v.picture_url, v.created_at, v.last_login_at, v.last_seen_at, v.sign_in_count,
		       COALESCE(ev.recent, 0), COALESCE(ev.views, 0), COALESCE(ev.searches, 0),
		       pr.status, pr.firm_name,
		       count(*) OVER ()
		FROM visitors v
		LEFT JOIN LATERAL (
			SELECT count(*) FILTER (WHERE occurred_at > now() - interval '30 days') AS recent,
			       count(*) FILTER (WHERE kind = 'product_view') AS views,
			       count(*) FILTER (WHERE kind = 'search') AS searches
			FROM visitor_events WHERE visitor_id = v.id
		) ev ON true
		LEFT JOIN LATERAL (
			SELECT status, firm_name FROM partnership_requests
			WHERE visitor_id = v.id ORDER BY created_at DESC LIMIT 1
		) pr ON true
		WHERE ($1 = '' OR v.name ILIKE '%' || $1 || '%' OR v.email ILIKE '%' || $1 || '%')
		  AND (NOT $2 OR pr.status IN ('new', 'contacted'))
		ORDER BY COALESCE(v.last_seen_at, v.last_login_at, v.created_at) DESC
		LIMIT $3 OFFSET $4`, strings.TrimSpace(search), openRequestsOnly, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	list := []AdminVisitorRow{}
	total := 0
	for rows.Next() {
		var r AdminVisitorRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Email, &r.PictureURL, &r.CreatedAt, &r.LastLoginAt, &r.LastSeenAt, &r.SignInCount,
			&r.Events30d, &r.ProductViews, &r.Searches, &r.RequestStatus, &r.RequestFirm, &total); err != nil {
			return nil, 0, err
		}
		list = append(list, r)
	}
	return list, total, rows.Err()
}

type VisitorSignIn struct {
	SignedInAt time.Time `json:"signed_in_at"`
	UserAgent  *string   `json:"user_agent"`
}

// VisitorDetail is one visitor's page: their sign-ins, latest activity and
// partnership requests (staff fields included).
type VisitorDetail struct {
	Visitor  AdminVisitorRow      `json:"visitor"`
	SignIns  []VisitorSignIn      `json:"sign_ins"`
	Events   []VisitorEvent       `json:"events"`
	Requests []PartnershipRequest `json:"requests"`
}

func GetVisitorDetail(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*VisitorDetail, error) {
	d := VisitorDetail{SignIns: []VisitorSignIn{}, Events: []VisitorEvent{}}
	r := &d.Visitor
	err := db.QueryRow(ctx, `
		SELECT id, name, email, picture_url, created_at, last_login_at, last_seen_at, sign_in_count,
		       (SELECT count(*) FROM visitor_events WHERE visitor_id = $1 AND occurred_at > now() - interval '30 days'),
		       (SELECT count(*) FROM visitor_events WHERE visitor_id = $1 AND kind = 'product_view'),
		       (SELECT count(*) FROM visitor_events WHERE visitor_id = $1 AND kind = 'search')
		FROM visitors WHERE id = $1`, id).Scan(&r.ID, &r.Name, &r.Email, &r.PictureURL, &r.CreatedAt, &r.LastLoginAt,
		&r.LastSeenAt, &r.SignInCount, &r.Events30d, &r.ProductViews, &r.Searches)
	if err != nil {
		return nil, err
	}

	batch := &pgx.Batch{}
	batch.Queue(`SELECT signed_in_at, user_agent FROM visitor_sign_ins WHERE visitor_id = $1 ORDER BY signed_in_at DESC LIMIT 50`, id)
	batch.Queue(`SELECT kind, product_id::text, product_name, query, result_count, label, occurred_at
		FROM visitor_events WHERE visitor_id = $1 ORDER BY occurred_at DESC LIMIT 300`, id)
	batch.Queue(partnershipRequestSelect+` WHERE pr.visitor_id = $1 ORDER BY pr.created_at DESC`, id)
	br := db.SendBatch(ctx, batch)
	defer br.Close()

	rows, err := br.Query()
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var s VisitorSignIn
		if err := rows.Scan(&s.SignedInAt, &s.UserAgent); err != nil {
			rows.Close()
			return nil, err
		}
		d.SignIns = append(d.SignIns, s)
	}
	rows.Close()

	rows, err = br.Query()
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e VisitorEvent
		var at time.Time
		if err := rows.Scan(&e.Kind, &e.ProductID, &e.ProductName, &e.Query, &e.ResultCount, &e.Label, &at); err != nil {
			rows.Close()
			return nil, err
		}
		e.OccurredAt = &at
		d.Events = append(d.Events, e)
	}
	rows.Close()

	rows, err = br.Query()
	if err != nil {
		return nil, err
	}
	if d.Requests, err = scanPartnershipRequests(rows); err != nil {
		return nil, err
	}
	if r.RequestStatus == nil && len(d.Requests) > 0 {
		r.RequestStatus, r.RequestFirm = &d.Requests[0].Status, &d.Requests[0].FirmName
	}
	return &d, nil
}

type CountedName struct {
	Name     string  `json:"name"`
	ID       *string `json:"id,omitempty"`
	Count    int     `json:"count"`
	Visitors int     `json:"visitors"`
}

// VisitorInsights sums up visitors over the last `days` days.
type VisitorInsights struct {
	Days           int           `json:"days"`
	TotalVisitors  int           `json:"total_visitors"`
	NewVisitors    int           `json:"new_visitors"`
	ActiveVisitors int           `json:"active_visitors"`
	OpenRequests   int           `json:"open_requests"`
	TopProducts    []CountedName `json:"top_products"`
	TopSearches    []CountedName `json:"top_searches"`
	EmptySearches  []CountedName `json:"empty_searches"` // searches that found nothing
}

func GetVisitorInsights(ctx context.Context, db *pgxpool.Pool, days int) (*VisitorInsights, error) {
	if days <= 0 || days > 180 {
		days = 30
	}
	in := VisitorInsights{Days: days, TopProducts: []CountedName{}, TopSearches: []CountedName{}, EmptySearches: []CountedName{}}
	batch := &pgx.Batch{}
	batch.Queue(`SELECT
		(SELECT count(*) FROM visitors),
		(SELECT count(*) FROM visitors WHERE created_at > now() - make_interval(days => $1)),
		(SELECT count(*) FROM visitors WHERE COALESCE(last_seen_at, last_login_at) > now() - make_interval(days => $1)),
		(SELECT count(*) FROM partnership_requests WHERE status IN ('new', 'contacted'))`, days)
	batch.Queue(`SELECT product_name, product_id::text, count(*), count(DISTINCT visitor_id)
		FROM visitor_events
		WHERE kind = 'product_view' AND product_id IS NOT NULL AND occurred_at > now() - make_interval(days => $1)
		GROUP BY product_id, product_name ORDER BY count(*) DESC LIMIT 15`, days)
	batch.Queue(`SELECT lower(query), NULL::text, count(*), count(DISTINCT visitor_id)
		FROM visitor_events
		WHERE kind = 'search' AND query IS NOT NULL AND occurred_at > now() - make_interval(days => $1)
		GROUP BY lower(query) ORDER BY count(*) DESC LIMIT 15`, days)
	batch.Queue(`SELECT lower(query), NULL::text, count(*), count(DISTINCT visitor_id)
		FROM visitor_events
		WHERE kind = 'search' AND result_count = 0 AND query IS NOT NULL AND occurred_at > now() - make_interval(days => $1)
		GROUP BY lower(query) ORDER BY count(*) DESC LIMIT 10`, days)
	br := db.SendBatch(ctx, batch)
	defer br.Close()

	if err := br.QueryRow().Scan(&in.TotalVisitors, &in.NewVisitors, &in.ActiveVisitors, &in.OpenRequests); err != nil {
		return nil, err
	}
	for _, dest := range []*[]CountedName{&in.TopProducts, &in.TopSearches, &in.EmptySearches} {
		rows, err := br.Query()
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var c CountedName
			var name *string
			if err := rows.Scan(&name, &c.ID, &c.Count, &c.Visitors); err != nil {
				rows.Close()
				return nil, err
			}
			if name != nil {
				c.Name = *name
			}
			*dest = append(*dest, c)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return &in, nil
}
