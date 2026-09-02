package models

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DateOnly unmarshals the "YYYY-MM-DD" string an HTML <input type="date">
// sends (time.Time's default JSON unmarshaling requires a full RFC3339
// timestamp and rejects a date-only string with a decode error).
type DateOnly time.Time

func (d *DateOnly) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	if s == "" {
		*d = DateOnly(time.Time{})
		return nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return err
	}
	*d = DateOnly(t)
	return nil
}

func (d DateOnly) Time() time.Time { return time.Time(d) }

// dateOnlyToTime converts a *DateOnly request field to the *time.Time the
// db layer and handlers expect, keeping the nil-ness of the pointer.
func dateOnlyToTime(d *DateOnly) *time.Time {
	if d == nil {
		return nil
	}
	t := d.Time()
	return &t
}

// ErrDoctorPhoneRequired and ErrDoctorPhoneTaken are returned by
// CreateDoctor/UpdateDoctor when the doctor's phone can't be used as their
// login identity — every doctor now needs a unique phone since it doubles
// as their doctor-role login.
var (
	ErrDoctorPhoneRequired = errors.New("phone is required")
	ErrDoctorPhoneTaken    = errors.New("phone number is already registered")
)

type Doctor struct {
	ID               uuid.UUID  `json:"id"`
	PartnerID        uuid.UUID  `json:"partner_id"`
	UserID           *uuid.UUID `json:"user_id,omitempty"`
	Name             string     `json:"name"`
	Phone            *string    `json:"phone,omitempty"`
	Email            *string    `json:"email,omitempty"`
	Speciality       *string    `json:"speciality,omitempty"`
	ClinicName       *string    `json:"clinic_name,omitempty"`
	ClinicAddress    *string    `json:"clinic_address,omitempty"`
	Latitude         *float64   `json:"latitude,omitempty"`
	Longitude        *float64   `json:"longitude,omitempty"`
	DOB              *time.Time `json:"dob,omitempty"`
	Anniversary      *time.Time `json:"anniversary,omitempty"`
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
	DOB           *DateOnly  `json:"dob,omitempty"`
	Anniversary   *DateOnly  `json:"anniversary,omitempty"`
}

type AddDoctorProductRequest struct {
	ProductID uuid.UUID `json:"product_id"`
}

const doctorColumns = `id, partner_id, user_id, name, phone, email, speciality, clinic_name, clinic_address, latitude, longitude, dob, anniversary, last_meeting_at, last_meeting_notes, created_at`

func scanDoctor(row interface{ Scan(...any) error }, d *Doctor) error {
	return row.Scan(&d.ID, &d.PartnerID, &d.UserID, &d.Name, &d.Phone, &d.Email, &d.Speciality, &d.ClinicName, &d.ClinicAddress, &d.Latitude, &d.Longitude,
		&d.DOB, &d.Anniversary, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt)
}

// CreateDoctor creates the doctor record and, since a doctor's phone
// doubles as their doctor-role login identity, provisions a linked login
// account for them in the same call. The phone must be present and not
// already registered to another user.
func CreateDoctor(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID, req CreateDoctorRequest) (uuid.UUID, error) {
	if req.Phone == nil || *req.Phone == "" {
		return uuid.Nil, ErrDoctorPhoneRequired
	}
	if _, err := GetUserByPhone(ctx, db, *req.Phone); err == nil {
		return uuid.Nil, ErrDoctorPhoneTaken
	}

	userID, err := CreateDoctorUser(ctx, db, *req.Phone)
	if err != nil {
		return uuid.Nil, err
	}

	var id uuid.UUID
	err = db.QueryRow(ctx,
		`INSERT INTO doctors (partner_id, user_id, name, phone, email, speciality, clinic_name, clinic_address, latitude, longitude, dob, anniversary)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
		partnerID, userID, req.Name, req.Phone, req.Email, req.Speciality, req.ClinicName, req.ClinicAddress, req.Latitude, req.Longitude, dateOnlyToTime(req.DOB), dateOnlyToTime(req.Anniversary),
	).Scan(&id)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
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
		if err := rows.Scan(&d.ID, &d.PartnerID, &d.UserID, &d.Name, &d.Phone, &d.Email, &d.Speciality, &d.ClinicName, &d.ClinicAddress, &d.Latitude, &d.Longitude,
			&d.DOB, &d.Anniversary, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt, &d.ProductCount); err != nil {
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

// GetDoctorsWithAnniversary returns every doctor with an anniversary date
// set, across all partners — mirrors GetDoctorsWithDOB.
func GetDoctorsWithAnniversary(ctx context.Context, db *pgxpool.Pool) ([]Doctor, error) {
	rows, err := db.Query(ctx, `SELECT `+doctorColumns+` FROM doctors WHERE anniversary IS NOT NULL AND is_deleted = FALSE`)
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

// HasUpcomingAnniversaryMeeting mirrors HasUpcomingBirthdayMeeting for the
// "Anniversary" auto-created calendar entry.
func HasUpcomingAnniversaryMeeting(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM meetings
			WHERE doctor_id = $1 AND title = 'Anniversary' AND status = 'upcoming' AND scheduled_at > now()
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
		        d.dob, d.anniversary, d.last_meeting_at, d.last_meeting_notes, d.created_at, u.username, u.phone_number, d.internal_contact_name
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
			&d.DOB, &d.Anniversary, &d.LastMeetingAt, &d.LastMeetingNotes, &d.CreatedAt, &d.OwnerName, &d.OwnerPhone, &d.InternalContactName); err != nil {
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

// MarkAnniversaryReminderSent mirrors MarkBirthdayReminderSent for the
// anniversary-countdown reminder.
func MarkAnniversaryReminderSent(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, date time.Time) (bool, error) {
	tag, err := db.Exec(ctx,
		`INSERT INTO doctor_anniversary_reminders (doctor_id, reminder_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
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

// UpdateDoctor updates the doctor record and, if the phone changed, keeps
// the linked login account's phone_number (their login identity) in sync —
// rejecting the change if the new phone is already registered to someone
// else.
func UpdateDoctor(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, req CreateDoctorRequest) error {
	if req.Phone == nil || *req.Phone == "" {
		return ErrDoctorPhoneRequired
	}

	existing, err := GetDoctorByID(ctx, db, doctorID)
	if err != nil {
		return err
	}

	if existing.Phone == nil || *existing.Phone != *req.Phone {
		if other, err := GetUserByPhone(ctx, db, *req.Phone); err == nil && (existing.UserID == nil || other.ID != *existing.UserID) {
			return ErrDoctorPhoneTaken
		}
		if existing.UserID != nil {
			if _, err := db.Exec(ctx, `UPDATE users SET phone_number = $1, updated_at = NOW() WHERE id = $2`, *req.Phone, *existing.UserID); err != nil {
				return err
			}
		}
	}

	_, err = db.Exec(ctx,
		`UPDATE doctors SET name = $1, phone = $2, email = $3, speciality = $4, clinic_name = $5, clinic_address = $6, latitude = $7, longitude = $8, dob = $9, anniversary = $10 WHERE id = $11`,
		req.Name, req.Phone, req.Email, req.Speciality, req.ClinicName, req.ClinicAddress, req.Latitude, req.Longitude, dateOnlyToTime(req.DOB), dateOnlyToTime(req.Anniversary), doctorID,
	)
	return err
}

// UpdateDoctorSelfRequest is what a doctor can change about their own
// profile — deliberately narrower than CreateDoctorRequest: no phone
// (that's their login identity, changed only by staff), no speciality
// (dropped from the self-service profile), no DOB (partner/staff-managed
// for birthday reminders), and no lat/lng (clinic location is set by the
// partner who added them, not self-editable — untouched by this update).
type UpdateDoctorSelfRequest struct {
	Name          string  `json:"name"`
	Email         *string `json:"email,omitempty"`
	ClinicName    *string `json:"clinic_name,omitempty"`
	ClinicAddress *string `json:"clinic_address,omitempty"`
}

// UpdateDoctorSelf lets a doctor edit their own name/email/clinic
// name/address — never their phone (login identity, staff-only),
// speciality, or clinic location (removed from the self-service profile).
func UpdateDoctorSelf(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID, req UpdateDoctorSelfRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE doctors SET name = $1, email = $2, clinic_name = $3, clinic_address = $4 WHERE id = $5`,
		req.Name, req.Email, req.ClinicName, req.ClinicAddress, doctorID,
	)
	return err
}

// GetDoctorByUserID looks up the doctor record linked to a doctor-role
// login — used by GET /doctor/me so a logged-in doctor can see their own
// profile.
func GetDoctorByUserID(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (*Doctor, error) {
	var d Doctor
	err := scanDoctor(db.QueryRow(ctx, `SELECT `+doctorColumns+` FROM doctors WHERE user_id = $1 AND is_deleted = FALSE`, userID), &d)
	if err != nil {
		return nil, err
	}
	return &d, nil
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
