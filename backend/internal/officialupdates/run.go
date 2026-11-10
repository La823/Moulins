package officialupdates

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// DeepLink is the panel page the notifications open.
const DeepLink = "/panel/official-updates"

// failAlertAfter is how many reads in a row a source may fail before staff
// are told it can't be read (once; it resets when a read works again).
const failAlertAfter = 2

// Notify sends one user an in-app notification with a push, i.e.
// services.SendDirectNotification (passed in to keep this package free of
// the services import, which runs the scheduler that calls Run).
type Notify func(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, title, body string, deepLink *string) error

// SourceResult is how one source's read went.
type SourceResult struct {
	Key   string   `json:"key"`
	Name  string   `json:"name"`
	Found int      `json:"found"`
	New   []string `json:"new"` // titles of the items seen for the first time (not on a first read)
	Error string   `json:"error,omitempty"`
}

// One check at a time: the daily run and "Check now" would otherwise race
// to call the same items new.
var running sync.Mutex

// Run reads every source, saves the items not seen before and tells admins
// and staff about them in one notification. A source read for the first
// time only records its items. A source that fails failAlertAfter times in
// a row is reported too.
func Run(ctx context.Context, db *pgxpool.Pool, notify Notify) []SourceResult {
	running.Lock()
	defer running.Unlock()

	results := make([]SourceResult, len(Sources))
	var wg sync.WaitGroup
	for i, s := range Sources {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = runSource(ctx, db, s)
		}()
	}
	wg.Wait()

	var news, broken []string
	var first SourceResult
	total := 0
	for _, r := range results {
		if len(r.New) > 0 {
			if total == 0 {
				first = r
			}
			total += len(r.New)
			news = append(news, fmt.Sprintf("%s (%d)", r.Name, len(r.New)))
		}
	}
	for _, r := range results {
		if r.Error == "" {
			continue
		}
		var fails int
		if err := db.QueryRow(ctx, `SELECT fail_count FROM official_update_sources WHERE key = $1`, r.Key).Scan(&fails); err == nil && fails == failAlertAfter {
			broken = append(broken, r.Name)
		}
	}

	if total > 0 {
		title := fmt.Sprintf("%d new official updates", total)
		body := strings.Join(news, ", ")
		if total == 1 {
			title = "New official update: " + first.Name
			body = first.New[0]
		}
		tell(ctx, db, notify, title, body)
	}
	if len(broken) > 0 {
		tell(ctx, db, notify, "Official updates: a website could not be read",
			strings.Join(broken, ", ")+" could not be read for "+fmt.Sprint(failAlertAfter)+" checks in a row. Open the page to see the error.")
	}
	return results
}

func tell(ctx context.Context, db *pgxpool.Pool, notify Notify, title, body string) {
	staff, err := models.GetStaffUserIDs(ctx, db)
	if err != nil {
		log.Printf("official updates: list staff: %v", err)
		return
	}
	link := DeepLink
	for _, uid := range staff {
		if err := notify(ctx, db, uid, title, body, &link); err != nil {
			log.Printf("official updates: notify %s: %v", uid, err)
		}
	}
}

func runSource(ctx context.Context, db *pgxpool.Pool, s Source) SourceResult {
	res := SourceResult{Key: s.Key, Name: s.Name}
	fctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	items, err := s.fetch(fctx, s)
	cancel()
	if err == nil && len(items) == 0 {
		err = fmt.Errorf("no items found on the page; its layout may have changed")
	}
	if err != nil {
		res.Error = err.Error()
		log.Printf("official updates: %s: %v", s.Key, err)
		if _, dbErr := db.Exec(ctx, `
			INSERT INTO official_update_sources (key, last_checked_at, last_error, fail_count) VALUES ($1, now(), $2, 1)
			ON CONFLICT (key) DO UPDATE SET last_checked_at = now(), last_error = $2,
			       fail_count = official_update_sources.fail_count + 1`, s.Key, res.Error); dbErr != nil {
			log.Printf("official updates: %s: save status: %v", s.Key, dbErr)
		}
		return res
	}
	res.Found = len(items)

	var have int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM official_updates WHERE source_key = $1`, s.Key).Scan(&have); err != nil {
		res.Error = "could not read saved items: " + err.Error()
		return res
	}
	baseline := have == 0

	seen := map[string]bool{}
	var ids, titles, refs, cats, dates, links []string
	for _, it := range items {
		if seen[it.ExternalID] {
			continue
		}
		seen[it.ExternalID] = true
		d := ""
		if it.PublishedOn != nil {
			d = it.PublishedOn.Format("2006-01-02")
		}
		ids, titles, refs, cats, dates, links = append(ids, it.ExternalID), append(titles, it.Title),
			append(refs, it.RefNo), append(cats, it.Category), append(dates, d), append(links, it.Link)
	}
	rows, err := db.Query(ctx, `
		INSERT INTO official_updates (source_key, external_id, title, ref_no, category, published_on, link, is_baseline, page_rank)
		SELECT $1, e, t, NULLIF(r, ''), NULLIF(c, ''), NULLIF(d, '')::date, NULLIF(l, ''), $8, n
		FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]) WITH ORDINALITY AS x(e, t, r, c, d, l, n)
		ON CONFLICT (source_key, external_id) DO NOTHING
		RETURNING title`, s.Key, ids, titles, refs, cats, dates, links, baseline)
	if err != nil {
		res.Error = "could not save items: " + err.Error()
		log.Printf("official updates: %s: %v", s.Key, err)
		return res
	}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err == nil && !baseline {
			res.New = append(res.New, t)
		}
	}
	rows.Close()

	if _, err := db.Exec(ctx, `
		INSERT INTO official_update_sources (key, last_checked_at, last_ok_at, last_error, fail_count) VALUES ($1, now(), now(), NULL, 0)
		ON CONFLICT (key) DO UPDATE SET last_checked_at = now(), last_ok_at = now(), last_error = NULL, fail_count = 0`, s.Key); err != nil {
		log.Printf("official updates: %s: save status: %v", s.Key, err)
	}
	return res
}

// Update is one saved item, for the page.
type Update struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	RefNo       *string    `json:"ref_no,omitempty"`
	Category    *string    `json:"category,omitempty"`
	PublishedOn *time.Time `json:"published_on,omitempty"`
	Link        *string    `json:"link,omitempty"`
	FirstSeenAt time.Time  `json:"first_seen_at"`
	IsNew       bool       `json:"is_new"` // found by a daily check in the last 7 days
}

// SourceUpdates is a source with its latest items and how its last read went.
type SourceUpdates struct {
	Source
	Total         int        `json:"total"`
	NewCount      int        `json:"new_count"`
	LastCheckedAt *time.Time `json:"last_checked_at,omitempty"`
	LastOKAt      *time.Time `json:"last_ok_at,omitempty"`
	LastError     *string    `json:"last_error,omitempty"`
	Updates       []Update   `json:"updates"`
}

// List returns every source (or just sourceKey) with its newest `limit`
// items: dated ones by date, newest first; undated ones by when we found them.
func List(ctx context.Context, db *pgxpool.Pool, sourceKey string, limit int) ([]SourceUpdates, error) {
	out := []SourceUpdates{}
	byKey := map[string]int{}
	for _, s := range Sources {
		if sourceKey != "" && s.Key != sourceKey {
			continue
		}
		byKey[s.Key] = len(out)
		out = append(out, SourceUpdates{Source: s, Updates: []Update{}})
	}

	rows, err := db.Query(ctx, `
		SELECT o.key, o.last_checked_at, o.last_ok_at, o.last_error,
		       (SELECT count(*) FROM official_updates u WHERE u.source_key = o.key),
		       (SELECT count(*) FROM official_updates u WHERE u.source_key = o.key AND NOT u.is_baseline
		                AND u.first_seen_at > now() - interval '7 days')
		FROM official_update_sources o`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var key string
		var checked, ok *time.Time
		var lastErr *string
		var total, fresh int
		if err := rows.Scan(&key, &checked, &ok, &lastErr, &total, &fresh); err != nil {
			rows.Close()
			return nil, err
		}
		if i, found := byKey[key]; found {
			out[i].LastCheckedAt, out[i].LastOKAt, out[i].LastError, out[i].Total, out[i].NewCount = checked, ok, lastErr, total, fresh
		}
	}
	rows.Close()

	rows, err = db.Query(ctx, `
		SELECT source_key, id, title, ref_no, category, published_on, link, first_seen_at,
		       NOT is_baseline AND first_seen_at > now() - interval '7 days'
		FROM (SELECT *, row_number() OVER (PARTITION BY source_key
		                 ORDER BY published_on DESC NULLS LAST, first_seen_at DESC, page_rank) AS n
		      FROM official_updates WHERE $1 = '' OR source_key = $1) x
		WHERE n <= $2
		ORDER BY source_key, n`, sourceKey, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var u Update
		if err := rows.Scan(&key, &u.ID, &u.Title, &u.RefNo, &u.Category, &u.PublishedOn, &u.Link, &u.FirstSeenAt, &u.IsNew); err != nil {
			return nil, err
		}
		if i, found := byKey[key]; found {
			out[i].Updates = append(out[i].Updates, u)
		}
	}
	return out, rows.Err()
}
