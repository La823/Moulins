// Package warehouse serves the ported warehouse-layout-editor's persistence
// API — a thin CRUD layer over whole layouts stored as JSONB, mirroring the
// standalone editor's server/persistence.py one-for-one (see
// backend/internal/models/warehouseLayoutModel.go). The editor's own
// client-side validateLayout() is trusted on write, same as other endpoints.
package warehouse

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image/color"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	go_qr "github.com/piglig/go-qr"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/assets"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// Moulins brand teal (#00A6A4), used across the customer/admin frontends —
// decoded once and reused for every QR code rather than re-decoding the
// embedded logo PNG on each request.
var qrDark = color.RGBA{R: 0x00, G: 0xa6, B: 0xa4, A: 0xff}

// embedCenteredLogo injects the Moulins mark into the center of an
// already-rendered QR SVG. Parses the real emitted viewBox rather than
// recomputing it, so this stays correct even if go_qr's own canvas-sizing
// formula changes — see the long comment where this is called for why we
// don't use go_qr's built-in WithLogo for SVG output.
func embedCenteredLogo(svg []byte) ([]byte, error) {
	m := viewBoxRe.FindSubmatch(svg)
	if m == nil {
		return nil, fmt.Errorf("could not find viewBox in generated SVG")
	}
	n, err := strconv.Atoi(string(m[1]))
	if err != nil {
		return nil, fmt.Errorf("invalid viewBox width: %w", err)
	}

	// ~22% of the QR's total side, matching the visual size used before —
	// a round pixel box centered on the real canvas, no module-grid
	// alignment needed since this is purely a decorative overlay.
	box := int(float64(n) * 0.22)
	inset := box / 10 // thin white margin between logo and QR modules
	x := (n - box) / 2
	logoX := x + inset
	logoSide := box - 2*inset

	encoded := base64.StdEncoding.EncodeToString(assets.MoulinsLogoPNGBytes())
	fragment := fmt.Sprintf(
		"\t<rect x=\"%d\" y=\"%d\" width=\"%d\" height=\"%d\" fill=\"#FFFFFF\"/>\n"+
			"\t<image x=\"%d\" y=\"%d\" width=\"%d\" height=\"%d\" href=\"data:image/png;base64,%s\"/>\n",
		x, x, box, box,
		logoX, logoX, logoSide, logoSide, encoded,
	)

	const closing = "</svg>"
	idx := bytes.LastIndex(svg, []byte(closing))
	if idx < 0 {
		return append(svg, []byte(fragment)...), nil
	}
	out := make([]byte, 0, len(svg)+len(fragment))
	out = append(out, svg[:idx]...)
	out = append(out, fragment...)
	out = append(out, svg[idx:]...)
	return out, nil
}

var viewBoxRe = regexp.MustCompile(`viewBox="0 0 (\d+) \d+"`)

// GET /admin/warehouse/layouts
func ListLayoutsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		layouts, err := models.ListWarehouseLayouts(r.Context(), db)
		if err != nil {
			log.Printf("list warehouse layouts error: %v", err)
			http.Error(w, "could not fetch layouts", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(layouts)
	}
}

// GET /admin/warehouse/layouts/{name}
func GetLayoutHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		data, err := models.GetWarehouseLayout(r.Context(), db, name)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "layout not found", http.StatusNotFound)
				return
			}
			log.Printf("get warehouse layout error: %v", err)
			http.Error(w, "could not fetch layout", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
	}
}

// PUT /admin/warehouse/layouts/{name} — body is the raw db_connect JSON the
// editor already exports; schema_version comes from body.editor.schemaVersion,
// same field persistence.py's save() reads it from.
func SaveLayoutHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "could not read request body", http.StatusBadRequest)
			return
		}

		var meta struct {
			Editor struct {
				SchemaVersion int `json:"schemaVersion"`
			} `json:"editor"`
			Bins []struct {
				WhseLocation string `json:"whse_location"`
			} `json:"bins"`
			Pallets []struct {
				ID string `json:"id"`
			} `json:"pallets"`
		}
		if err := json.Unmarshal(body, &meta); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.SaveWarehouseLayout(r.Context(), db, name, meta.Editor.SchemaVersion, body); err != nil {
			log.Printf("save warehouse layout error: %v", err)
			http.Error(w, "could not save layout", http.StatusInternalServerError)
			return
		}

		validBinKeys := make([]string, 0, len(meta.Bins))
		for _, b := range meta.Bins {
			validBinKeys = append(validBinKeys, b.WhseLocation)
		}
		validPalletKeys := make([]string, 0, len(meta.Pallets))
		for _, p := range meta.Pallets {
			validPalletKeys = append(validPalletKeys, p.ID)
		}
		cleanupOrphanedWarehouseData(r.Context(), db, name, validBinKeys, validPalletKeys)

		w.WriteHeader(http.StatusNoContent)
	}
}

// cleanupOrphanedWarehouseData removes product assignments and cached QR
// codes left over from a rack or pallet that's no longer in the layout
// (deleted in the editor, then saved) — both keyed by location, both with no
// other way to notice their location disappeared. Errors are logged, not
// returned: a cleanup hiccup shouldn't fail the save the user is waiting on.
func cleanupOrphanedWarehouseData(ctx context.Context, db *pgxpool.Pool, layoutName string, validBinKeys, validPalletKeys []string) {
	// pgx encodes a nil slice as SQL NULL, and `x = ANY(NULL)` is NULL (not
	// false) — which would make the NOT(...) clause below NULL too and match
	// nothing, silently skipping cleanup entirely. Force a real empty array.
	if validBinKeys == nil {
		validBinKeys = []string{}
	}
	if validPalletKeys == nil {
		validPalletKeys = []string{}
	}
	removedBins, removedPallets, err := models.DeleteOrphanedWarehouseBinAssignments(ctx, db, layoutName, validBinKeys, validPalletKeys)
	if err != nil {
		log.Printf("cleanup: delete orphaned assignments for %q: %v", layoutName, err)
	} else if len(removedBins) > 0 || len(removedPallets) > 0 {
		log.Printf("cleanup: removed %d orphaned bin + %d orphaned pallet assignment(s) for %q", len(removedBins), len(removedPallets), layoutName)
	}

	validBinSet := make(map[string]bool, len(validBinKeys))
	for _, k := range validBinKeys {
		validBinSet[k] = true
	}
	validPalletSet := make(map[string]bool, len(validPalletKeys))
	for _, k := range validPalletKeys {
		validPalletSet[k] = true
	}

	seg := s3KeySegment(layoutName)
	sweepQRPrefix(fmt.Sprintf("warehouse-qrcodes/%s/bin/", seg), validBinSet)
	sweepQRPrefix(fmt.Sprintf("warehouse-qrcodes/%s/pallet/", seg), validPalletSet)
}

// sweepQRPrefix deletes any cached QR .svg under prefix whose location key
// (its filename minus the extension) isn't in valid — catches a QR that was
// generated for a bin/pallet that got deleted before ever having a product
// assigned to it, which the assignments-table cleanup above wouldn't see.
func sweepQRPrefix(prefix string, valid map[string]bool) {
	keys, err := utils.ListObjectKeys(prefix)
	if err != nil {
		log.Printf("cleanup: list %s: %v", prefix, err)
		return
	}
	for _, key := range keys {
		base := strings.TrimSuffix(strings.TrimPrefix(key, prefix), ".svg")
		if valid[base] {
			continue
		}
		if err := utils.DeleteObject(key); err != nil {
			log.Printf("cleanup: delete orphaned QR %s: %v", key, err)
		} else {
			log.Printf("cleanup: deleted orphaned QR %s", key)
		}
	}
}

// DELETE /admin/warehouse/layouts/{name}
func DeleteLayoutHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		if err := models.DeleteWarehouseLayout(r.Context(), db, name); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "layout not found", http.StatusNotFound)
				return
			}
			log.Printf("delete warehouse layout error: %v", err)
			http.Error(w, "could not delete layout", http.StatusInternalServerError)
			return
		}
		// The whole layout is gone, so every assignment and cached QR under
		// it is now orphaned too — same cleanup as a partial save, just with
		// nothing left counting as "valid".
		cleanupOrphanedWarehouseData(r.Context(), db, name, nil, nil)
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/warehouse/bin-types — the persistent bin-type library, shared
// across every layout (unlike a layout's own binTypes, which only apply to
// that one layout).
func ListBinTypesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		types, err := models.ListWarehouseBinTypes(r.Context(), db)
		if err != nil {
			log.Printf("list warehouse bin types error: %v", err)
			http.Error(w, "could not fetch bin types", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(types)
	}
}

// PUT /admin/warehouse/bin-types/{name} — body is {w, d, h, color}.
func SaveBinTypeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]

		var body struct {
			Width  float64 `json:"w"`
			Depth  float64 `json:"d"`
			Height float64 `json:"h"`
			Color  string  `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		t := models.WarehouseBinType{Name: name, Width: body.Width, Depth: body.Depth, Height: body.Height, Color: body.Color}
		if err := models.SaveWarehouseBinType(r.Context(), db, t); err != nil {
			log.Printf("save warehouse bin type error: %v", err)
			http.Error(w, "could not save bin type", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/warehouse/bin-types/{name}
func DeleteBinTypeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		if err := models.DeleteWarehouseBinType(r.Context(), db, name); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "bin type not found", http.StatusNotFound)
				return
			}
			log.Printf("delete warehouse bin type error: %v", err)
			http.Error(w, "could not delete bin type", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/warehouse/layouts/{name}/assignments — every product assigned
// to a bin or pallet within this one layout.
func ListAssignmentsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		layoutName := mux.Vars(r)["name"]
		assignments, err := models.ListWarehouseBinAssignments(r.Context(), db, layoutName)
		if err != nil {
			log.Printf("list warehouse bin assignments error: %v", err)
			http.Error(w, "could not fetch assignments", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(assignments)
	}
}

// PUT /admin/warehouse/layouts/{name}/assignments/{locationType}/{locationKey}/{slot}
// — body is {product_id}. locationType is "bin" or "pallet"; slot is "L",
// "R", or "A" (pallets always use "A").
func SaveAssignmentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		layoutName := vars["name"]
		locationType := vars["locationType"]
		locationKey := vars["locationKey"]
		slot := vars["slot"]

		if locationType != "bin" && locationType != "pallet" {
			http.Error(w, `location type must be "bin" or "pallet"`, http.StatusBadRequest)
			return
		}
		if slot != "L" && slot != "R" && slot != "A" {
			http.Error(w, `slot must be "L", "R", or "A"`, http.StatusBadRequest)
			return
		}

		var body struct {
			ProductID string `json:"product_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		productID, err := uuid.Parse(body.ProductID)
		if err != nil {
			http.Error(w, "product_id must be a valid UUID", http.StatusBadRequest)
			return
		}

		if err := models.SaveWarehouseBinAssignment(r.Context(), db, layoutName, locationType, locationKey, slot, productID); err != nil {
			log.Printf("save warehouse bin assignment error: %v", err)
			http.Error(w, "could not save assignment", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func frontendBaseURL() string {
	if u := os.Getenv("FRONTEND_URL"); u != "" {
		return u
	}
	return "https://moulinspharma.com"
}

// s3KeySegment makes a string safe to use as one path segment of an S3 key —
// layout names and bin labels can contain spaces ("OUTLET WAREHOUSE") which
// would otherwise need percent-encoding everywhere the resulting URL is used.
func s3KeySegment(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	return b.String()
}

// GET /admin/warehouse/layouts/{name}/qrcode/{locationType}/{locationKey}
// — a printable label for one physical bin or pallet: an SVG QR code
// encoding a deep link into the read-only viewer (/warehouse/view) that
// opens straight to that layout with the bin/pallet highlighted. One QR per
// bin (not per L/R slot) since that's what's physically stuck on the shelf.
//
// Generated once and cached in S3 (same public bucket product images etc.
// already live in) — repeat requests for the same bin/pallet just return the
// existing object's URL instead of re-rendering. Response is JSON ({url}),
// not the image itself, since the actual <img> tag then loads directly from
// S3 without needing an Authorization header.
func QRCodeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		layoutName := vars["name"]
		locationType := vars["locationType"]
		locationKey := vars["locationKey"]

		if locationType != "bin" && locationType != "pallet" {
			http.Error(w, `location type must be "bin" or "pallet"`, http.StatusBadRequest)
			return
		}

		key := fmt.Sprintf("warehouse-qrcodes/%s/%s/%s.svg",
			s3KeySegment(layoutName), locationType, s3KeySegment(locationKey))

		if exists, lastModified, err := utils.ObjectLastModified(key); err != nil {
			log.Printf("qrcode: S3 head error: %v", err)
			http.Error(w, "could not check for existing QR code", http.StatusInternalServerError)
			return
		} else if exists {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"url": qrURLWithCacheBust(key, lastModified)})
			return
		}

		// Confirm the layout actually exists before minting a link to it —
		// a QR code for a typo'd/deleted layout would otherwise print fine
		// and only fail when someone scans it on the floor.
		if _, err := models.GetWarehouseLayout(r.Context(), db, layoutName); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "layout not found", http.StatusNotFound)
				return
			}
			log.Printf("qrcode: get warehouse layout error: %v", err)
			http.Error(w, "could not fetch layout", http.StatusInternalServerError)
			return
		}

		link := fmt.Sprintf("%s/warehouse/view?layout=%s&locate=%s:%s",
			frontendBaseURL(),
			url.QueryEscape(layoutName),
			locationType,
			url.QueryEscape(locationKey),
		)

		// High ECC leaves enough recovery budget for the centered logo
		// (piglig/go-qr rejects a logo ratio this large under Medium).
		qr, err := go_qr.EncodeText(link, go_qr.High)
		if err != nil {
			log.Printf("qrcode: encode error: %v", err)
			http.Error(w, "could not generate QR code", http.StatusInternalServerError)
			return
		}
		// Deliberately NOT using go_qr's own WithLogo here: its logo-centering
		// math (border*scale + qrSize*scale/2) disagrees with the SVG
		// renderer's own canvas size (qrSize*scale + border*2 — border used
		// as raw pixels, not scaled) whenever border > 0, so the logo lands
		// off-center in the actual SVG (confirmed against a real generated
		// file: image center 285 vs true viewBox center 249, a 36px miss).
		// The logo renders fine in PNG output, where the two are consistent
		// — it's specifically an SVG-vs-logo-placement mismatch in the
		// library. Centering it ourselves from the real emitted viewBox
		// sidesteps the bug regardless of which internal formula changes.
		cfg := go_qr.NewQrCodeImgConfig(10, 4, go_qr.WithOptimalSVG(), go_qr.WithDark(qrDark), go_qr.WithLight(color.White))
		svg, err := qr.ToSVGBytes(cfg)
		if err != nil {
			log.Printf("qrcode: render error: %v", err)
			http.Error(w, "could not render QR code", http.StatusInternalServerError)
			return
		}
		if withLogo, err := embedCenteredLogo(svg); err != nil {
			log.Printf("qrcode: logo embed skipped: %v", err)
		} else {
			svg = withLogo
		}

		if err := utils.UploadToS3(key, svg, "image/svg+xml"); err != nil {
			log.Printf("qrcode: S3 upload error: %v", err)
			http.Error(w, "could not store QR code", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": qrURLWithCacheBust(key, time.Now())})
	}
}

// qrURLWithCacheBust appends ?v=<unix-ts> to the QR's public S3 URL. The
// object's S3 key never changes when it's regenerated (same bin, same
// layout), so without this a browser that already loaded the old styling
// for that URL keeps showing it from its image cache indefinitely.
func qrURLWithCacheBust(key string, t time.Time) string {
	return fmt.Sprintf("%s?v=%d", utils.GetPublicURL(key), t.Unix())
}

// DELETE /admin/warehouse/layouts/{name}/assignments/{locationType}/{locationKey}/{slot}
func DeleteAssignmentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		layoutName := vars["name"]
		locationType := vars["locationType"]
		locationKey := vars["locationKey"]
		slot := vars["slot"]

		if err := models.DeleteWarehouseBinAssignment(r.Context(), db, layoutName, locationType, locationKey, slot); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "no assignment at that location", http.StatusNotFound)
				return
			}
			log.Printf("delete warehouse bin assignment error: %v", err)
			http.Error(w, "could not delete assignment", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
