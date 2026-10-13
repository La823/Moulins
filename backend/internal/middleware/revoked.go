package middleware

import (
	"context"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// Accounts that were removed (users.deleted_at set). A login token lasts
// seven days and Auth never touches the database, so without this a removed
// team member would keep working until their token ran out. The set is held
// in memory — loaded once at startup, added to the moment someone is removed
// — so checking it costs nothing per request. One backend instance serves
// the API, so there is nothing to keep in step across servers.
var revoked sync.Map // uuid.UUID -> struct{}

// LoadRevokedUsers fills the set from the database. Called at startup.
func LoadRevokedUsers(ctx context.Context, db *pgxpool.Pool) {
	ids, err := models.ListRemovedUserIDs(ctx, db)
	if err != nil {
		log.Printf("could not load removed accounts: %v", err)
		return
	}
	for _, id := range ids {
		revoked.Store(id, struct{}{})
	}
}

// RevokeUser stops id's existing and future logins.
func RevokeUser(id uuid.UUID) {
	revoked.Store(id, struct{}{})
}

// IsRevoked reports whether id belongs to a removed account.
func IsRevoked(id uuid.UUID) bool {
	_, ok := revoked.Load(id)
	return ok
}
