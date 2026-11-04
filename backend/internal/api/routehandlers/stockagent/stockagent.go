package stockagent

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	agent "github.com/lavanyaarora/server/internal/stockagent"
)

const maxQuestionLen = 500

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func userID(r *http.Request) *uuid.UUID {
	s, _ := r.Context().Value("user_id").(string)
	id, err := uuid.Parse(s)
	if err != nil {
		return nil
	}
	return &id
}

// POST /admin/stock-agent/ask — the stock agent: a question about stock,
// shortages or expiry, answered from live Marg data. Every question is
// saved with its tokens; once the day's tokens reach the daily limit the
// agent stops taking questions until midnight (India time).
func AskHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		var req struct {
			Question string `json:"question"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		question := strings.Join(strings.Fields(req.Question), " ")
		if question == "" {
			http.Error(w, "question is required", http.StatusBadRequest)
			return
		}
		if utf8.RuneCountInString(question) > maxQuestionLen {
			http.Error(w, "question is too long", http.StatusBadRequest)
			return
		}

		usage, err := agent.GetUsage(r.Context(), db)
		if err != nil {
			log.Printf("stock agent usage: %v", err)
			http.Error(w, "could not answer right now", http.StatusInternalServerError)
			return
		}
		if usage.LeftToday <= 0 {
			http.Error(w, "Today's token limit (1M tokens) is used up — the agent is back at midnight.", http.StatusTooManyRequests)
			return
		}

		start := time.Now()
		answer, err := agent.Ask(r.Context(), db, question, usage.LeftToday)
		ms := time.Since(start).Milliseconds()
		if !errors.Is(err, agent.ErrNoKey) {
			// saved even when it failed: the tokens were still spent
			if serr := agent.Save(r.Context(), db, userID(r), question, answer, ms, err); serr != nil {
				log.Printf("stock agent save: %v", serr)
			}
		}
		if errors.Is(err, agent.ErrNoKey) {
			http.Error(w, "the stock agent is not set up on this server", http.StatusServiceUnavailable)
			return
		}
		if err != nil {
			log.Printf("stock agent ask error: %v", err)
			http.Error(w, "could not answer right now", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{
			"answer": answer.Answer, "steps": answer.Steps, "ms": ms,
			"input_tokens": answer.InputTokens, "output_tokens": answer.OutputTokens,
			"cost_usd": agent.Cost(answer.InputTokens, answer.OutputTokens),
		})
	}
}

// GET /admin/stock-agent/history?all=1&limit=50 — past questions, newest
// first: your own, or everyone's with all=1.
func HistoryHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 200 {
			limit = 50
		}
		var user *uuid.UUID
		if r.URL.Query().Get("all") != "1" {
			if user = userID(r); user == nil {
				writeJSON(w, map[string]any{"entries": []agent.LogEntry{}})
				return
			}
		}
		entries, err := agent.History(r.Context(), db, user, limit)
		if err != nil {
			log.Printf("stock agent history: %v", err)
			http.Error(w, "could not load history", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"entries": entries})
	}
}

// GET /admin/stock-agent/usage — tokens and cost today and this month,
// against the daily limit.
func UsageHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, err := agent.GetUsage(r.Context(), db)
		if err != nil {
			log.Printf("stock agent usage: %v", err)
			http.Error(w, "could not load usage", http.StatusInternalServerError)
			return
		}
		writeJSON(w, u)
	}
}
