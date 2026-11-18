// Package appversion holds the app update settings (migration 192): per app
// and platform the latest and minimum build, which the apps check on open to
// offer or require an update, and the builds phones report when they
// register for push.
package appversion

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Apps: client = Moulins (partners), team = MPPL Team (staff).
var Apps = map[string]string{"client": "Moulins", "team": "MPPL Team"}

var Platforms = map[string]bool{"android": true, "ios": true}

type Version struct {
	App         string     `json:"app"`
	Platform    string     `json:"platform"`
	LatestBuild int        `json:"latest_build"`
	LatestName  string     `json:"latest_name"`
	MinBuild    int        `json:"min_build"`
	Message     string     `json:"message"`
	UpdateURL   string     `json:"update_url"`
	UpdatedBy   string     `json:"updated_by,omitempty"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

const selectSQL = `
	SELECT v.app, v.platform, v.latest_build, v.latest_name, v.min_build, v.message, v.update_url,
	       COALESCE(u.username, ''), v.updated_at
	FROM app_versions v LEFT JOIN users u ON u.id = v.updated_by`

func scan(row pgx.Row) (Version, error) {
	var v Version
	err := row.Scan(&v.App, &v.Platform, &v.LatestBuild, &v.LatestName, &v.MinBuild, &v.Message, &v.UpdateURL,
		&v.UpdatedBy, &v.UpdatedAt)
	return v, err
}

// Get is one app's setting; a missing row reads as "no update" (all zero).
func Get(ctx context.Context, db *pgxpool.Pool, app, platform string) (Version, error) {
	v, err := scan(db.QueryRow(ctx, selectSQL+` WHERE v.app = $1 AND v.platform = $2`, app, platform))
	if errors.Is(err, pgx.ErrNoRows) {
		return Version{App: app, Platform: platform}, nil
	}
	return v, err
}

func List(ctx context.Context, db *pgxpool.Pool) ([]Version, error) {
	rows, err := db.Query(ctx, selectSQL+` ORDER BY v.app, v.platform`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Version{}
	for rows.Next() {
		v, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

type Input struct {
	LatestBuild int    `json:"latest_build"`
	LatestName  string `json:"latest_name"`
	MinBuild    int    `json:"min_build"`
	Message     string `json:"message"`
	UpdateURL   string `json:"update_url"`
}

func (in *Input) Validate() error {
	in.LatestName = strings.TrimSpace(in.LatestName)
	in.Message = strings.TrimSpace(in.Message)
	in.UpdateURL = strings.TrimSpace(in.UpdateURL)
	if in.LatestBuild < 0 || in.MinBuild < 0 {
		return errors.New("build numbers can't be negative")
	}
	if in.MinBuild > in.LatestBuild {
		return errors.New("the minimum build can't be above the latest build")
	}
	if in.UpdateURL != "" && !strings.HasPrefix(in.UpdateURL, "https://") {
		return errors.New("the update link must start with https://")
	}
	if len(in.Message) > 300 {
		return errors.New("keep the message under 300 characters")
	}
	return nil
}

func Update(ctx context.Context, db *pgxpool.Pool, app, platform string, in Input, by uuid.UUID) error {
	_, err := db.Exec(ctx, `
		INSERT INTO app_versions (app, platform, latest_build, latest_name, min_build, message, update_url, updated_by, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		ON CONFLICT (app, platform) DO UPDATE SET
			latest_build = $3, latest_name = $4, min_build = $5, message = $6, update_url = $7,
			updated_by = $8, updated_at = NOW()`,
		app, platform, in.LatestBuild, in.LatestName, in.MinBuild, in.Message, in.UpdateURL, by)
	return err
}

// ActiveDays: a phone counts as in use if it registered for push (every app
// open) within this many days.
const ActiveDays = 60

// BuildCount is how many phones in use run one app build. App "" and Build 0
// are old apps that don't report it; Staff splits those, since the login
// tells which app they most likely are.
type BuildCount struct {
	App    string `json:"app"`
	Build  int    `json:"build"`
	Staff  bool   `json:"staff"`
	Phones int    `json:"phones"`
}

func Devices(ctx context.Context, db *pgxpool.Pool) ([]BuildCount, error) {
	rows, err := db.Query(ctx, fmt.Sprintf(`
		SELECT COALESCE(d.app, ''), COALESCE(d.app_build, 0), u.role IN ('admin', 'employee'), COUNT(*)
		FROM device_tokens d JOIN users u ON u.id = d.user_id
		WHERE d.last_seen_at > NOW() - INTERVAL '%d days'
		GROUP BY 1, 2, 3 ORDER BY 1, 2 DESC, 3`, ActiveDays))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BuildCount{}
	for rows.Next() {
		var b BuildCount
		if err := rows.Scan(&b.App, &b.Build, &b.Staff, &b.Phones); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// OldAppTokens are the push tokens of phones in use on an app from before
// the update check (no build reported), split by staff and partner logins.
func OldAppTokens(ctx context.Context, db *pgxpool.Pool) (staff, partners []string, err error) {
	rows, err := db.Query(ctx, fmt.Sprintf(`
		SELECT d.token, u.role IN ('admin', 'employee')
		FROM device_tokens d JOIN users u ON u.id = d.user_id
		WHERE d.app_build IS NULL AND d.last_seen_at > NOW() - INTERVAL '%d days'`, ActiveDays))
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t string
		var isStaff bool
		if err := rows.Scan(&t, &isStaff); err != nil {
			return nil, nil, err
		}
		if isStaff {
			staff = append(staff, t)
		} else {
			partners = append(partners, t)
		}
	}
	return staff, partners, rows.Err()
}
