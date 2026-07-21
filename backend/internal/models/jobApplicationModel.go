package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type JobApplication struct {
	ID        uuid.UUID `json:"id"`
	JobID     uuid.UUID `json:"job_id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Email     string    `json:"email,omitempty"`
	ResumeKey string    `json:"resume_key"`
	CreatedAt time.Time `json:"created_at"`
}

func CreateJobApplication(ctx context.Context, db *pgxpool.Pool, jobID uuid.UUID, name, phone, email, resumeKey string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO job_applications (job_id, name, phone, email, resume_key)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		jobID, name, phone, email, resumeKey,
	).Scan(&id)
	return id, err
}

func GetJobApplicationsForJob(ctx context.Context, db *pgxpool.Pool, jobID uuid.UUID) ([]JobApplication, error) {
	rows, err := db.Query(ctx,
		`SELECT id, job_id, name, phone, COALESCE(email, ''), resume_key, created_at
		 FROM job_applications WHERE job_id = $1 ORDER BY created_at DESC`, jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []JobApplication{}
	for rows.Next() {
		var a JobApplication
		if err := rows.Scan(&a.ID, &a.JobID, &a.Name, &a.Phone, &a.Email, &a.ResumeKey, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}
