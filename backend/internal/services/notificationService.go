// Package services holds orchestration logic that spans multiple models and
// external providers, and doesn't belong in a model (pure DB access) or a
// handler (pure HTTP). Notification sending is the first user of this: it
// resolves an audience, fans out per-user inbox rows, and pushes via FCM.
package services

import (
	"context"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// DispatchBroadcast resolves the eligible audience (all customers minus
// excludedUserIDs), creates their in-app inbox rows, and pushes via FCM to
// their registered device tokens. It always leaves the in-app inbox
// populated, even if Firebase isn't configured or a push send partially
// fails — push is a best-effort addition, not a precondition for the
// broadcast to be considered sent.
//
// This is the single funnel later individual/group send paths should reuse:
// they just need to supply a different eligible-user-ID list.
func DispatchBroadcast(ctx context.Context, db *pgxpool.Pool, notification *models.Notification, excludedUserIDs []uuid.UUID) error {
	eligibleUserIDs, err := models.GetEligibleUserIDs(ctx, db, excludedUserIDs)
	if err != nil {
		return err
	}

	if err := models.CreateRecipientsBatch(ctx, db, notification.ID, eligibleUserIDs); err != nil {
		return err
	}

	tokens, err := models.GetDeviceTokensForUsers(ctx, db, eligibleUserIDs)
	if err != nil {
		log.Printf("notification %s: failed to fetch device tokens: %v", notification.ID, err)
		tokens = nil
	}

	imageURL := ""
	if notification.ImageKey != nil && *notification.ImageKey != "" {
		imageURL = utils.GetPublicURL(*notification.ImageKey)
	}

	data := map[string]string{"notification_id": notification.ID.String()}
	if notification.DeepLink != nil {
		data["deep_link"] = *notification.DeepLink
	}

	successCount, failureCount, invalidTokens, sendErr := utils.SendMulticast(ctx, tokens, notification.Title, notification.Body, imageURL, data)
	if sendErr != nil {
		log.Printf("notification %s: push send error: %v", notification.ID, sendErr)
	}

	if len(invalidTokens) > 0 {
		if err := models.DeactivateDeviceTokens(ctx, db, invalidTokens); err != nil {
			log.Printf("notification %s: failed to deactivate invalid tokens: %v", notification.ID, err)
		}
	}

	status := "sent"
	if sendErr != nil && successCount == 0 && len(tokens) > 0 {
		status = "failed"
	}

	return models.UpdateNotificationStatus(ctx, db, notification.ID, status, len(eligibleUserIDs), successCount, failureCount)
}
