package utils

import (
	"context"
	"log"
	"os"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

var fcmClient *messaging.Client

// InitFCM sets up the Firebase Admin SDK from the FIREBASE_CREDENTIALS_JSON env
// var. If it's not set, push sending is disabled and SendMulticast becomes a
// no-op — broadcasts still succeed via the in-app inbox alone.
func InitFCM() {
	credsJSON := os.Getenv("FIREBASE_CREDENTIALS_JSON")
	if credsJSON == "" {
		log.Println("FIREBASE_CREDENTIALS_JSON not set, push notifications disabled")
		return
	}

	app, err := firebase.NewApp(context.Background(), nil, option.WithCredentialsJSON([]byte(credsJSON)))
	if err != nil {
		log.Printf("WARNING: failed to init Firebase app: %v — push notifications disabled", err)
		return
	}

	client, err := app.Messaging(context.Background())
	if err != nil {
		log.Printf("WARNING: failed to init FCM client: %v — push notifications disabled", err)
		return
	}

	fcmClient = client
	log.Println("FCM client initialized")
}

// SendMulticast sends the same notification to up to 500 tokens at a time and
// reports back which tokens were rejected as invalid/unregistered so callers
// can prune them. No-ops when Firebase isn't configured.
func SendMulticast(ctx context.Context, tokens []string, title, body, imageURL string, data map[string]string) (successCount, failureCount int, invalidTokens []string, err error) {
	if fcmClient == nil || len(tokens) == 0 {
		return 0, 0, nil, nil
	}

	const chunkSize = 500
	for i := 0; i < len(tokens); i += chunkSize {
		end := i + chunkSize
		if end > len(tokens) {
			end = len(tokens)
		}
		chunk := tokens[i:end]

		msg := &messaging.MulticastMessage{
			Tokens: chunk,
			Notification: &messaging.Notification{
				Title:    title,
				Body:     body,
				ImageURL: imageURL,
			},
			Android: &messaging.AndroidConfig{
				Priority: "high",
				Notification: &messaging.AndroidNotification{
					ChannelID: "broadcast_channel",
					Priority:  messaging.PriorityHigh,
					ImageURL:  imageURL,
				},
			},
			Data: data,
		}

		resp, sendErr := fcmClient.SendEachForMulticast(ctx, msg)
		if sendErr != nil {
			err = sendErr
			continue
		}

		successCount += resp.SuccessCount
		failureCount += resp.FailureCount

		for j, r := range resp.Responses {
			if r.Success {
				continue
			}
			if messaging.IsRegistrationTokenNotRegistered(r.Error) || messaging.IsInvalidArgument(r.Error) {
				invalidTokens = append(invalidTokens, chunk[j])
			}
		}
	}

	return successCount, failureCount, invalidTokens, err
}
