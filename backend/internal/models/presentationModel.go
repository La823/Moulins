package models

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Presentation is a partner-built slideshow deck — a named, ordered
// collection of product images (potentially spanning multiple products)
// they show doctors during a pitch. Private per partner (team members
// share their partner's decks, same as doctors/meetings).
type Presentation struct {
	ID                 uuid.UUID  `json:"id"`
	PartnerID          uuid.UUID  `json:"partner_id"`
	Name               string     `json:"name"`
	DoctorID           *uuid.UUID `json:"doctor_id,omitempty"`
	DoctorName         *string    `json:"doctor_name,omitempty"`
	IsDefaultForDoctor bool       `json:"is_default_for_doctor"`
	SlideCount         int        `json:"slide_count"`
	PreviewKeys        []string   `json:"-"`
	PreviewURLs        []string   `json:"preview_urls,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// presentationPreviewSlides is how many leading slides ListPresentationsByPartner
// returns thumbnail keys for — enough for a short visual preview strip
// without pulling every slide of every deck.
const presentationPreviewSlides = 4

// PresentationSlide is a single slide in a deck — denormalized with the
// image URL and owning product's name so the builder/viewer never needs
// N+1 lookups.
type PresentationSlide struct {
	ID             uuid.UUID `json:"id"`
	PresentationID uuid.UUID `json:"presentation_id"`
	ProductImageID uuid.UUID `json:"product_image_id"`
	ImageKey       string    `json:"-"`
	ImageURL       string    `json:"image_url,omitempty"`
	ProductID      uuid.UUID `json:"product_id"`
	ProductName    string    `json:"product_name"`
	SortOrder      int       `json:"sort_order"`
	CreatedAt      time.Time `json:"created_at"`
}

// CreatePresentation creates a deck, optionally linked to a doctor up
// front (or left nil — a deck doesn't have to be tied to any doctor).
func CreatePresentation(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID, name string, doctorID *uuid.UUID) (uuid.UUID, error) {
	if name == "" {
		name = "Untitled Presentation"
	}
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO partner_presentations (partner_id, name, doctor_id) VALUES ($1, $2, $3) RETURNING id`,
		partnerID, name, doctorID,
	).Scan(&id)
	return id, err
}

// ListPresentationsByPartner returns every deck the partner owns, newest
// first, with a slide count and the first few slides' image_keys (up to
// presentationPreviewSlides) as a preview strip — resolved to URLs by the
// caller, same as product images.
func ListPresentationsByPartner(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID) ([]Presentation, error) {
	rows, err := db.Query(ctx,
		`SELECT p.id, p.partner_id, p.name, p.doctor_id, d.name, p.is_default_for_doctor, p.created_at, p.updated_at,
			(SELECT COUNT(*) FROM presentation_slides s WHERE s.presentation_id = p.id) AS slide_count,
			(SELECT COALESCE(array_agg(t.image_key ORDER BY t.sort_order), '{}')
				FROM (
					SELECT pi.image_key, s.sort_order
					FROM presentation_slides s
					JOIN product_images pi ON pi.id = s.product_image_id
					WHERE s.presentation_id = p.id
					ORDER BY s.sort_order ASC
					LIMIT $2
				) t) AS preview_keys
		 FROM partner_presentations p
		 LEFT JOIN doctors d ON d.id = p.doctor_id
		 WHERE p.partner_id = $1
		 ORDER BY p.updated_at DESC`,
		partnerID, presentationPreviewSlides,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	presentations := []Presentation{}
	for rows.Next() {
		var p Presentation
		if err := rows.Scan(&p.ID, &p.PartnerID, &p.Name, &p.DoctorID, &p.DoctorName, &p.IsDefaultForDoctor, &p.CreatedAt, &p.UpdatedAt, &p.SlideCount, &p.PreviewKeys); err != nil {
			return nil, err
		}
		presentations = append(presentations, p)
	}
	return presentations, rows.Err()
}

func GetPresentationByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Presentation, error) {
	var p Presentation
	err := db.QueryRow(ctx,
		`SELECT p.id, p.partner_id, p.name, p.doctor_id, d.name, p.is_default_for_doctor, p.created_at, p.updated_at
		 FROM partner_presentations p
		 LEFT JOIN doctors d ON d.id = p.doctor_id
		 WHERE p.id = $1`,
		id,
	).Scan(&p.ID, &p.PartnerID, &p.Name, &p.DoctorID, &p.DoctorName, &p.IsDefaultForDoctor, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func GetPresentationSlides(ctx context.Context, db *pgxpool.Pool, presentationID uuid.UUID) ([]PresentationSlide, error) {
	rows, err := db.Query(ctx,
		`SELECT s.id, s.presentation_id, s.product_image_id, pi.image_key, pr.id, pr.name, s.sort_order, s.created_at
		 FROM presentation_slides s
		 JOIN product_images pi ON pi.id = s.product_image_id
		 JOIN products pr ON pr.id = pi.product_id
		 WHERE s.presentation_id = $1
		 ORDER BY s.sort_order ASC`,
		presentationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	slides := []PresentationSlide{}
	for rows.Next() {
		var s PresentationSlide
		if err := rows.Scan(&s.ID, &s.PresentationID, &s.ProductImageID, &s.ImageKey, &s.ProductID, &s.ProductName, &s.SortOrder, &s.CreatedAt); err != nil {
			return nil, err
		}
		slides = append(slides, s)
	}
	return slides, rows.Err()
}

// UpdatePresentation renames a deck and sets/clears its linked doctor in
// one call — doctorID nil clears the link (a deck doesn't have to stay
// tied to a doctor).
func UpdatePresentation(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, name string, doctorID *uuid.UUID) error {
	if name == "" {
		name = "Untitled Presentation"
	}
	_, err := db.Exec(ctx,
		`UPDATE partner_presentations SET name = $1, doctor_id = $2, updated_at = NOW() WHERE id = $3`,
		name, doctorID, id,
	)
	return err
}

// ReplaceSlides overwrites a deck's entire slide list with the given
// product images in the given order — the natural shape for a
// drag-and-drop builder that sends the final arrangement on save, rather
// than incremental per-slide move operations.
func ReplaceSlides(ctx context.Context, db *pgxpool.Pool, presentationID uuid.UUID, productImageIDs []uuid.UUID) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM presentation_slides WHERE presentation_id = $1`, presentationID); err != nil {
		return err
	}

	for i, imgID := range productImageIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO presentation_slides (presentation_id, product_image_id, sort_order) VALUES ($1, $2, $3)`,
			presentationID, imgID, i,
		); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE partner_presentations SET updated_at = NOW() WHERE id = $1`, presentationID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func DeletePresentation(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM partner_presentations WHERE id = $1`, id)
	return err
}

// GenerateDefaultPresentationForDoctor finds or creates the doctor's one
// "default" deck (enforced unique by a partial index) and (re)populates
// it with every visual_aid-flagged image from every product currently
// assigned to that doctor — repeat calls regenerate the same deck rather
// than piling up duplicates as the doctor's assigned products change.
func GenerateDefaultPresentationForDoctor(ctx context.Context, db *pgxpool.Pool, partnerID, doctorID uuid.UUID, doctorName string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`SELECT id FROM partner_presentations WHERE doctor_id = $1 AND is_default_for_doctor = TRUE`,
		doctorID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		name := doctorName + " — Default"
		if err := db.QueryRow(ctx,
			`INSERT INTO partner_presentations (partner_id, name, doctor_id, is_default_for_doctor) VALUES ($1, $2, $3, TRUE) RETURNING id`,
			partnerID, name, doctorID,
		).Scan(&id); err != nil {
			return uuid.Nil, err
		}
	} else if err != nil {
		return uuid.Nil, err
	}

	rows, err := db.Query(ctx,
		`SELECT pi.id
		 FROM doctor_products dp
		 JOIN product_images pi ON pi.product_id = dp.product_id
		 WHERE dp.doctor_id = $1 AND pi.visual_aid = TRUE
		 ORDER BY dp.created_at ASC, pi.sort_order ASC`,
		doctorID,
	)
	if err != nil {
		return uuid.Nil, err
	}
	imageIDs := []uuid.UUID{}
	for rows.Next() {
		var imgID uuid.UUID
		if err := rows.Scan(&imgID); err != nil {
			rows.Close()
			return uuid.Nil, err
		}
		imageIDs = append(imageIDs, imgID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return uuid.Nil, err
	}

	if err := ReplaceSlides(ctx, db, id, imageIDs); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}
