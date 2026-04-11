package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PermissionDef describes a single permission available in the system.
type PermissionDef struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Desc  string `json:"desc"`
}

// ValidPermissions is the single source of truth for all available permissions.
// Add new permissions here and they propagate to backend validation and the API.
var ValidPermissions = []PermissionDef{
	{Key: "products", Label: "Products", Desc: "Manage products, images, documents"},
	{Key: "orders", Label: "Orders", Desc: "View and manage customer orders"},
	{Key: "customers", Label: "Customers", Desc: "View and manage customers"},
}

// IsValidPermission checks whether a permission key exists in ValidPermissions.
func IsValidPermission(p string) bool {
	for _, vp := range ValidPermissions {
		if vp.Key == p {
			return true
		}
	}
	return false
}

func GetPermissions(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]string, error) {
	rows, err := db.Query(ctx,
		`SELECT permission FROM employee_permissions WHERE user_id = $1 ORDER BY permission`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	perms := []string{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, rows.Err()
}

func SetPermissions(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, permissions []string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Clear existing
	_, err = tx.Exec(ctx, `DELETE FROM employee_permissions WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}

	// Insert new
	for _, p := range permissions {
		_, err = tx.Exec(ctx,
			`INSERT INTO employee_permissions (user_id, permission) VALUES ($1, $2)`,
			userID, p,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func HasPermission(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, permission string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM employee_permissions WHERE user_id = $1 AND permission = $2)`,
		userID, permission,
	).Scan(&exists)
	return exists, err
}
