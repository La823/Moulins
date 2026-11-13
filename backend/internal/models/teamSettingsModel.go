package models

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RoleTeamMember is a partner's sub-account (users.team_owner_id = partner).
const RoleTeamMember = "team_member"

// TeamSettings is what a partner allows one of their team members
// (migration 184). Sent to the member's app on /auth/me as team_settings.
type TeamSettings struct {
	CanAddDoctors   bool `json:"can_add_doctors"`
	CanAddRetailers bool `json:"can_add_retailers"`
	OrderToPartner  bool `json:"order_to_partner"`
	OrderToMoulins  bool `json:"order_to_moulins"`
}

// DefaultTeamSettings applies to a member the partner never changed: they
// can add doctors (as before), and their orders go to the partner.
var DefaultTeamSettings = TeamSettings{CanAddDoctors: true, OrderToPartner: true}

// GetTeamSettings returns a member's settings, or the defaults.
func GetTeamSettings(ctx context.Context, db *pgxpool.Pool, memberID uuid.UUID) (TeamSettings, error) {
	s := DefaultTeamSettings
	err := db.QueryRow(ctx, `
		SELECT can_add_doctors, can_add_retailers, order_to_partner, order_to_moulins
		FROM team_member_settings WHERE member_id = $1`, memberID).
		Scan(&s.CanAddDoctors, &s.CanAddRetailers, &s.OrderToPartner, &s.OrderToMoulins)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultTeamSettings, nil
	}
	return s, err
}

// HiddenFromMember returns the ids of one kind ("doctor" | "retailer") hidden
// from a team member.
func HiddenFromMember(ctx context.Context, db *pgxpool.Pool, memberID uuid.UUID, kind string) (map[uuid.UUID]bool, error) {
	rows, err := db.Query(ctx, `SELECT target_id FROM team_member_hidden WHERE member_id = $1 AND kind = $2`, memberID, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID]bool{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// IsHiddenFromMember reports whether one doctor/retailer is hidden from the member.
func IsHiddenFromMember(ctx context.Context, db *pgxpool.Pool, memberID uuid.UUID, kind string, targetID uuid.UUID) (bool, error) {
	var hidden bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM team_member_hidden WHERE member_id = $1 AND kind = $2 AND target_id = $3)`,
		memberID, kind, targetID).Scan(&hidden)
	return hidden, err
}

// SaveTeamSettings stores a member's settings and replaces their hidden
// doctors and retailers, in one transaction. Only ids that belong to the
// partner are kept.
func SaveTeamSettings(ctx context.Context, db *pgxpool.Pool, partnerID, memberID uuid.UUID, s TeamSettings, hiddenDoctors, hiddenRetailers []uuid.UUID) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO team_member_settings (member_id, can_add_doctors, can_add_retailers, order_to_partner, order_to_moulins, updated_at)
		VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (member_id) DO UPDATE SET can_add_doctors = $2, can_add_retailers = $3,
		       order_to_partner = $4, order_to_moulins = $5, updated_at = now()`,
		memberID, s.CanAddDoctors, s.CanAddRetailers, s.OrderToPartner, s.OrderToMoulins); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM team_member_hidden WHERE member_id = $1`, memberID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO team_member_hidden (member_id, kind, target_id)
		SELECT $1, 'doctor', d.id FROM doctors d
		WHERE d.id = ANY($3::uuid[]) AND d.partner_id = $2 AND NOT d.is_deleted
		ON CONFLICT DO NOTHING`, memberID, partnerID, uuidStrings(hiddenDoctors)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO team_member_hidden (member_id, kind, target_id)
		SELECT $1, 'retailer', r.user_id FROM retailers r
		WHERE r.user_id = ANY($3::uuid[]) AND r.partner_id = $2 AND r.removed_at IS NULL
		ON CONFLICT DO NOTHING`, memberID, partnerID, uuidStrings(hiddenRetailers)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// TeamMemberOwner returns the partner a team member belongs to; ok is false
// when userID isn't a current team member.
func TeamMemberOwner(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (uuid.UUID, bool, error) {
	var owner *uuid.UUID
	err := db.QueryRow(ctx,
		`SELECT team_owner_id FROM users WHERE id = $1 AND role = 'team_member' AND deleted_at IS NULL`, userID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && owner == nil) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	return *owner, true, nil
}
