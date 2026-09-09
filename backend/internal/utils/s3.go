package utils

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	"github.com/google/uuid"
)

var s3Client *s3.Client
var s3PresignClient *s3.PresignClient

func InitS3() error {
	region := os.Getenv("AWS_REGION")
	accessKey := os.Getenv("AWS_ACCESS_KEY_ID")
	secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY")

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return err
	}

	s3Client = s3.NewFromConfig(cfg)
	s3PresignClient = s3.NewPresignClient(s3Client)
	return nil
}

func GeneratePresignedUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("products/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GenerateChatImageUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("chat/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedDocUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("documents/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedNotificationUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("notifications/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedHighlightUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("highlights/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedCarouselUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("carousel/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedFocusUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("focus/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedLedgerUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("ledgers/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedPaymentUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("payments/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedResumeUploadURL(filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("resumes/%s-%s", uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedSpecialProductImageUploadURL(customerID, filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("special-products/%s/images/%s-%s", customerID, uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedSpecialProductDocUploadURL(customerID, filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("special-products/%s/documents/%s-%s", customerID, uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedSpecialProductAudioUploadURL(customerID, filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("special-products/%s/audio/%s-%s", customerID, uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

// GeneratePresignedSpecialTileUploadURL is for the small image shown on a
// special customer's "Special" filter tile on the products page — one per
// customer, admin-set from their partner detail page.
func GeneratePresignedSpecialTileUploadURL(customerID, filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("special-tile/%s/%s-%s", customerID, uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

func GeneratePresignedDesignFileUploadURL(productID, filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("design-files/%s/%s-%s", productID, uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

// GeneratePresignedOrderTrackingUploadURL is for the courier tracking
// screenshot/image attached to an order's delivery details — namespaced
// per-order so it's distinguishable from bill photos in S3.
func GeneratePresignedOrderTrackingUploadURL(orderID, filename string) (uploadURL string, key string, err error) {
	bucket := os.Getenv("S3_BUCKET")
	key = fmt.Sprintf("orders/%s/tracking/%s-%s", orderID, uuid.New().String(), filename)

	req, err := s3PresignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", "", err
	}

	return req.URL, key, nil
}

// ObjectExists reports whether key is already present in the bucket, so
// callers that generate-then-cache a derived asset (e.g. a QR code SVG) can
// skip regenerating it on every request.
func ObjectExists(key string) (bool, error) {
	exists, _, err := ObjectLastModified(key)
	return exists, err
}

// ObjectLastModified is ObjectExists plus the object's LastModified time —
// used to cache-bust a public URL (e.g. ?v=<unix-ts>) so that regenerating a
// derived asset under the same key (a re-styled QR code, say) actually shows
// up in browsers instead of being served from their image cache forever,
// since the S3 key itself never changes.
func ObjectLastModified(key string) (bool, time.Time, error) {
	bucket := os.Getenv("S3_BUCKET")
	out, err := s3Client.HeadObject(context.TODO(), &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		var nf *s3types.NotFound
		if errors.As(err, &nf) {
			return false, time.Time{}, nil
		}
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "NotFound" {
			return false, time.Time{}, nil
		}
		return false, time.Time{}, err
	}
	var lm time.Time
	if out.LastModified != nil {
		lm = *out.LastModified
	}
	return true, lm, nil
}

func UploadToS3(key string, data []byte, contentType string) error {
	bucket := os.Getenv("S3_BUCKET")
	_, err := s3Client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	return err
}

// GeneratePresignedDownloadURL creates a short-lived S3 GET URL that forces
// the browser to download (rather than display) the object, with a friendly
// filename. Used to gate file downloads behind login — obtaining this URL
// requires hitting an authenticated endpoint first, unlike the object's
// plain public URL.
func GeneratePresignedDownloadURL(key, filename string) (string, error) {
	bucket := os.Getenv("S3_BUCKET")
	disposition := fmt.Sprintf(`attachment; filename="%s"`, filename)

	req, err := s3PresignClient.PresignGetObject(context.TODO(), &s3.GetObjectInput{
		Bucket:                     aws.String(bucket),
		Key:                        aws.String(key),
		ResponseContentDisposition: aws.String(disposition),
	}, s3.WithPresignExpires(2*time.Minute))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func GetPublicURL(key string) string {
	bucket := os.Getenv("S3_BUCKET")
	region := os.Getenv("AWS_REGION")
	return fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, region, key)
}

// ListObjectKeys returns every object key under prefix — used to find
// derived assets (e.g. cached QR codes) that need cleaning up when their
// source data (a rack, a pallet) is deleted, since S3 keeps no back-link to
// what generated them.
func ListObjectKeys(prefix string) ([]string, error) {
	bucket := os.Getenv("S3_BUCKET")
	var keys []string
	paginator := s3.NewListObjectsV2Paginator(s3Client, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.TODO())
		if err != nil {
			return nil, err
		}
		for _, obj := range page.Contents {
			keys = append(keys, *obj.Key)
		}
	}
	return keys, nil
}

// DeleteObject removes one object from the bucket. A delete of a key that
// doesn't exist is not an error (S3's own behavior).
func DeleteObject(key string) error {
	bucket := os.Getenv("S3_BUCKET")
	_, err := s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}
