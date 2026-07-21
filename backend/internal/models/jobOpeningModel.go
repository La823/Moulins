package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type JobOpening struct {
	ID             uuid.UUID `json:"id"`
	Title          string    `json:"title"`
	Department     string    `json:"department"`
	Location       string    `json:"location"`
	EmploymentType string    `json:"employment_type"`
	Description    string    `json:"description"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func CreateJobOpening(ctx context.Context, db *pgxpool.Pool, title, department, location, employmentType, description string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO job_openings (title, department, location, employment_type, description)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		title, department, location, employmentType, description,
	).Scan(&id)
	return id, err
}

func GetAllJobOpenings(ctx context.Context, db *pgxpool.Pool, activeOnly bool) ([]JobOpening, error) {
	query := `SELECT id, title, department, location, employment_type, description, is_active, created_at, updated_at
	          FROM job_openings`
	if activeOnly {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY created_at DESC`

	rows, err := db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []JobOpening{}
	for rows.Next() {
		var j JobOpening
		if err := rows.Scan(&j.ID, &j.Title, &j.Department, &j.Location, &j.EmploymentType, &j.Description, &j.IsActive, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, j)
	}
	return list, rows.Err()
}

func GetJobOpening(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*JobOpening, error) {
	var j JobOpening
	err := db.QueryRow(ctx,
		`SELECT id, title, department, location, employment_type, description, is_active, created_at, updated_at
		 FROM job_openings WHERE id = $1`, id,
	).Scan(&j.ID, &j.Title, &j.Department, &j.Location, &j.EmploymentType, &j.Description, &j.IsActive, &j.CreatedAt, &j.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func UpdateJobOpening(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, title, department, location, employmentType, description string, isActive bool) error {
	_, err := db.Exec(ctx,
		`UPDATE job_openings SET title = $1, department = $2, location = $3, employment_type = $4,
		 description = $5, is_active = $6, updated_at = now() WHERE id = $7`,
		title, department, location, employmentType, description, isActive, id,
	)
	return err
}

func DeleteJobOpening(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM job_openings WHERE id = $1`, id)
	return err
}
