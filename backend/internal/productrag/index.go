package productrag

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

// SyncStats reports what one Sync changed.
type SyncStats struct {
	Products  int `json:"products"`  // public products looked at
	Embedded  int `json:"embedded"`  // chunks written (new or changed)
	Deleted   int `json:"deleted"`   // chunks removed
	Documents int `json:"documents"` // PDFs transcribed this run
}

type newChunk struct {
	productID, source, documentID string
	index                         int
	content                       string
}

// pointNamespace seeds chunk point ids. A chunk's id is derived from what
// it is — product, source, document, position — never random, so writing
// a changed chunk replaces the old one, and two servers syncing the same
// product at once (a local backend shares Qdrant with production) write
// the same point instead of two.
var pointNamespace = uuid.MustParse("5b0f4f61-2d55-4c1e-9a43-6f1f3c2a7e10")

func (c newChunk) pointID() string {
	return uuid.NewSHA1(pointNamespace, fmt.Appendf(nil, "%s|%s|%s|%d", c.productID, c.source, c.documentID, c.index)).String()
}

// syncMu keeps two syncs in this server from transcribing the same new PDF
// at once — a product saved twice in quick succession, or a save during a
// full re-index.
var syncMu sync.Mutex

// Sync brings the Qdrant collection in line with the catalogue for the
// given products, or for every product when ids is nil. It is cheap to
// repeat: profiles whose text has not changed are not embedded again, and a
// PDF is transcribed once, the first time it is seen. Products that are no
// longer public lose their chunks.
func Sync(ctx context.Context, db *pgxpool.Pool, ids []string) (SyncStats, error) {
	syncMu.Lock()
	defer syncMu.Unlock()

	var st SyncStats
	if err := ensureCollection(ctx); err != nil {
		return st, err
	}
	sources, err := loadSources(ctx, db, ids)
	if err != nil {
		return st, err
	}
	st.Products = len(sources)
	public := make(map[string]productSource, len(sources))
	for _, s := range sources {
		public[s.ID] = s
	}

	// what is indexed now
	existing, err := scrollPayloads(ctx, productFilter(ids), []string{"product_id", "source", "document_id", "content_hash"})
	if err != nil {
		return st, err
	}
	currentProfile := map[string]bool{} // products whose indexed profile is up to date
	indexedDocs := map[string]bool{}    // documents that already have chunks
	var deleteIDs []string
	for _, p := range existing {
		productID := payloadString(p.Payload, "product_id")
		src, ok := public[productID]
		switch {
		case !ok:
			deleteIDs = append(deleteIDs, p.ID) // no longer public
		case payloadString(p.Payload, "source") == "profile":
			currentProfile[productID] = payloadString(p.Payload, "content_hash") == hashOf(src.searchText())
		default:
			indexedDocs[payloadString(p.Payload, "document_id")] = true
		}
	}

	var add []newChunk
	for _, s := range sources {
		if !currentProfile[s.ID] {
			add = append(add, newChunk{productID: s.ID, source: "profile", content: s.searchText()})
		}
	}
	docChunks, transcribed, err := newDocumentChunks(ctx, db, public, ids, indexedDocs)
	if err != nil {
		return st, err
	}
	add = append(add, docChunks...)
	st.Documents = transcribed

	if len(add) > 0 {
		texts := make([]string, len(add))
		for i, c := range add {
			texts[i] = c.content
		}
		vecs, err := embed(ctx, texts, inputDocument)
		if err != nil {
			return st, err
		}
		pts := make([]point, len(add))
		for i, c := range add {
			payload := map[string]any{
				"product_id":   c.productID,
				"source":       c.source,
				"chunk_index":  c.index,
				"content":      c.content,
				"content_hash": hashOf(c.content),
			}
			if c.documentID != "" {
				payload["document_id"] = c.documentID
			}
			pts[i] = point{ID: c.pointID(), Vector: vecs[i], Payload: payload}
		}
		if err := upsertPoints(ctx, pts); err != nil {
			return st, err
		}
	}
	if err := deletePoints(ctx, deleteIDs); err != nil {
		return st, err
	}
	st.Embedded, st.Deleted = len(add), len(deleteIDs)
	return st, nil
}

// newDocumentChunks transcribes and chunks the PDFs of public products that
// have no chunks yet. Documents never change after upload — they are only
// added or deleted — so a document that has chunks is done. A PDF that
// fails is logged and skipped, and tried again on the next sync, rather
// than failing the whole run.
func newDocumentChunks(ctx context.Context, db *pgxpool.Pool, public map[string]productSource, ids []string, indexed map[string]bool) ([]newChunk, int, error) {
	var idArg any
	if ids != nil {
		idArg = ids
	}
	rows, err := db.Query(ctx, `
		SELECT d.id::text, d.product_id::text, d.name, d.file_key
		FROM product_documents d
		WHERE $1::text[] IS NULL OR d.product_id::text = ANY($1::text[])
		ORDER BY d.created_at`, idArg)
	if err != nil {
		return nil, 0, fmt.Errorf("productrag: load documents: %w", err)
	}
	type doc struct{ id, productID, name, key string }
	var todo []doc
	for rows.Next() {
		var d doc
		if err := rows.Scan(&d.id, &d.productID, &d.name, &d.key); err != nil {
			rows.Close()
			return nil, 0, err
		}
		if _, ok := public[d.productID]; ok && !indexed[d.id] {
			todo = append(todo, d)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var out []newChunk
	done := 0
	for _, d := range todo {
		pdf, err := utils.DownloadFromS3(ctx, d.key)
		if err != nil {
			log.Printf("productrag: download document %s (%s): %v", d.id, d.name, err)
			continue
		}
		text, err := transcribePDF(ctx, pdf)
		if err != nil {
			log.Printf("productrag: document %s (%s): %v", d.id, d.name, err)
			continue
		}
		// contextual chunking: every passage says which document and
		// product it comes from, so it is found — and understood — alone
		prefix := fmt.Sprintf("From the document %q for %s\n\n", d.name, public[d.productID].header())
		for i, c := range chunkText(text) {
			out = append(out, newChunk{productID: d.productID, source: "document", documentID: d.id,
				index: i, content: prefix + c})
		}
		done++
	}
	return out, done, nil
}

// DeleteDocument removes a deleted PDF's chunks. Qdrant has no foreign
// keys, so nothing else would.
func DeleteDocument(ctx context.Context, documentID uuid.UUID) error {
	pts, err := scrollPayloads(ctx, map[string]any{"must": []map[string]any{
		{"key": "document_id", "match": map[string]any{"value": documentID.String()}},
	}}, []string{})
	if err != nil {
		return err
	}
	ids := make([]string, len(pts))
	for i, p := range pts {
		ids[i] = p.ID
	}
	return deletePoints(ctx, ids)
}

func hashOf(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// SyncProductAsync re-indexes one product in the background after it is
// created, edited, deleted, has a PDF added or its visibility changed — a
// product that is gone or no longer public loses its chunks. It never
// blocks or fails the request that triggered it. The timeout allows for a
// new PDF to be transcribed.
func SyncProductAsync(db *pgxpool.Pool, id uuid.UUID) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if _, err := Sync(ctx, db, []string{id.String()}); err != nil {
			log.Printf("productrag: sync product %s: %v", id, err)
		}
	}()
}

// DeleteDocumentAsync is DeleteDocument in the background, for the
// document delete handler.
func DeleteDocumentAsync(id uuid.UUID) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		if err := DeleteDocument(ctx, id); err != nil {
			log.Printf("productrag: delete document %s: %v", id, err)
		}
	}()
}
