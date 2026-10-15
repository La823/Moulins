package models

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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
	ID        int    `json:"id"`
	TypeID    int    `json:"type_id"`
	FieldName string `json:"field_name"`
	FieldType string `json:"field_type"` // "text" | "boolean" | "dropdown" | "image"
	SortOrder int    `json:"sort_order"`
	// IsRequired: values can't be saved with this field left empty.
	IsRequired bool             `json:"is_required"`
	Options    []PMSFieldOption `json:"options"`
	// ShowIfFieldID / ShowIfValues: shown only when that field (a Yes/No or
	// dropdown of the same type) has one of these answers. Nil = always.
	ShowIfFieldID *int  `json:"show_if_field_id"`
	ShowIfValues  []any `json:"show_if_values"`
}

// PMSType is the specification set for one product form. Name is the
// form's current name, read live from product_forms, so a rename carries
// through; ProductFormID is the link.
type PMSType struct {
	ID            int        `json:"id"`
	Name          string     `json:"name"`
	ProductFormID *int       `json:"product_form_id"`
	Fields        []PMSField `json:"fields"`
}

// ListPMSTypes returns every product type with its fields and (for dropdown
// fields) their options, nested — the shape the config UI renders directly.
func ListPMSTypes(ctx context.Context, db *pgxpool.Pool) ([]PMSType, error) {
	// current forms first; then types whose form was removed (kept so
	// their specifications aren't lost)
	typeRows, err := db.Query(ctx,
		`SELECT t.id, COALESCE(f.name, t.name, ''), t.product_form_id
		 FROM pms_types t LEFT JOIN product_forms f ON f.id = t.product_form_id
		 ORDER BY (t.product_form_id IS NULL), lower(COALESCE(f.name, t.name, ''))`)
	if err != nil {
		return nil, err
	}
	types := []PMSType{}
	typeIndex := map[int]*PMSType{}
	for typeRows.Next() {
		var t PMSType
		if err := typeRows.Scan(&t.ID, &t.Name, &t.ProductFormID); err != nil {
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

	fieldRows, err := db.Query(ctx, "SELECT id, type_id, field_name, field_type, sort_order, is_required, show_if_field_id, show_if_values FROM pms_fields ORDER BY sort_order, id")
	if err != nil {
		return nil, err
	}
	fieldIndex := map[int]*PMSField{}
	for fieldRows.Next() {
		var f PMSField
		var showIf []byte
		if err := fieldRows.Scan(&f.ID, &f.TypeID, &f.FieldName, &f.FieldType, &f.SortOrder, &f.IsRequired, &f.ShowIfFieldID, &showIf); err != nil {
			fieldRows.Close()
			return nil, err
		}
		if len(showIf) > 0 {
			_ = json.Unmarshal(showIf, &f.ShowIfValues)
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

// CreatePMSField adds a specification field to a product type.
func CreatePMSField(ctx context.Context, db *pgxpool.Pool, typeID int, fieldName, fieldType string, sortOrder int, isRequired bool) (int, error) {
	var id int
	// No position given: the new field goes last, after any reordering.
	err := db.QueryRow(ctx,
		`INSERT INTO pms_fields (type_id, field_name, field_type, sort_order, is_required)
		 SELECT $1, $2, $3,
		        CASE WHEN $4 > 0 THEN $4 ELSE COALESCE((SELECT MAX(sort_order) FROM pms_fields WHERE type_id = $1), 0) + 1 END,
		        $5
		 RETURNING id`,
		typeID, fieldName, fieldType, sortOrder, isRequired,
	).Scan(&id)
	return id, err
}

// ErrFieldOrder: the list sent isn't exactly this type's fields.
var ErrFieldOrder = fmt.Errorf("the field order must list each of this type's fields exactly once")

// ReorderPMSFields sets a type's field order to fieldIDs (first = top), in
// one statement. fieldIDs must be exactly the type's fields, so a stale
// page can't scramble an order someone else changed.
func ReorderPMSFields(ctx context.Context, db *pgxpool.Pool, typeID int, fieldIDs []int) error {
	var current []int
	rows, err := db.Query(ctx, "SELECT id FROM pms_fields WHERE type_id = $1", typeID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		current = append(current, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	seen := make(map[int]bool, len(fieldIDs))
	for _, id := range fieldIDs {
		if seen[id] {
			return ErrFieldOrder
		}
		seen[id] = true
	}
	if len(fieldIDs) != len(current) {
		return ErrFieldOrder
	}
	for _, id := range current {
		if !seen[id] {
			return ErrFieldOrder
		}
	}

	ids := make([]int32, len(fieldIDs))
	for i, id := range fieldIDs {
		ids[i] = int32(id)
	}
	_, err = db.Exec(ctx,
		`UPDATE pms_fields f SET sort_order = x.ord
		 FROM unnest($1::int[]) WITH ORDINALITY AS x(id, ord)
		 WHERE f.id = x.id AND f.type_id = $2`,
		ids, typeID)
	return err
}

// SetPMSFieldRequired turns a field's "mandatory" setting on or off.
// Returns pgx.ErrNoRows when there is no such field.
func SetPMSFieldRequired(ctx context.Context, db *pgxpool.Pool, id int, required bool) error {
	tag, err := db.Exec(ctx, "UPDATE pms_fields SET is_required = $1 WHERE id = $2", required, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// MissingRequiredError lists the mandatory fields left empty; its message is
// shown to the person saving as-is.
type MissingRequiredError struct{ Fields []string }

func (e *MissingRequiredError) Error() string {
	return "Please fill in the required fields: " + strings.Join(e.Fields, ", ")
}

// specValueFilled: a yes/no answered either way, any non-blank text or
// dropdown choice, an uploaded image's URL.
func specValueFilled(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case string:
		return strings.TrimSpace(x) != ""
	default:
		return true
	}
}

// VisibleFields reports, for each field of t, whether it is shown given
// these values: a field with a rule shows only when the field it depends on
// is itself shown and holds one of the rule's answers.
func VisibleFields(t *PMSType, values map[string]any) map[int]bool {
	byID := make(map[int]*PMSField, len(t.Fields))
	for i := range t.Fields {
		byID[t.Fields[i].ID] = &t.Fields[i]
	}
	memo := map[int]bool{}
	var visible func(f *PMSField, depth int) bool
	visible = func(f *PMSField, depth int) bool {
		if v, ok := memo[f.ID]; ok {
			return v
		}
		result := true
		if f.ShowIfFieldID != nil {
			ctrl, ok := byID[*f.ShowIfFieldID]
			switch {
			case !ok:
				result = true // the field it depended on is gone
			case depth > len(t.Fields):
				result = false // a loop; never saved, but never hang on one
			default:
				result = visible(ctrl, depth+1) && answerMatches(values[strconv.Itoa(ctrl.ID)], f.ShowIfValues)
			}
		}
		memo[f.ID] = result
		return result
	}
	out := make(map[int]bool, len(t.Fields))
	for i := range t.Fields {
		out[t.Fields[i].ID] = visible(&t.Fields[i], 0)
	}
	return out
}

// answerMatches: the controlling field's value is one of the rule's answers.
// Yes/No answers compare as booleans, dropdown answers as text.
func answerMatches(value any, answers []any) bool {
	for _, a := range answers {
		switch av := a.(type) {
		case bool:
			if vb, ok := value.(bool); ok && vb == av {
				return true
			}
		case string:
			if vs, ok := value.(string); ok && vs == av {
				return true
			}
		}
	}
	return false
}

// missingRequired returns the names of t's mandatory fields with no value.
// A hidden field is never required.
func missingRequired(t *PMSType, values map[string]any) error {
	shown := VisibleFields(t, values)
	var missing []string
	for _, f := range t.Fields {
		if f.IsRequired && shown[f.ID] && !specValueFilled(values[strconv.Itoa(f.ID)]) {
			missing = append(missing, f.FieldName)
		}
	}
	if len(missing) > 0 {
		return &MissingRequiredError{Fields: missing}
	}
	return nil
}

// NormalizeSpecs checks a specifications blob (keyed by field id) against
// its type: mandatory fields that are shown must be filled, and values of
// fields hidden by a rule are dropped. Returns the blob to store. No type,
// or no blob, passes through unchanged.
func NormalizeSpecs(ctx context.Context, db *pgxpool.Pool, typeID *int, specs json.RawMessage) (json.RawMessage, error) {
	if typeID == nil {
		return specs, nil
	}
	values := map[string]any{}
	if len(specs) > 0 && string(specs) != "null" {
		if err := json.Unmarshal(specs, &values); err != nil {
			return nil, fmt.Errorf("specifications must be an object keyed by field id")
		}
	}
	types, err := ListPMSTypes(ctx, db)
	if err != nil {
		return nil, err
	}
	for i := range types {
		t := &types[i]
		if t.ID != *typeID {
			continue
		}
		if err := missingRequired(t, values); err != nil {
			return nil, err
		}
		if len(specs) == 0 || string(specs) == "null" {
			return specs, nil
		}
		shown := VisibleFields(t, values)
		kept := map[string]any{}
		for k, v := range values {
			if id, err := strconv.Atoi(k); err == nil {
				if isShown, isField := shown[id]; isField && !isShown {
					continue // a field hidden by its rule
				}
			}
			kept[k] = v
		}
		return json.Marshal(kept)
	}
	return specs, nil
}

// ErrBadCondition explains why a field's rule can't be saved; shown as-is.
type ErrBadCondition struct{ Msg string }

func (e *ErrBadCondition) Error() string { return e.Msg }

// SetPMSFieldCondition sets (or, with controllerID nil, removes) the rule
// "show this field only when <controller> is one of <answers>". The
// controller must be a Yes/No or dropdown field of the same type, not the
// field itself, and not one that already depends on it (no loops).
func SetPMSFieldCondition(ctx context.Context, db *pgxpool.Pool, fieldID int, controllerID *int, answers []any) error {
	if controllerID == nil {
		tag, err := db.Exec(ctx, `UPDATE pms_fields SET show_if_field_id = NULL, show_if_values = NULL WHERE id = $1`, fieldID)
		if err == nil && tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return err
	}

	types, err := ListPMSTypes(ctx, db)
	if err != nil {
		return err
	}
	var t *PMSType
	var field, ctrl *PMSField
	for i := range types {
		for j := range types[i].Fields {
			f := &types[i].Fields[j]
			if f.ID == fieldID {
				t, field = &types[i], f
			}
		}
	}
	if field == nil {
		return pgx.ErrNoRows
	}
	for j := range t.Fields {
		if t.Fields[j].ID == *controllerID {
			ctrl = &t.Fields[j]
		}
	}
	switch {
	case ctrl == nil:
		return &ErrBadCondition{"the field it depends on must be in the same type"}
	case ctrl.ID == field.ID:
		return &ErrBadCondition{"a field can't depend on itself"}
	case ctrl.FieldType != "boolean" && ctrl.FieldType != "dropdown":
		return &ErrBadCondition{"only a Yes/No or dropdown field can control another field"}
	case len(answers) == 0:
		return &ErrBadCondition{"choose at least one answer that shows this field"}
	}
	for _, a := range answers {
		if _, ok := a.(bool); ctrl.FieldType == "boolean" && !ok {
			return &ErrBadCondition{"a Yes/No field's answer must be Yes or No"}
		}
		if _, ok := a.(string); ctrl.FieldType == "dropdown" && !ok {
			return &ErrBadCondition{"a dropdown field's answers must be its options"}
		}
	}
	// no loops: walk up from the controller; reaching this field means the
	// controller already depends on it
	byID := map[int]*PMSField{}
	for j := range t.Fields {
		byID[t.Fields[j].ID] = &t.Fields[j]
	}
	for cur, steps := ctrl, 0; cur != nil && cur.ShowIfFieldID != nil && steps <= len(t.Fields); steps++ {
		if *cur.ShowIfFieldID == field.ID {
			return &ErrBadCondition{fmt.Sprintf("%q already depends on %q — that would be a loop", ctrl.FieldName, field.FieldName)}
		}
		cur = byID[*cur.ShowIfFieldID]
	}

	blob, err := json.Marshal(answers)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `UPDATE pms_fields SET show_if_field_id = $1, show_if_values = $2::jsonb WHERE id = $3`,
		*controllerID, string(blob), fieldID)
	return err
}

// DeletePMSField removes a field and (via ON DELETE CASCADE) any dropdown
// options belonging to it.
//
// It also strips the field's answers off every product. Those live in
// products.pms_specifications as a JSONB object keyed by field id, which no
// foreign key reaches, so the cascade cannot clean them: deleting a field used
// to leave its value behind under a key that no longer resolves to anything.
func DeletePMSField(ctx context.Context, db *pgxpool.Pool, id int) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	key := strconv.Itoa(id)
	// The `?` guard also keeps the `-` operator away from rows holding a JSON
	// scalar rather than an object, where subtracting a key would error.
	if _, err := tx.Exec(ctx, `
		UPDATE products
		SET pms_specifications = pms_specifications - $1::text
		WHERE pms_specifications ? $1::text`, key); err != nil {
		return err
	}
	// fields that depended on this one lose their rule (always shown)
	if _, err := tx.Exec(ctx, "UPDATE pms_fields SET show_if_field_id = NULL, show_if_values = NULL WHERE show_if_field_id = $1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM pms_fields WHERE id = $1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
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
//
// A rule that showed a field on this option loses that answer; a rule left
// with no answers is removed, so the field is shown rather than hidden for
// good.
func DeletePMSFieldOption(ctx context.Context, db *pgxpool.Pool, id int) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var fieldID int
	var value string
	err = tx.QueryRow(ctx, "DELETE FROM pms_field_options WHERE id = $1 RETURNING field_id, option_value", id).Scan(&fieldID, &value)
	if err == pgx.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE pms_fields SET show_if_values = show_if_values - $2::text
		 WHERE show_if_field_id = $1 AND show_if_values ? $2::text`, fieldID, value); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE pms_fields SET show_if_field_id = NULL, show_if_values = NULL
		 WHERE show_if_field_id = $1 AND jsonb_array_length(show_if_values) = 0`, fieldID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ProductSpecRow is the trimmed view the "assign specs to products" page
// needs — just enough to identify the product and show/edit its assigned
// PMS type and field values.
type ProductSpecRow struct {
	ID             uuid.UUID       `json:"id"`
	ProductID      int             `json:"product_id"`
	Name           string          `json:"name"`
	MargCode       *string         `json:"marg_code"`
	PMSTypeID      *int            `json:"pms_type_id"`
	Specifications json.RawMessage `json:"specifications"`
}

// ListProductSpecifications returns one page of products for the spec
// assignment page, optionally filtered by name search and/or whether a spec
// type has been assigned yet, sorted by serial id (product_id) in either
// direction. hasSpec: "" no filter, "true" only rows with a pms_type_id
// assigned, "false" only rows without one. sortDir: "asc" or anything else
// (defaults to "desc", most recently added first).
func ListProductSpecifications(ctx context.Context, db *pgxpool.Pool, limit, offset int, search, hasSpec, sortDir string) ([]ProductSpecRow, int, error) {
	var conditions []string
	var args []interface{}
	if search != "" {
		args = append(args, "%"+search+"%")
		conditions = append(conditions, fmt.Sprintf("name ILIKE $%d", len(args)))
	}
	if hasSpec == "true" {
		conditions = append(conditions, "pms_type_id IS NOT NULL")
	} else if hasSpec == "false" {
		conditions = append(conditions, "pms_type_id IS NULL")
	}
	var where string
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	if err := db.QueryRow(ctx, "SELECT count(*) FROM products "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	dir := "DESC"
	if sortDir == "asc" {
		dir = "ASC"
	}

	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	query := fmt.Sprintf(`
		SELECT id, product_id, name, marg_code, pms_type_id, pms_specifications
		FROM products
		%s
		ORDER BY product_id %s
		LIMIT $%d OFFSET $%d
	`, where, dir, limitPos, offsetPos)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	result := make([]ProductSpecRow, 0, limit)
	for rows.Next() {
		var r ProductSpecRow
		if err := rows.Scan(&r.ID, &r.ProductID, &r.Name, &r.MargCode, &r.PMSTypeID, &r.Specifications); err != nil {
			return nil, 0, err
		}
		result = append(result, r)
	}
	return result, total, rows.Err()
}

// UpdateProductSpecifications sets the PMS type and/or field values for one
// product. specs may be nil to clear it (e.g. when switching to a different
// type).
func UpdateProductSpecifications(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, pmsTypeID *int, specs json.RawMessage) error {
	// A JSON body of "specifications": null decodes into RawMessage as the
	// literal 4-byte "null", not an empty/nil slice — normalize both to nil
	// so we store SQL NULL rather than the JSON value null.
	if len(specs) == 0 || string(specs) == "null" {
		specs = nil
	}
	_, err := db.Exec(ctx,
		"UPDATE products SET pms_type_id = $1, pms_specifications = $2 WHERE id = $3",
		pmsTypeID, specs, id,
	)
	return err
}

// GetProductSpecByName finds the catalog product whose name exactly matches
// (case/whitespace-insensitive) and returns its assigned PMS type/values —
// used by the "New Purchase Order" form to preview a product's spec before
// it gets snapshotted onto the PO at creation time. Returns (nil, nil) if
// there's no matching product or it has no spec assigned — not an error.
func GetProductSpecByName(ctx context.Context, db *pgxpool.Pool, name string) (*ProductSpecRow, error) {
	var r ProductSpecRow
	err := db.QueryRow(ctx,
		`SELECT id, product_id, name, marg_code, pms_type_id, pms_specifications
		 FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
		name,
	).Scan(&r.ID, &r.ProductID, &r.Name, &r.MargCode, &r.PMSTypeID, &r.Specifications)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if r.PMSTypeID == nil {
		return nil, nil
	}
	return &r, nil
}

// ProductDefaultSpecs is what the product page needs to show and edit a
// product's default specifications: its product form, the specification
// type set up for that form (nil if none yet), and the values saved so far.
type ProductDefaultSpecs struct {
	ProductFormID  *int            `json:"product_form_id"`
	ProductForm    string          `json:"product_form"`
	Type           *PMSType        `json:"type"`
	SavedPMSTypeID *int            `json:"saved_pms_type_id"`
	SavedTypeName  string          `json:"saved_type_name,omitempty"`
	Specifications json.RawMessage `json:"specifications"`
}

// ErrNoSpecTypeForForm: the product's form has no specification type yet.
var ErrNoSpecTypeForForm = fmt.Errorf("this product's form has no specification fields set up yet")

// GetProductDefaultSpecs loads a product's default specifications. The
// type is the one linked to the product's form — not whatever was saved
// before — so changing a product's form shows the new form's fields.
func GetProductDefaultSpecs(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) (*ProductDefaultSpecs, error) {
	var d ProductDefaultSpecs
	var formName *string
	err := db.QueryRow(ctx,
		`SELECT p.product_form_id, f.name, p.pms_type_id, p.pms_specifications
		 FROM products p LEFT JOIN product_forms f ON f.id = p.product_form_id
		 WHERE p.id = $1`, productID,
	).Scan(&d.ProductFormID, &formName, &d.SavedPMSTypeID, &d.Specifications)
	if err != nil {
		return nil, err
	}
	if formName != nil {
		d.ProductForm = *formName
	}
	if len(d.Specifications) == 0 {
		d.Specifications = json.RawMessage("{}")
	}

	types, err := ListPMSTypes(ctx, db)
	if err != nil {
		return nil, err
	}
	for i := range types {
		t := &types[i]
		if d.ProductFormID != nil && t.ProductFormID != nil && *t.ProductFormID == *d.ProductFormID {
			d.Type = t
		}
		if d.SavedPMSTypeID != nil && t.ID == *d.SavedPMSTypeID {
			d.SavedTypeName = t.Name
		}
	}
	return &d, nil
}

// SaveProductDefaultSpecs stores a product's default specification values
// against the type of the product's own form. Only keys that are fields of
// that type are kept, so stale or foreign keys never get saved.
func SaveProductDefaultSpecs(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, values map[string]any) error {
	d, err := GetProductDefaultSpecs(ctx, db, productID)
	if err != nil {
		return err
	}
	if d.Type == nil {
		return ErrNoSpecTypeForForm
	}
	if err := missingRequired(d.Type, values); err != nil {
		return err
	}
	shown := VisibleFields(d.Type, values)
	kept := map[string]any{}
	for _, f := range d.Type.Fields {
		if !shown[f.ID] {
			continue // hidden by its rule: cleared
		}
		key := strconv.Itoa(f.ID)
		v, ok := values[key]
		if !ok || v == nil {
			continue
		}
		if s, isStr := v.(string); isStr && strings.TrimSpace(s) == "" {
			continue
		}
		kept[key] = v
	}
	blob, err := json.Marshal(kept)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx,
		`UPDATE products SET pms_type_id = $1, pms_specifications = $2::jsonb WHERE id = $3`,
		d.Type.ID, string(blob), productID)
	return err
}
