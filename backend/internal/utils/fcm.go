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

// PushChannel is how a push sounds on the phone: the Android notification
// channel it is posted to (the app creates these; on Android 8+ the channel
// decides the sound) and the sound iOS plays. A channel the installed app
// doesn't have yet falls back to broadcast_channel (the manifest default), so
// older app versions still show every push.
type PushChannel struct {
	AndroidChannel string
	Sound          string // iOS sound: "default" for the phone's own, a bundled file, or "" for none
}

var (
	BroadcastPush = PushChannel{AndroidChannel: "broadcast_channel"}
	// Meeting reminders: the phone's default notification sound.
	MeetingPush = PushChannel{AndroidChannel: "meeting_reminders", Sound: "default"}
	// New orders: the order sound bundled with the app (res/raw/order, order.caf).
	OrderPush = PushChannel{AndroidChannel: "order_alerts", Sound: "order.caf"}
)

// SendMulticast sends the same notification to up to 500 tokens at a time and
// reports back which tokens were rejected as invalid/unregistered so callers
// can prune them. No-ops when Firebase isn't configured.
func SendMulticast(ctx context.Context, tokens []string, title, body, imageURL string, data map[string]string) (successCount, failureCount int, invalidTokens []string, err error) {
	return SendMulticastOn(ctx, BroadcastPush, tokens, title, body, imageURL, data)
}

// SendMulticastOn is SendMulticast on a given channel. The channel id also
// goes in the data, so the app can post a push that arrives while it is open
// to the same channel.
func SendMulticastOn(ctx context.Context, ch PushChannel, tokens []string, title, body, imageURL string, data map[string]string) (successCount, failureCount int, invalidTokens []string, err error) {
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

		withChannel := map[string]string{"channel": ch.AndroidChannel}
		for k, v := range data {
			withChannel[k] = v
		}
		var apns *messaging.APNSConfig
		if ch.Sound != "" {
			apns = &messaging.APNSConfig{Payload: &messaging.APNSPayload{Aps: &messaging.Aps{Sound: ch.Sound}}}
		}

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
					ChannelID: ch.AndroidChannel,
					Priority:  messaging.PriorityHigh,
					ImageURL:  imageURL,
				},
			},
			APNS: apns,
			Data: withChannel,
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
