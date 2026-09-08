package vectorsearch

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	vs "github.com/lavanyaarora/server/internal/vectorsearch"
)

// backfillInterval paces requests under Voyage's free-tier 3 RPM limit.
const backfillInterval = 21 * time.Second

// POST /admin/vector-search/backfill — kicks off a background embed of
// every product into Qdrant, paced to stay under Voyage's rate limit.
// Runs detached from the request (context.Background(), not r.Context())
// since it can take many minutes for the full catalog — the response
// returns immediately with the product count, progress is in the logs.
func BackfillHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		products, _, err := models.GetAllProducts(r.Context(), db, false, "", "", "", "", 0, 0, false)
		if err != nil {
			log.Printf("vector search backfill: list products error: %v", err)
			http.Error(w, "could not list products", http.StatusInternalServerError)
			return
		}

		go func() {
			ctx := context.Background()
			synced, failed := 0, 0
			for i, p := range products {
				if i > 0 {
					time.Sleep(backfillInterval)
				}
				if err := vs.SyncProductByID(ctx, db, p.ID); err != nil {
					log.Printf("vector search backfill: sync %s failed: %v", p.ID, err)
					failed++
					continue
				}
				synced++
			}
			log.Printf("vector search backfill: done — synced %d, failed %d", synced, failed)
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"total":   len(products),
			"message": "backfill started in background, paced to respect rate limits — check server logs for progress",
		})
	}
}

// POST /admin/vector-search/ask — retrieval-augmented Q&A over the
// product catalog.
func AskHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Question string `json:"question"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Question == "" {
			http.Error(w, "question is required", http.StatusBadRequest)
			return
		}

		answer, err := vs.Ask(r.Context(), db, req.Question)
		if err != nil {
			log.Printf("vector search ask error: %v", err)
			http.Error(w, "could not answer question", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"answer": answer})
	}
}

// POST /vector-search/ask — retrieval-augmented Q&A over the requesting
// user's OWN doctors and meetings. Authenticated (any partner/team
// member), not admin-only — deliberately a separate endpoint from the
// product Ask above rather than merged, to keep the access boundary
// simple and auditable.
func AskScopedHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Question string `json:"question"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Question == "" {
			http.Error(w, "question is required", http.StatusBadRequest)
			return
		}

		rawID, err := uuid.Parse(r.Context().Value("user_id").(string))
		if err != nil {
			http.Error(w, "invalid user", http.StatusUnauthorized)
			return
		}
		ownerID, err := models.ResolveOwnerID(r.Context(), db, rawID)
		if err != nil {
			log.Printf("vector search ask (scoped): resolve owner error: %v", err)
			http.Error(w, "could not resolve account", http.StatusInternalServerError)
			return
		}

		answer, err := vs.AskScoped(r.Context(), db, ownerID, req.Question)
		if err != nil {
			log.Printf("vector search ask (scoped) error: %v", err)
			http.Error(w, "could not answer question", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"answer": answer})
	}
}

// POST /admin/vector-search/backfill-doctors — same shape as the product
// backfill: embeds every doctor into Qdrant, paced under Voyage's rate
// limit, detached from the request so it can run for minutes.
func BackfillDoctorsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctors, err := models.GetAllDoctorsWithLocation(r.Context(), db)
		if err != nil {
			log.Printf("vector search backfill (doctors): list error: %v", err)
			http.Error(w, "could not list doctors", http.StatusInternalServerError)
			return
		}

		go func() {
			ctx := context.Background()
			synced, failed := 0, 0
			for i, d := range doctors {
				if i > 0 {
					time.Sleep(backfillInterval)
				}
				if err := vs.SyncDoctorByID(ctx, db, d.ID); err != nil {
					log.Printf("vector search backfill (doctors): sync %s failed: %v", d.ID, err)
					failed++
					continue
				}
				synced++
			}
			log.Printf("vector search backfill (doctors): done — synced %d, failed %d", synced, failed)
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"total":   len(doctors),
			"message": "backfill started in background, paced to respect rate limits — check server logs for progress",
		})
	}
}

// POST /admin/vector-search/backfill-meetings — same shape as the product
// backfill: embeds every meeting into Qdrant, paced under Voyage's rate
// limit, detached from the request so it can run for minutes.
func BackfillMeetingsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// No filters, no real pagination — GetAllMeetings always applies
		// LIMIT/OFFSET, so pull the true total first, then fetch that many
		// in one shot for a full enumeration.
		_, total, err := models.GetAllMeetings(r.Context(), db, models.AdminMeetingFilters{}, 0, 0)
		if err != nil {
			log.Printf("vector search backfill (meetings): count error: %v", err)
			http.Error(w, "could not list meetings", http.StatusInternalServerError)
			return
		}
		meetings, _, err := models.GetAllMeetings(r.Context(), db, models.AdminMeetingFilters{}, total, 0)
		if err != nil {
			log.Printf("vector search backfill (meetings): list error: %v", err)
			http.Error(w, "could not list meetings", http.StatusInternalServerError)
			return
		}

		go func() {
			ctx := context.Background()
			synced, failed := 0, 0
			for i, m := range meetings {
				if i > 0 {
					time.Sleep(backfillInterval)
				}
				if err := vs.SyncMeetingByID(ctx, db, m.ID); err != nil {
					log.Printf("vector search backfill (meetings): sync %s failed: %v", m.ID, err)
					failed++
					continue
				}
				synced++
			}
			log.Printf("vector search backfill (meetings): done — synced %d, failed %d", synced, failed)
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"total":   len(meetings),
			"message": "backfill started in background, paced to respect rate limits — check server logs for progress",
		})
	}
}
