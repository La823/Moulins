// Package dispatch is the dispatch team's tools beyond packing itself:
// the rotating assignment of orders sent to packing, and freight bills
// (migration 190).
package dispatch

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Packer is one dispatch member as the rotation sees them today.
type Packer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone,omitempty"`
	Skip    bool   `json:"skip"`    // taken out of the rotation by an admin
	Linked  bool   `json:"linked"`  // login linked to a fingerprint-scanner employee
	Present bool   `json:"present"` // punched in today (always true when not linked)
	OnLeave bool   `json:"on_leave"`
	InTurn  bool   `json:"in_turn"` // gets orders today: not skipped, present, not on leave
	Open    int    `json:"open"`    // orders sent to packing and assigned to them
	// today's attendance in detail, for choosing who packs: first punch
	// (HH:MM, nil when not punched in yet) and a half day of approved leave
	FirstIn      *string `json:"first_in"`
	HalfDayLeave bool    `json:"half_day_leave"`
}

// packersSQL lists everyone who packs (employees with packing_edit) with
// today's attendance. "Today" is the IST date; scanner punch times are IST
// wall-clock times stored without a zone (migration 157). A full day of
// approved leave takes a member out for the day; a half day doesn't.
const packersSQL = `
	WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d)
	SELECT u.id::text, COALESCE(NULLIF(u.username, ''), u.phone_number, ''), COALESCE(u.phone_number, ''),
	       u.packing_rotation_skip, e.emp_code IS NOT NULL,
	       e.emp_code IS NULL OR EXISTS (
	           SELECT 1 FROM etime_punches t, today
	           WHERE t.emp_code = e.emp_code AND t.punch_time >= today.d AND t.punch_time < today.d + 1),
	       e.emp_code IS NOT NULL AND EXISTS (
	           SELECT 1 FROM etime_leave_requests l, today
	           WHERE l.emp_code = e.emp_code AND l.status = 'approved' AND NOT l.half_day
	             AND today.d BETWEEN l.from_date AND l.to_date),
	       (SELECT COUNT(*) FROM orders o WHERE o.packing_assigned_to = u.id AND o.status = 'packing')::int,
	       (SELECT to_char(MIN(t.punch_time), 'HH24:MI') FROM etime_punches t, today
	        WHERE t.emp_code = e.emp_code AND t.punch_time >= today.d AND t.punch_time < today.d + 1),
	       e.emp_code IS NOT NULL AND EXISTS (
	           SELECT 1 FROM etime_leave_requests l, today
	           WHERE l.emp_code = e.emp_code AND l.status = 'approved' AND l.half_day
	             AND today.d BETWEEN l.from_date AND l.to_date)
	FROM users u
	LEFT JOIN etime_employees e ON e.user_id = u.id
	WHERE u.role = 'employee'
	  AND EXISTS (SELECT 1 FROM employee_permissions p WHERE p.user_id = u.id AND p.permission = 'packing_edit')
	ORDER BY u.id`

func scanPackers(rows pgx.Rows) ([]Packer, error) {
	defer rows.Close()
	out := []Packer{}
	for rows.Next() {
		var p Packer
		if err := rows.Scan(&p.ID, &p.Name, &p.Phone, &p.Skip, &p.Linked, &p.Present, &p.OnLeave, &p.Open, &p.FirstIn, &p.HalfDayLeave); err != nil {
			return nil, err
		}
		p.InTurn = !p.Skip && p.Present && !p.OnLeave
		out = append(out, p)
	}
	return out, rows.Err()
}

// Packers lists the dispatch members with today's attendance and open
// orders, in rotation order.
func Packers(ctx context.Context, db *pgxpool.Pool) ([]Packer, error) {
	rows, err := db.Query(ctx, packersSQL)
	if err != nil {
		return nil, err
	}
	return scanPackers(rows)
}

// ErrNotPacker: the user picked for an order doesn't pack orders.
var ErrNotPacker = errors.New("dispatch: that login does not pack orders")

// SetSkip takes a member out of (or back into) the rotation.
func SetSkip(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, skip bool) error {
	tag, err := db.Exec(ctx, `
		UPDATE users SET packing_rotation_skip = $2
		WHERE id = $1 AND role = 'employee'
		  AND EXISTS (SELECT 1 FROM employee_permissions p WHERE p.user_id = users.id AND p.permission = 'packing_edit')`,
		userID, skip)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotPacker
	}
	return nil
}

// AssignNext gives an order sent to packing to the next member in turn —
// the one after whoever was assigned an order most recently, among those
// in turn today (by id, wrapping round). An order that already has someone
// keeps them. Returns who has it, or uuid.Nil when nobody is in turn (the
// whole team then sees it as unassigned).
//
// One transaction with an advisory lock, so two orders sent at the same
// moment don't both go to the same person.
func AssignNext(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) (uuid.UUID, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('packing_rotation'))`); err != nil {
		return uuid.Nil, err
	}

	var current *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT packing_assigned_to FROM orders WHERE id = $1`, orderID).Scan(&current); err != nil {
		return uuid.Nil, err
	}
	if current != nil {
		return *current, tx.Commit(ctx)
	}

	rows, err := tx.Query(ctx, packersSQL)
	if err != nil {
		return uuid.Nil, err
	}
	all, err := scanPackers(rows)
	if err != nil {
		return uuid.Nil, err
	}
	var inTurn []Packer
	for _, p := range all {
		if p.InTurn {
			inTurn = append(inTurn, p)
		}
	}
	if len(inTurn) == 0 {
		return uuid.Nil, tx.Commit(ctx)
	}

	var last *string
	err = tx.QueryRow(ctx, `
		SELECT packing_assigned_to::text FROM orders
		WHERE packing_assigned_at IS NOT NULL AND packing_assigned_to IS NOT NULL
		ORDER BY packing_assigned_at DESC LIMIT 1`).Scan(&last)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	next := nextInTurn(inTurn, last)

	id := uuid.MustParse(next.ID)
	if _, err := tx.Exec(ctx, `UPDATE orders SET packing_assigned_to = $2, packing_assigned_at = now() WHERE id = $1`, orderID, id); err != nil {
		return uuid.Nil, err
	}
	return id, tx.Commit(ctx)
}

// nextInTurn picks who follows last in the rotation: the first member (in
// id order) after last, wrapping round; the first member when last is
// unknown or gone. inTurn must not be empty and is in id order.
func nextInTurn(inTurn []Packer, last *string) Packer {
	if last != nil {
		for _, p := range inTurn {
			if p.ID > *last {
				return p
			}
		}
	}
	return inTurn[0]
}

// Assign sets (or, with uuid.Nil, clears) an order's packer by hand.
func Assign(ctx context.Context, db *pgxpool.Pool, orderID, userID uuid.UUID) error {
	if userID != uuid.Nil {
		var ok bool
		if err := db.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = $1 AND u.role = 'employee'
			  AND EXISTS (SELECT 1 FROM employee_permissions p WHERE p.user_id = u.id AND p.permission = 'packing_edit'))`,
			userID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return ErrNotPacker
		}
		// keeps the rotation's own time, so a hand-over isn't taken as the
		// rotation's latest turn
		_, err := db.Exec(ctx, `UPDATE orders SET packing_assigned_to = $2, packing_assigned_at = COALESCE(packing_assigned_at, now()) WHERE id = $1`, orderID, userID)
		return err
	}
	_, err := db.Exec(ctx, `UPDATE orders SET packing_assigned_to = NULL WHERE id = $1`, orderID)
	return err
}
