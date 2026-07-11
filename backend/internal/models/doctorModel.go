package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Doctor struct {
	ID               uuid.UUID  `json:"id"`
	CustomerID       uuid.UUID  `json:"customer_id"`
	Name             string     `json:"name"`
	Phone            *string    `json:"phone,omitempty"`
	ClinicName       *string    `json:"clinic_name,omitempty"`
	LastMeetingAt    *time.Time `json:"last_meeting_at,omitempty"`
	LastMeetingNotes *string    `json:"last_meeting_notes,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

type UpdateDoctorLastMeetingRequest struct {
	LastMeetingAt    *time.Time `json:"last_meeting_at"`
	LastMeetingNotes *string    `json:"last_meeting_notes"`
}

type DoctorProduct struct {
	ID          uuid.UUID `json:"id"`
	DoctorID    uuid.UUID `json:"doctor_id"`
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateDoctorRequest struct {
	Name       string  `json:"name"`
	Phone      *string `json:"phone,omitempty"`
	ClinicName *string `json:"clinic_name,omitempty"`
}

type AddDoctorProductRequest struct {
	ProductID uuid.UUID `json:"product_id"`
}

func CreateDoctor(ctx context.Context, db *pgxpool.Pool, customerID uuid.UUID, req CreateDoctorRequest) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO doctors (customer_id, name, phone, clinic_name) VALUES ($1, $2, $3, $4) RETURNING id`,
		customerID, req.Name, req.Phone, req.ClinicName,
	).Scan(&id)
	return id, err
}

func GetDoctorsByCustomer(ctx context.Context, db *pgxpool.Pool, customerID uuid.UUID) ([]Doctor, error) {
	rows, err := db.Query(ctx,
		`SELECT id, customer_id, name, phone, clinic_name, last_meeting_at, last_meeting_notes, created_at
		 FROM doctors WHERE customer_id = $1 ORDER BY created_at DESC`,
		customerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	doctors := []Doctor{}
	for rows.Next() {
		var d Doctor
		if err := rows.Scan(&d.ID, &d.CustomerID, &d.Name, &d.Phone, &d.ClinicName, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt); err != nil {
			return nil, err
		}
		doctors = append(doctors, d)
	}
	return doctors, rows.Err()
}

func GetDoctorByID(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) (*Doctor, error) {
	var d Doctor
	err := db.QueryRow(ctx,
		`SELECT id, customer_id, name, phone, clinic_name, last_meeting_at, last_meeting_notes, created_at FROM doctors WHERE id = $1`,
		doctorID,
	).Scan(&d.ID, &d.CustomerID, &d.Name, &d.Phone, &d.ClinicName, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// UpdateDoctorLastMeeting is the manual-edit path — the user can always
// hand-correct these fields even though they're also kept in sync
// automatically whenever a meeting with this doctor is marked completed
// (see SyncDoctorLastMeetingFromCompletedMeeting).
func UpdateDoctorLastMeeting(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, req UpdateDoctorLastMeetingRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE doctors SET last_meeting_at = $1, last_meeting_notes = $2 WHERE id = $3`,
		req.LastMeetingAt, req.LastMeetingNotes, doctorID,
	)
	return err
}

// SyncDoctorLastMeetingFromCompletedMeeting advances the doctor's last
// meeting date/notes to a just-completed meeting, but only if that
// meeting is the same age or newer than what's already stored — so
// completing an old backlogged meeting doesn't clobber a more recent
// manual edit or a more recent completed meeting.
func SyncDoctorLastMeetingFromCompletedMeeting(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, scheduledAt time.Time, notes *string) error {
	_, err := db.Exec(ctx,
		`UPDATE doctors SET last_meeting_at = $1, last_meeting_notes = $2
		 WHERE id = $3 AND (last_meeting_at IS NULL OR last_meeting_at <= $1)`,
		scheduledAt, notes, doctorID,
	)
	return err
}

func UpdateDoctor(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, req CreateDoctorRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE doctors SET name = $1, phone = $2, clinic_name = $3 WHERE id = $4`,
		req.Name, req.Phone, req.ClinicName, doctorID,
	)
	return err
}

func DeleteDoctor(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM doctors WHERE id = $1`, doctorID)
	return err
}

func AddDoctorProduct(ctx context.Context, db *pgxpool.Pool, doctorID, productID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO doctor_products (doctor_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		doctorID, productID,
	)
	return err
}

func GetDoctorProducts(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) ([]DoctorProduct, error) {
	rows, err := db.Query(ctx,
		`SELECT dp.id, dp.doctor_id, dp.product_id, p.name, dp.created_at
		 FROM doctor_products dp
		 JOIN products p ON p.id = dp.product_id
		 WHERE dp.doctor_id = $1
		 ORDER BY dp.created_at DESC`,
		doctorID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := []DoctorProduct{}
	for rows.Next() {
		var dp DoctorProduct
		if err := rows.Scan(&dp.ID, &dp.DoctorID, &dp.ProductID, &dp.ProductName, &dp.CreatedAt); err != nil {
			return nil, err
		}
		products = append(products, dp)
	}
	return products, rows.Err()
}

func RemoveDoctorProduct(ctx context.Context, db *pgxpool.Pool, doctorID, productID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`DELETE FROM doctor_products WHERE doctor_id = $1 AND product_id = $2`,
		doctorID, productID,
	)
	return err
}
