package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PermissionDef describes a single permission available in the system.
// Group clusters related view/edit/delete permissions together for the
// admin employee-permission editor UI — it has no effect on enforcement.
type PermissionDef struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Desc  string `json:"desc"`
	Group string `json:"group"`
}

// ValidPermissions is the single source of truth for all available
// permissions. Each panel gets its own view/edit/delete keys where that
// action actually exists server-side — a panel with no delete action
// (e.g. Meetings, which is admin-view-only) simply has no *_delete key.
// Add new permissions here and they propagate to backend validation and
// the API.
var ValidPermissions = []PermissionDef{
	// Products
	{Key: "products_view", Label: "Products (View)", Desc: "View products, categories, tags, units, and special products", Group: "Products"},
	{Key: "products_edit", Label: "Products (Edit)", Desc: "Create and edit products, categories, tags, units, and special products", Group: "Products"},
	{Key: "products_delete", Label: "Products (Delete)", Desc: "Delete products, categories, tags, units, and special products", Group: "Products"},

	// Graphics Design
	{Key: "graphics_design_view", Label: "Graphics Design (View)", Desc: "View product graphics design files", Group: "Graphics Design"},
	{Key: "graphics_design_edit", Label: "Graphics Design (Edit)", Desc: "Upload product graphics design files", Group: "Graphics Design"},
	{Key: "graphics_design_delete", Label: "Graphics Design (Delete)", Desc: "Delete product graphics design files", Group: "Graphics Design"},

	// Orders
	{Key: "orders_view", Label: "Orders (View)", Desc: "View partner orders and their details", Group: "Orders"},
	{Key: "orders_edit", Label: "Orders (Edit)", Desc: "Edit order status, item quantities, delivery details, and photos", Group: "Orders"},

	// Transports (mode of transportation master data, shown on the Orders panel)
	{Key: "transports_edit", Label: "Transports (Edit)", Desc: "Create and edit transports and transport modes", Group: "Orders"},
	{Key: "transports_delete", Label: "Transports (Delete)", Desc: "Delete transports and transport modes", Group: "Orders"},

	// Partners
	{Key: "partners_view", Label: "Partners (View)", Desc: "View partners, their doctors, and documents", Group: "Partners"},
	{Key: "partners_edit", Label: "Partners (Edit)", Desc: "Edit partner records, verify documents, link Marg/RID, create accounts", Group: "Partners"},
	{Key: "partners_delete", Label: "Partners (Delete)", Desc: "Delete partner accounts", Group: "Partners"},
	{Key: "partners_credentials", Label: "Partners (Credentials)", Desc: "Change a partner's login phone, email, and password", Group: "Partners"},

	// Deletion Requests
	{Key: "deletion_requests_view", Label: "Deletion Requests (View)", Desc: "View account deletion requests", Group: "Partners"},
	{Key: "deletion_requests_edit", Label: "Deletion Requests (Edit)", Desc: "Approve or reject account deletion requests", Group: "Partners"},

	// Employees
	{Key: "employees_view", Label: "Employees (View)", Desc: "View employee accounts and their permissions", Group: "Employees"},
	{Key: "employees_edit", Label: "Employees (Edit)", Desc: "Edit employee credentials, permissions, and role", Group: "Employees"},
	{Key: "employees_delete", Label: "Employees (Delete)", Desc: "Delete employee accounts", Group: "Employees"},

	// Admins
	{Key: "admins_view", Label: "Admins (View)", Desc: "View the list of admin accounts", Group: "Employees"},

	// Assignments (client-employee assignment)
	{Key: "assignments_view", Label: "Assignments (View)", Desc: "View client-employee assignments", Group: "Employees"},
	{Key: "assignments_edit", Label: "Assignments (Edit)", Desc: "Assign employees to clients", Group: "Employees"},
	{Key: "assignments_delete", Label: "Assignments (Delete)", Desc: "Remove client-employee assignments", Group: "Employees"},

	// Attendance
	{Key: "attendance_view", Label: "Attendance (View)", Desc: "View employee attendance records", Group: "Employees"},
	{Key: "attendance_edit", Label: "Attendance (Edit)", Desc: "Mark employee attendance", Group: "Employees"},
	{Key: "attendance_delete", Label: "Attendance (Delete)", Desc: "Delete attendance records", Group: "Employees"},

	// Meetings
	{Key: "meetings_view", Label: "Meetings (View)", Desc: "View and analyze partner/employee doctor meetings", Group: "Meetings & Requests"},

	// Requests
	{Key: "requests_view", Label: "Requests (View)", Desc: "View partner/employee requests", Group: "Meetings & Requests"},
	{Key: "requests_edit", Label: "Requests (Edit)", Desc: "Resolve partner/employee requests", Group: "Meetings & Requests"},

	// Ledger
	{Key: "ledger_view", Label: "Ledger (View)", Desc: "View a partner's account ledger", Group: "Finance"},
	{Key: "ledger_edit", Label: "Ledger (Edit)", Desc: "Upload and update partner account ledgers", Group: "Finance"},

	// Payments
	{Key: "payments_view", Label: "Payments (View)", Desc: "View partner payment submissions", Group: "Finance"},
	{Key: "payments_edit", Label: "Payments (Edit)", Desc: "Verify partner payment submissions", Group: "Finance"},

	// Purchase Orders
	{Key: "purchase_orders_view", Label: "Purchase Orders (View)", Desc: "View purchase orders", Group: "Finance"},
	{Key: "purchase_orders_edit", Label: "Purchase Orders (Edit)", Desc: "Create and edit purchase orders", Group: "Finance"},
	{Key: "purchase_orders_delete", Label: "Purchase Orders (Delete)", Desc: "Delete purchase orders", Group: "Finance"},

	// Learning
	{Key: "learning_view", Label: "Learning (View)", Desc: "Browse learning videos and playlists", Group: "Content"},
	{Key: "learning_edit", Label: "Learning (Edit)", Desc: "Create learning videos and playlists", Group: "Content"},
	{Key: "learning_delete", Label: "Learning (Delete)", Desc: "Delete learning videos and playlists", Group: "Content"},

	// Notifications
	{Key: "notifications_view", Label: "Notifications (View)", Desc: "View sent broadcast notifications", Group: "Content"},
	{Key: "notifications_edit", Label: "Notifications (Edit)", Desc: "Send broadcast notifications", Group: "Content"},

	// Broadcast Lists
	{Key: "broadcast_lists_view", Label: "Broadcast Lists (View)", Desc: "View personal broadcast lists", Group: "Content"},
	{Key: "broadcast_lists_edit", Label: "Broadcast Lists (Edit)", Desc: "Create and edit personal broadcast lists", Group: "Content"},
	{Key: "broadcast_lists_delete", Label: "Broadcast Lists (Delete)", Desc: "Delete personal broadcast lists", Group: "Content"},

	// Homepage
	{Key: "homepage_view", Label: "Homepage (View)", Desc: "View the homepage panel", Group: "Content"},
	{Key: "homepage_edit", Label: "Homepage (Edit)", Desc: "Edit homepage highlights, carousel, and focus sections", Group: "Content"},
	{Key: "homepage_delete", Label: "Homepage (Delete)", Desc: "Delete homepage carousel slides", Group: "Content"},

	// Careers
	{Key: "careers_view", Label: "Careers (View)", Desc: "View job openings and applications", Group: "Content"},
	{Key: "careers_edit", Label: "Careers (Edit)", Desc: "Create and edit job openings", Group: "Content"},
	{Key: "careers_delete", Label: "Careers (Delete)", Desc: "Delete job openings", Group: "Content"},

	// Email Templates
	{Key: "email_templates_view", Label: "Email Templates (View)", Desc: "View system email/whatsapp templates", Group: "Content"},
	{Key: "email_templates_edit", Label: "Email Templates (Edit)", Desc: "Edit system email/whatsapp templates", Group: "Content"},

	// Manufacturers
	{Key: "manufacturers_view", Label: "Manufacturers (View)", Desc: "View manufacturers", Group: "Products"},
	{Key: "manufacturers_edit", Label: "Manufacturers (Edit)", Desc: "Create and edit manufacturers", Group: "Products"},
	{Key: "manufacturers_delete", Label: "Manufacturers (Delete)", Desc: "Delete manufacturers", Group: "Products"},

	// Marg ERP
	{Key: "marg_master_view", Label: "Marg Master Data (View)", Desc: "View Marg ERP synced products and party accounts", Group: "Marg ERP"},
	{Key: "marg_master_edit", Label: "Marg Master Data (Edit)", Desc: "Trigger a Marg ERP master-data sync", Group: "Marg ERP"},

	// Settings
	{Key: "settings_view", Label: "Settings (View)", Desc: "View system settings", Group: "Settings"},
	{Key: "settings_edit", Label: "Settings (Edit)", Desc: "Change system settings", Group: "Settings"},
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
