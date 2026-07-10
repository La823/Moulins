package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AssignedUser struct {
	ID          uuid.UUID `json:"id"`
	Username    *string   `json:"username,omitempty"`
	PhoneNumber string    `json:"phone_number"`
	Email       *string   `json:"email,omitempty"`
	Role        string    `json:"role"`
	AssignedAt  time.Time `json:"assigned_at"`
}

type Assignment struct {
	ID           uuid.UUID `json:"id"`
	ClientID     uuid.UUID `json:"client_id"`
	EmployeeID   uuid.UUID `json:"employee_id"`
	ClientName   string    `json:"client_name"`
	EmployeeName string    `json:"employee_name"`
	CreatedAt    time.Time `json:"created_at"`
}

type AssignEmployeeRequest struct {
	EmployeeID uuid.UUID `json:"employee_id"`
}

func AssignEmployeeToClient(ctx context.Context, db *pgxpool.Pool, clientID, employeeID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO client_employee_assignments (client_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		clientID, employeeID,
	)
	return err
}

func RemoveClientEmployeeAssignment(ctx context.Context, db *pgxpool.Pool, clientID, employeeID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`DELETE FROM client_employee_assignments WHERE client_id = $1 AND employee_id = $2`,
		clientID, employeeID,
	)
	return err
}

func GetEmployeesForClient(ctx context.Context, db *pgxpool.Pool, clientID uuid.UUID) ([]AssignedUser, error) {
	rows, err := db.Query(ctx,
		`SELECT u.id, u.username, u.phone_number, u.email, u.role, a.created_at
		 FROM client_employee_assignments a
		 JOIN users u ON u.id = a.employee_id
		 WHERE a.client_id = $1
		 ORDER BY a.created_at DESC`,
		clientID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []AssignedUser{}
	for rows.Next() {
		var u AssignedUser
		if err := rows.Scan(&u.ID, &u.Username, &u.PhoneNumber, &u.Email, &u.Role, &u.AssignedAt); err != nil {
			return nil, err
		}
		result = append(result, u)
	}
	return result, rows.Err()
}

func GetClientsForEmployee(ctx context.Context, db *pgxpool.Pool, employeeID uuid.UUID) ([]AssignedUser, error) {
	rows, err := db.Query(ctx,
		`SELECT u.id, u.username, u.phone_number, u.email, u.role, a.created_at
		 FROM client_employee_assignments a
		 JOIN users u ON u.id = a.client_id
		 WHERE a.employee_id = $1
		 ORDER BY a.created_at DESC`,
		employeeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []AssignedUser{}
	for rows.Next() {
		var u AssignedUser
		if err := rows.Scan(&u.ID, &u.Username, &u.PhoneNumber, &u.Email, &u.Role, &u.AssignedAt); err != nil {
			return nil, err
		}
		result = append(result, u)
	}
	return result, rows.Err()
}

func GetAllAssignments(ctx context.Context, db *pgxpool.Pool) ([]Assignment, error) {
	rows, err := db.Query(ctx,
		`SELECT a.id, a.client_id, a.employee_id,
		        COALESCE(c.username, c.phone_number) AS client_name,
		        COALESCE(e.username, e.phone_number) AS employee_name,
		        a.created_at
		 FROM client_employee_assignments a
		 JOIN users c ON c.id = a.client_id
		 JOIN users e ON e.id = a.employee_id
		 ORDER BY a.created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []Assignment{}
	for rows.Next() {
		var a Assignment
		if err := rows.Scan(&a.ID, &a.ClientID, &a.EmployeeID, &a.ClientName, &a.EmployeeName, &a.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}
