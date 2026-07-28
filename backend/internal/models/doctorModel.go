package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Doctor struct {
	ID               uuid.UUID  `json:"id"`
	PartnerID        uuid.UUID  `json:"partner_id"`
	Name             string     `json:"name"`
	Phone            *string    `json:"phone,omitempty"`
	Email            *string    `json:"email,omitempty"`
	Speciality       *string    `json:"speciality,omitempty"`
	ClinicName       *string    `json:"clinic_name,omitempty"`
	ClinicAddress    *string    `json:"clinic_address,omitempty"`
	Latitude         *float64   `json:"latitude,omitempty"`
	Longitude        *float64   `json:"longitude,omitempty"`
	DOB              *time.Time `json:"dob,omitempty"`
	LastMeetingAt    *time.Time `json:"last_meeting_at,omitempty"`
	LastMeetingNotes *string    `json:"last_meeting_notes,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// DoctorWithOwner adds the owning partner's name/phone plus the
// internal-only contact name — used only by admin-facing endpoints (the
// "all doctors" map), never by anything a partner can call.
type DoctorWithOwner struct {
	Doctor
	OwnerName           *string `json:"owner_name,omitempty"`
	OwnerPhone          string  `json:"owner_phone"`
	InternalContactName *string `json:"internal_contact_name,omitempty"`
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
	Name          string     `json:"name"`
	Phone         *string    `json:"phone,omitempty"`
	Email         *string    `json:"email,omitempty"`
	Speciality    *string    `json:"speciality,omitempty"`
	ClinicName    *string    `json:"clinic_name,omitempty"`
	ClinicAddress *string    `json:"clinic_address,omitempty"`
	Latitude      *float64   `json:"latitude,omitempty"`
	Longitude     *float64   `json:"longitude,omitempty"`
	DOB           *time.Time `json:"dob,omitempty"`
}

type AddDoctorProductRequest struct {
	ProductID uuid.UUID `json:"product_id"`
}

const doctorColumns = `id, partner_id, name, phone, email, speciality, clinic_name, clinic_address, latitude, longitude, dob, last_meeting_at, last_meeting_notes, created_at`

func scanDoctor(row interface{ Scan(...any) error }, d *Doctor) error {
	return row.Scan(&d.ID, &d.PartnerID, &d.Name, &d.Phone, &d.Email, &d.Speciality, &d.ClinicName, &d.ClinicAddress, &d.Latitude, &d.Longitude,
		&d.DOB, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt)
}

func CreateDoctor(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID, req CreateDoctorRequest) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO doctors (partner_id, name, phone, email, speciality, clinic_name, clinic_address, latitude, longitude, dob)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
		partnerID, req.Name, req.Phone, req.Email, req.Speciality, req.ClinicName, req.ClinicAddress, req.Latitude, req.Longitude, req.DOB,
	).Scan(&id)
	return id, err
}

// DoctorListItem is a Doctor plus its assigned-product count, for the
// partner's own doctor list card (avoids an N+1 query per doctor).
type DoctorListItem struct {
	Doctor
	ProductCount int `json:"product_count"`
}

func GetDoctorsByPartner(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID) ([]DoctorListItem, error) {
	rows, err := db.Query(ctx,
		`SELECT `+doctorColumns+`, (SELECT COUNT(*) FROM doctor_products dp WHERE dp.doctor_id = d.id) AS product_count
		 FROM doctors d WHERE d.partner_id = $1 AND d.is_deleted = FALSE ORDER BY d.created_at DESC`,
		partnerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	doctors := []DoctorListItem{}
	for rows.Next() {
		var d DoctorListItem
		if err := rows.Scan(&d.ID, &d.PartnerID, &d.Name, &d.Phone, &d.Email, &d.Speciality, &d.ClinicName, &d.ClinicAddress, &d.Latitude, &d.Longitude,
			&d.DOB, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt, &d.ProductCount); err != nil {
			return nil, err
		}
		doctors = append(doctors, d)
	}
	return doctors, rows.Err()
}

func GetDoctorByID(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) (*Doctor, error) {
	var d Doctor
	err := scanDoctor(db.QueryRow(ctx, `SELECT `+doctorColumns+` FROM doctors WHERE id = $1 AND is_deleted = FALSE`, doctorID), &d)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// GetDoctorsWithDOB returns every doctor with a birth date set, across all
// partners — the birthday scheduler runs globally, not per-user.
func GetDoctorsWithDOB(ctx context.Context, db *pgxpool.Pool) ([]Doctor, error) {
	rows, err := db.Query(ctx, `SELECT `+doctorColumns+` FROM doctors WHERE dob IS NOT NULL AND is_deleted = FALSE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	doctors := []Doctor{}
	for rows.Next() {
		var d Doctor
		if err := scanDoctor(rows, &d); err != nil {
			return nil, err
		}
		doctors = append(doctors, d)
	}
	return doctors, rows.Err()
}

// HasUpcomingBirthdayMeeting reports whether a doctor already has a
// not-yet-happened auto-created "Birthday" calendar entry — used by the
// scheduler to know whether next year's occurrence still needs creating.
func HasUpcomingBirthdayMeeting(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM meetings
			WHERE doctor_id = $1 AND title = 'Birthday' AND status = 'upcoming' AND scheduled_at > now()
		)`,
		doctorID,
	).Scan(&exists)
	return exists, err
}

// GetAllDoctorsWithLocation returns every doctor across every partner that
// has a pinned clinic location, for the admin-only doctors map.
func GetAllDoctorsWithLocation(ctx context.Context, db *pgxpool.Pool) ([]DoctorWithOwner, error) {
	rows, err := db.Query(ctx,
		`SELECT d.id, d.partner_id, d.name, d.phone, d.clinic_name, d.clinic_address, d.latitude, d.longitude,
		        d.dob, d.last_meeting_at, d.last_meeting_notes, d.created_at, u.username, u.phone_number, d.internal_contact_name
		 FROM doctors d
		 JOIN users u ON u.id = d.partner_id
		 WHERE d.latitude IS NOT NULL AND d.longitude IS NOT NULL AND d.is_deleted = FALSE
		 ORDER BY d.created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	doctors := []DoctorWithOwner{}
	for rows.Next() {
		var d DoctorWithOwner
		if err := rows.Scan(&d.ID, &d.PartnerID, &d.Name, &d.Phone, &d.ClinicName, &d.ClinicAddress, &d.Latitude, &d.Longitude,
			&d.DOB, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt, &d.OwnerName, &d.OwnerPhone, &d.InternalContactName); err != nil {
			return nil, err
		}
		doctors = append(doctors, d)
	}
	return doctors, rows.Err()
}

// UpdateDoctorInternalContactName is admin/staff-only — used to annotate a
// doctor record with an internal contact name for later data cleanup. Never
// surfaced through any partner-facing endpoint.
func UpdateDoctorInternalContactName(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, contactName *string) error {
	_, err := db.Exec(ctx, `UPDATE doctors SET internal_contact_name = $1 WHERE id = $2`, contactName, doctorID)
	return err
}

// MarkBirthdayReminderSent records that a doctor's birthday-countdown
// reminder went out for the given calendar date. Returns false if it was
// already recorded (i.e. already sent today), so the caller can skip it.
func MarkBirthdayReminderSent(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, date time.Time) (bool, error) {
	tag, err := db.Exec(ctx,
		`INSERT INTO doctor_birthday_reminders (doctor_id, reminder_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		doctorID, date.Format("2006-01-02"),
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
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
		`UPDATE doctors SET name = $1, phone = $2, email = $3, speciality = $4, clinic_name = $5, clinic_address = $6, latitude = $7, longitude = $8, dob = $9 WHERE id = $10`,
		req.Name, req.Phone, req.Email, req.Speciality, req.ClinicName, req.ClinicAddress, req.Latitude, req.Longitude, req.DOB, doctorID,
	)
	return err
}

// DeleteDoctor soft-deletes — the row (and its meeting/product history)
// stays in the database, just hidden from the partner going forward.
func DeleteDoctor(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) error {
	_, err := db.Exec(ctx, `UPDATE doctors SET is_deleted = TRUE WHERE id = $1`, doctorID)
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
