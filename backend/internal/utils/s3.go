package utils

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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

func GetPublicURL(key string) string {
	bucket := os.Getenv("S3_BUCKET")
	region := os.Getenv("AWS_REGION")
	return fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, region, key)
}
