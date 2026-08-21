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

// DispatchBroadcast resolves the eligible audience — either all partners or,
// when listID is set, just that broadcast list's members — minus
// excludedUserIDs, creates their in-app inbox rows, and pushes via FCM to
// their registered device tokens. It always leaves the in-app inbox
// populated, even if Firebase isn't configured or a push send partially
// fails — push is a best-effort addition, not a precondition for the
// broadcast to be considered sent.
//
// This is the single funnel later individual/group send paths should reuse:
// they just need to supply a different eligible-user-ID list.
func DispatchBroadcast(ctx context.Context, db *pgxpool.Pool, notification *models.Notification, listID *uuid.UUID, excludedUserIDs []uuid.UUID) error {
	var eligibleUserIDs []uuid.UUID
	var err error
	if listID != nil {
		eligibleUserIDs, err = models.GetEligibleUserIDsFromList(ctx, db, *listID, excludedUserIDs)
	} else {
		eligibleUserIDs, err = models.GetEligibleUserIDs(ctx, db, excludedUserIDs, notification.IncludeDoctors)
	}
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

// SendDirectNotification delivers a single-user notification (e.g. a meeting
// reminder) through the same tables/pipeline as a broadcast: one
// notifications row (audience_type='single_user'), one recipient row (so it
// shows up in the in-app inbox immediately regardless of push), and a
// best-effort FCM push to that user's registered devices.
func SendDirectNotification(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, title, body string, deepLink *string) error {
	notificationID, err := models.CreateSingleUserNotification(ctx, db, title, body, deepLink)
	if err != nil {
		return err
	}

	if err := models.CreateRecipientsBatch(ctx, db, notificationID, []uuid.UUID{userID}); err != nil {
		return err
	}

	tokens, err := models.GetDeviceTokensForUsers(ctx, db, []uuid.UUID{userID})
	if err != nil {
		log.Printf("direct notification %s: failed to fetch device tokens: %v", notificationID, err)
		return nil
	}

	data := map[string]string{"notification_id": notificationID.String()}
	if deepLink != nil {
		data["deep_link"] = *deepLink
	}

	successCount, _, invalidTokens, sendErr := utils.SendMulticast(ctx, tokens, title, body, "", data)
	if sendErr != nil {
		log.Printf("direct notification %s: push send error: %v", notificationID, sendErr)
	}
	if len(invalidTokens) > 0 {
		if err := models.DeactivateDeviceTokens(ctx, db, invalidTokens); err != nil {
			log.Printf("direct notification %s: failed to deactivate invalid tokens: %v", notificationID, err)
		}
	}

	return models.UpdateNotificationStatus(ctx, db, notificationID, "sent", 1, successCount, len(tokens)-successCount)
}

// SendPushOnly delivers a best-effort FCM push without touching the
// notifications/notification_recipients tables — used for chat messages,
// which shouldn't clutter the in-app notification inbox (that's reserved
// for broadcasts and order-specific alerts). The chat UI itself is the
// "inbox" for messages.
func SendPushOnly(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, title, body string, deepLink *string) error {
	tokens, err := models.GetDeviceTokensForUsers(ctx, db, []uuid.UUID{userID})
	if err != nil {
		log.Printf("push-only send: failed to fetch device tokens: %v", err)
		return nil
	}
	if len(tokens) == 0 {
		return nil
	}

	data := map[string]string{}
	if deepLink != nil {
		data["deep_link"] = *deepLink
	}

	_, _, invalidTokens, sendErr := utils.SendMulticast(ctx, tokens, title, body, "", data)
	if sendErr != nil {
		log.Printf("push-only send: push send error: %v", sendErr)
	}
	if len(invalidTokens) > 0 {
		if err := models.DeactivateDeviceTokens(ctx, db, invalidTokens); err != nil {
			log.Printf("push-only send: failed to deactivate invalid tokens: %v", err)
		}
	}
	return nil
}
