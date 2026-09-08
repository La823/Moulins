# Product RAG — Planner

Tracks status and roadmap for the retrieval-augmented Q&A feature. Update this file as phases land instead of letting status live only in commit messages.

## Done

**Phase 1 — Foundation** (committed `9d02359`)
- Qdrant Cloud cluster (`products` collection, 1024-dim cosine, AWS `eu-central-1`)
- Voyage AI (`voyage-4-lite`) embedding call working
- Credentials in `backend/.env` (gitignored): `QDRANT_URL`, `QDRANT_API_KEY`, `VOYAGE_API_KEY`, `BEDROCK_API_KEY`, `BEDROCK_REGION`

**Phase 2 — Embed products, live sync, ask endpoint** (committed `9d02359`)
- `backend/internal/vectorsearch/`: `config.go`, `embed.go`, `qdrant.go`, `sync.go`, `ask.go`
- Live sync hooked into product create/update/delete (`routehandlers/products/products.go`) — fire-and-forget goroutines, never block or fail the actual CRUD response
- `POST /admin/vector-search/backfill` — re-embeds the full catalog, paced at 21s/product to respect Voyage's free-tier 3 RPM limit (`routehandlers/vectorsearch/vectorsearch.go`)
- `POST /admin/vector-search/ask` — retrieval (`searchPoints` top 5) + generation, currently via **AWS Bedrock (`google.gemma-4-e2b`)**, not Claude as the original plan assumed — swapped during implementation, works the same shape (system prompt grounded strictly in retrieved product context)
- Admin chat UI at `frontend/src/app/(admin)/panel/product-assistant/page.jsx` — simple message-list + input, calls the ask endpoint directly

**Scope as shipped**: products only, admin-only (gated by `middleware.AdminOnly`), no customer-facing surface yet.

**Phase 5 — Owner-scoped doctors + meetings RAG** (this session)
- `doctors` and `meetings` Qdrant collections (1024-dim cosine, same shape as `products`), each with a payload index on `owner_id` (required for Qdrant to filter on it — collection creation + indexing were one-time REST setup, not app code)
- `qdrant.go` generalized: `upsertPoint`/`deletePoint`/`searchPoints` now take a `collection` param, `searchPoints` also takes an optional `filter` — `nil` for products (unchanged behavior), a mandatory `{"must": [{"key": "owner_id", "match": {...}}]}` for doctors/meetings
- `sync_doctors.go` / `sync_meetings.go` — live sync hooked into doctor/meeting create/update/delete (doctors.go, meetings.go — meetings also re-syncs on MOM and status updates, not just the main edit route, since those change embeddable content too)
- Meeting payload's `owner_id` is resolved via `models.ResolveOwnerID` from the meeting's raw `UserID` — so a team_member's meeting is tagged with their *partner's* id, matching how doctors are already scoped, and both entities filter identically
- `ask_scoped.go`'s `AskScoped(ctx, db, ownerID, question)` — searches both collections filtered by the resolved owner, merges results, same Bedrock call shape as products (refactored the actual HTTP call into a shared `callBedrock` helper used by both)
- `POST /vector-search/ask` — authenticated (any partner/team_member), **not** admin-gated, since the security boundary is enforced at the retrieval query itself, not the route
- `POST /admin/vector-search/backfill-doctors` / `-meetings` — admin-only, same 21s-paced background loop as the product backfill
- **Verified directly against the DB** (bypassing HTTP/JWT, same approach used for the cart feature): synced a real doctor, asked Partner A about their own doctor → correct answer; asked Partner B (a different real partner) the identical question → "No matching doctors or meetings were found" — confirms the `owner_id` filter actually excludes cross-partner data, not just assumed. Team-member sharing confirmed by composition (`ResolveOwnerID(team_member)` correctly resolves to the partner id already proven to work).
- **Not done in this pass**: no frontend chat UI for doctors/meetings (verified backend-only, mirroring how products' `Ask` was originally verified before `/panel/product-assistant` existed) — that's a natural next step, not committed to yet.

## Not started

Ordered roughly by likely value — reprioritize as needed, this isn't a commitment, just a working list.

### Phase 3 — Harden what exists
- [ ] Swap `Ask`'s generation model from Gemma/Bedrock to Claude (`claude-opus-5` via Anthropic API), per the original plan — decide whether Gemma's cost/latency is actually good enough to keep, or whether this was just what was available at the time
- [ ] Backfill idempotency check: confirm re-running `/admin/vector-search/backfill` overwrites existing points rather than duplicating (upsert-by-UUID should already guarantee this — write a quick test to confirm rather than assuming)
- [ ] Rate-limit / auth on `/admin/vector-search/ask` beyond `AdminOnly` — it hits paid external APIs on every call, worth a per-user or global request cap before wider rollout
- [ ] Qdrant collection health check / alerting — nothing currently notices if `points_count` drifts from the live product count (e.g. a failed live-sync goroutine going unnoticed)

### Phase 4 — Customer-facing product chat
- [ ] Move (or add) a chat surface into the customer-facing app, not just `/panel/product-assistant` — likely the existing `/chat` route or a new one
- [ ] Decide what customers should see vs. staff — e.g. should MRP/stock/MOQ appear in answers to a customer the same way they do for admin?

### Phase 5 — Additional entities
Doctors and meetings are done (see Done section above). Ledger is still open — lower priority, more structured/tabular data (balances, transactions) that may not benefit as much from embedding vs. a normal filtered SQL query; revisit if there's an actual use case for it, not a default extension of the doctors/meetings pattern.
- [ ] A dedicated chat UI for doctors/meetings (mirroring `/panel/product-assistant`, but on the customer-facing side and scoped to the logged-in partner)
- [ ] Ledger — undesigned, may not need vector search at all

### Phase 6 — Order-creation agent (separate future phase, explicitly deferred in Phase 2 plan)
- [ ] Agentic flow where a staff member describes an order in natural language and the assistant drafts it — needs tool-use (not just retrieval), write access to the orders API, and a confirmation step before anything is actually created
- [ ] Not started, no design yet — revisit once Phase 4/5 are stable

## Open questions
- Is Gemma/Bedrock the long-term model choice, or a placeholder to swap for Claude? (Phase 3)
- Where does the customer-facing chat entry point live — existing `/chat` route or new? (Phase 4)
- What's the actual access-control model for partner-scoped data — payload filtering per query, or separate Qdrant collections per scope? (Phase 5)
