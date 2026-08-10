package models

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrBroadcastListNotFound = errors.New("broadcast list not found")

type BroadcastList struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	CreatedBy   uuid.UUID `json:"created_by"`
	MemberCount int       `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// BroadcastListMember is a lightweight partner record, shaped for the list
// membership picker/detail view.
type BroadcastListMember struct {
	ID          uuid.UUID `json:"id"`
	Username    string    `json:"username"`
	PhoneNumber string    `json:"phone_number"`
}

// CreateBroadcastList creates a list owned by createdBy and seeds its
// members in one transaction. memberIDs are trusted to already be
// role='partner' (validated by the caller/handler via SearchUsers).
func CreateBroadcastList(ctx context.Context, db *pgxpool.Pool, name string, createdBy uuid.UUID, memberIDs []uuid.UUID) (uuid.UUID, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO broadcast_lists (name, created_by) VALUES ($1, $2) RETURNING id
	`, name, createdBy).Scan(&id); err != nil {
		return uuid.Nil, err
	}

	if len(memberIDs) > 0 {
		listIDs := make([]string, len(memberIDs))
		for i := range memberIDs {
			listIDs[i] = id.String()
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO broadcast_list_members (list_id, user_id)
			SELECT * FROM unnest($1::uuid[], $2::uuid[])
			ON CONFLICT DO NOTHING
		`, listIDs, uuidStrings(memberIDs)); err != nil {
			return uuid.Nil, err
		}
	}

	return id, tx.Commit(ctx)
}

func GetBroadcastListsByUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]BroadcastList, error) {
	rows, err := db.Query(ctx, `
		SELECT bl.id, bl.name, bl.created_by, bl.created_at,
			(SELECT COUNT(*) FROM broadcast_list_members m WHERE m.list_id = bl.id)
		FROM broadcast_lists bl
		WHERE bl.created_by = $1
		ORDER BY bl.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	lists := []BroadcastList{}
	for rows.Next() {
		var l BroadcastList
		if err := rows.Scan(&l.ID, &l.Name, &l.CreatedBy, &l.CreatedAt, &l.MemberCount); err != nil {
			return nil, err
		}
		lists = append(lists, l)
	}
	return lists, rows.Err()
}

// GetBroadcastListOwned fetches a list's metadata, scoped to its owner —
// used both to render the detail view and as the ownership check before
// any mutation.
func GetBroadcastListOwned(ctx context.Context, db *pgxpool.Pool, listID, ownerID uuid.UUID) (*BroadcastList, error) {
	var l BroadcastList
	err := db.QueryRow(ctx, `
		SELECT bl.id, bl.name, bl.created_by, bl.created_at,
			(SELECT COUNT(*) FROM broadcast_list_members m WHERE m.list_id = bl.id)
		FROM broadcast_lists bl
		WHERE bl.id = $1 AND bl.created_by = $2
	`, listID, ownerID).Scan(&l.ID, &l.Name, &l.CreatedBy, &l.CreatedAt, &l.MemberCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBroadcastListNotFound
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func GetBroadcastListMembers(ctx context.Context, db *pgxpool.Pool, listID uuid.UUID) ([]BroadcastListMember, error) {
	rows, err := db.Query(ctx, `
		SELECT u.id, COALESCE(u.username, ''), u.phone_number
		FROM broadcast_list_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.list_id = $1
		ORDER BY u.username
	`, listID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []BroadcastListMember{}
	for rows.Next() {
		var m BroadcastListMember
		if err := rows.Scan(&m.ID, &m.Username, &m.PhoneNumber); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// GetBroadcastListMemberIDs returns just the member user IDs — used by the
// notification dispatch path.
func GetBroadcastListMemberIDs(ctx context.Context, db *pgxpool.Pool, listID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := db.Query(ctx, `SELECT user_id FROM broadcast_list_members WHERE list_id = $1`, listID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// UpdateBroadcastList renames the list and replaces its full membership set,
// scoped to ownerID. Returns ErrBroadcastListNotFound if the list doesn't
// exist or isn't owned by ownerID.
func UpdateBroadcastList(ctx context.Context, db *pgxpool.Pool, listID, ownerID uuid.UUID, name string, memberIDs []uuid.UUID) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE broadcast_lists SET name = $1 WHERE id = $2 AND created_by = $3
	`, name, listID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBroadcastListNotFound
	}

	if _, err := tx.Exec(ctx, `DELETE FROM broadcast_list_members WHERE list_id = $1`, listID); err != nil {
		return err
	}

	if len(memberIDs) > 0 {
		listIDs := make([]string, len(memberIDs))
		for i := range memberIDs {
			listIDs[i] = listID.String()
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO broadcast_list_members (list_id, user_id)
			SELECT * FROM unnest($1::uuid[], $2::uuid[])
			ON CONFLICT DO NOTHING
		`, listIDs, uuidStrings(memberIDs)); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// DeleteBroadcastList deletes a list, scoped to ownerID. Returns
// ErrBroadcastListNotFound if the list doesn't exist or isn't owned by
// ownerID.
func DeleteBroadcastList(ctx context.Context, db *pgxpool.Pool, listID, ownerID uuid.UUID) error {
	tag, err := db.Exec(ctx, `DELETE FROM broadcast_lists WHERE id = $1 AND created_by = $2`, listID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBroadcastListNotFound
	}
	return nil
}
