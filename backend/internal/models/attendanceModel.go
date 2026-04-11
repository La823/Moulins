package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Attendance struct {
	ID           uuid.UUID `json:"id"`
	EmployeeID   uuid.UUID `json:"employee_id"`
	EmployeeName string    `json:"employee_name,omitempty"`
	Date         string    `json:"date"`
	CheckInTime  string    `json:"check_in_time"`
	Status       string    `json:"status"`
	Description  *string   `json:"description,omitempty"`
	MarkedBy     uuid.UUID `json:"marked_by"`
	CreatedAt    time.Time `json:"created_at"`
}

type MarkAttendanceRequest struct {
	EmployeeID  uuid.UUID `json:"employee_id"`
	Date        string    `json:"date"`
	CheckInTime string    `json:"check_in_time"`
	Status      string    `json:"status"`
	Description *string   `json:"description,omitempty"`
}

func MarkAttendance(ctx context.Context, db *pgxpool.Pool, req MarkAttendanceRequest, markedBy uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO attendance (employee_id, date, check_in_time, status, description, marked_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (employee_id, date) DO UPDATE
		 SET check_in_time = $3, status = $4, description = $5, marked_by = $6, updated_at = NOW()
		 RETURNING id`,
		req.EmployeeID, req.Date, req.CheckInTime, req.Status, req.Description, markedBy,
	).Scan(&id)
	return id, err
}

func GetAttendanceByDate(ctx context.Context, db *pgxpool.Pool, date string) ([]Attendance, error) {
	rows, err := db.Query(ctx,
		`SELECT a.id, a.employee_id, COALESCE(u.username, u.phone_number) as employee_name,
		        a.date::text, a.check_in_time::text, a.status, a.description, a.marked_by, a.created_at
		 FROM attendance a
		 JOIN users u ON u.id = a.employee_id
		 WHERE a.date = $1
		 ORDER BY a.check_in_time`,
		date,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []Attendance{}
	for rows.Next() {
		var a Attendance
		if err := rows.Scan(&a.ID, &a.EmployeeID, &a.EmployeeName, &a.Date, &a.CheckInTime, &a.Status, &a.Description, &a.MarkedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, a)
	}
	return records, rows.Err()
}

func GetAttendanceByMonth(ctx context.Context, db *pgxpool.Pool, year, month int) ([]Attendance, error) {
	rows, err := db.Query(ctx,
		`SELECT a.id, a.employee_id, COALESCE(u.username, u.phone_number) as employee_name,
		        a.date::text, a.check_in_time::text, a.status, a.description, a.marked_by, a.created_at
		 FROM attendance a
		 JOIN users u ON u.id = a.employee_id
		 WHERE EXTRACT(YEAR FROM a.date) = $1 AND EXTRACT(MONTH FROM a.date) = $2
		 ORDER BY a.date, a.check_in_time`,
		year, month,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []Attendance{}
	for rows.Next() {
		var a Attendance
		if err := rows.Scan(&a.ID, &a.EmployeeID, &a.EmployeeName, &a.Date, &a.CheckInTime, &a.Status, &a.Description, &a.MarkedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, a)
	}
	return records, rows.Err()
}

func GetEmployeeAttendanceByMonth(ctx context.Context, db *pgxpool.Pool, employeeID uuid.UUID, year, month int) ([]Attendance, error) {
	rows, err := db.Query(ctx,
		`SELECT a.id, a.employee_id, COALESCE(u.username, u.phone_number) as employee_name,
		        a.date::text, a.check_in_time::text, a.status, a.description, a.marked_by, a.created_at
		 FROM attendance a
		 JOIN users u ON u.id = a.employee_id
		 WHERE a.employee_id = $1 AND EXTRACT(YEAR FROM a.date) = $2 AND EXTRACT(MONTH FROM a.date) = $3
		 ORDER BY a.date`,
		employeeID, year, month,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []Attendance{}
	for rows.Next() {
		var a Attendance
		if err := rows.Scan(&a.ID, &a.EmployeeID, &a.EmployeeName, &a.Date, &a.CheckInTime, &a.Status, &a.Description, &a.MarkedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, a)
	}
	return records, rows.Err()
}

func DeleteAttendance(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM attendance WHERE id = $1`, id)
	return err
}

// Settings helpers

func GetSetting(ctx context.Context, db *pgxpool.Pool, key string) (string, error) {
	var value string
	err := db.QueryRow(ctx, `SELECT value FROM admin_settings WHERE key = $1`, key).Scan(&value)
	return value, err
}

func SetSetting(ctx context.Context, db *pgxpool.Pool, key, value string) error {
	_, err := db.Exec(ctx,
		`INSERT INTO admin_settings (key, value) VALUES ($1, $2)
		 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
		key, value,
	)
	return err
}
