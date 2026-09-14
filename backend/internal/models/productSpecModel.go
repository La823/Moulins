package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PMS (Product Manufacturer Specification) lets staff define, per product
// type (capsule, tablet, syrup, ...), a set of specification fields with a
// type (text/boolean/dropdown) — and for dropdown fields, the persisted list
// of options. This only defines the shape; actual per-PO values are stored
// elsewhere as a JSON blob keyed by field id.

type PMSFieldOption struct {
	ID          int    `json:"id"`
	FieldID     int    `json:"field_id"`
	OptionValue string `json:"option_value"`
	SortOrder   int    `json:"sort_order"`
}

type PMSField struct {
	ID        int              `json:"id"`
	TypeID    int              `json:"type_id"`
	FieldName string           `json:"field_name"`
	FieldType string           `json:"field_type"` // "text" | "boolean" | "dropdown"
	SortOrder int              `json:"sort_order"`
	Options   []PMSFieldOption `json:"options"`
}

type PMSType struct {
	ID     int        `json:"id"`
	Name   string     `json:"name"`
	Fields []PMSField `json:"fields"`
}

// ListPMSTypes returns every product type with its fields and (for dropdown
// fields) their options, nested — the shape the config UI renders directly.
func ListPMSTypes(ctx context.Context, db *pgxpool.Pool) ([]PMSType, error) {
	typeRows, err := db.Query(ctx, "SELECT id, name FROM pms_types ORDER BY name")
	if err != nil {
		return nil, err
	}
	types := []PMSType{}
	typeIndex := map[int]*PMSType{}
	for typeRows.Next() {
		var t PMSType
		if err := typeRows.Scan(&t.ID, &t.Name); err != nil {
			typeRows.Close()
			return nil, err
		}
		t.Fields = []PMSField{}
		types = append(types, t)
	}
	if err := typeRows.Err(); err != nil {
		typeRows.Close()
		return nil, err
	}
	typeRows.Close()
	for i := range types {
		typeIndex[types[i].ID] = &types[i]
	}

	fieldRows, err := db.Query(ctx, "SELECT id, type_id, field_name, field_type, sort_order FROM pms_fields ORDER BY sort_order, id")
	if err != nil {
		return nil, err
	}
	fieldIndex := map[int]*PMSField{}
	for fieldRows.Next() {
		var f PMSField
		if err := fieldRows.Scan(&f.ID, &f.TypeID, &f.FieldName, &f.FieldType, &f.SortOrder); err != nil {
			fieldRows.Close()
			return nil, err
		}
		f.Options = []PMSFieldOption{}
		t, ok := typeIndex[f.TypeID]
		if !ok {
			continue
		}
		t.Fields = append(t.Fields, f)
	}
	if err := fieldRows.Err(); err != nil {
		fieldRows.Close()
		return nil, err
	}
	fieldRows.Close()
	for i := range types {
		for j := range types[i].Fields {
			fieldIndex[types[i].Fields[j].ID] = &types[i].Fields[j]
		}
	}

	optRows, err := db.Query(ctx, "SELECT id, field_id, option_value, sort_order FROM pms_field_options ORDER BY sort_order, id")
	if err != nil {
		return nil, err
	}
	defer optRows.Close()
	for optRows.Next() {
		var o PMSFieldOption
		if err := optRows.Scan(&o.ID, &o.FieldID, &o.OptionValue, &o.SortOrder); err != nil {
			return nil, err
		}
		f, ok := fieldIndex[o.FieldID]
		if !ok {
			continue
		}
		f.Options = append(f.Options, o)
	}
	return types, optRows.Err()
}

// CreatePMSType adds a new product type (e.g. "Capsule").
func CreatePMSType(ctx context.Context, db *pgxpool.Pool, name string) (int, error) {
	var id int
	err := db.QueryRow(ctx, "INSERT INTO pms_types (name) VALUES ($1) RETURNING id", name).Scan(&id)
	return id, err
}

// DeletePMSType removes a product type and (via ON DELETE CASCADE) all of
// its fields and their dropdown options.
func DeletePMSType(ctx context.Context, db *pgxpool.Pool, id int) error {
	_, err := db.Exec(ctx, "DELETE FROM pms_types WHERE id = $1", id)
	return err
}

// CreatePMSField adds a specification field to a product type.
func CreatePMSField(ctx context.Context, db *pgxpool.Pool, typeID int, fieldName, fieldType string, sortOrder int) (int, error) {
	var id int
	err := db.QueryRow(ctx,
		"INSERT INTO pms_fields (type_id, field_name, field_type, sort_order) VALUES ($1, $2, $3, $4) RETURNING id",
		typeID, fieldName, fieldType, sortOrder,
	).Scan(&id)
	return id, err
}

// DeletePMSField removes a field and (via ON DELETE CASCADE) any dropdown
// options belonging to it.
func DeletePMSField(ctx context.Context, db *pgxpool.Pool, id int) error {
	_, err := db.Exec(ctx, "DELETE FROM pms_fields WHERE id = $1", id)
	return err
}

// CreatePMSFieldOption adds a persisted dropdown option to a dropdown field.
func CreatePMSFieldOption(ctx context.Context, db *pgxpool.Pool, fieldID int, optionValue string, sortOrder int) (int, error) {
	var id int
	err := db.QueryRow(ctx,
		"INSERT INTO pms_field_options (field_id, option_value, sort_order) VALUES ($1, $2, $3) RETURNING id",
		fieldID, optionValue, sortOrder,
	).Scan(&id)
	return id, err
}

// DeletePMSFieldOption removes one dropdown option.
func DeletePMSFieldOption(ctx context.Context, db *pgxpool.Pool, id int) error {
	_, err := db.Exec(ctx, "DELETE FROM pms_field_options WHERE id = $1", id)
	return err
}
