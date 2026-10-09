package utils

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"strings"

	_ "image/gif" // decoders, registered for imaging.Decode
	_ "image/png"

	_ "golang.org/x/image/webp"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/disintegration/imaging"
	"github.com/google/uuid"
)

// Product card thumbnails: a small JPEG made from a product's first image.
//
// The original is only ever read. The thumbnail is a new object under
// thumbs/, with a fresh uuid key every time, so it can be cached for a year
// and a regenerated one never collides with the old.

const (
	ThumbPrefix = "thumbs/"
	thumbWidth  = 480 // product cards show the picture at well under this
	thumbJPEGQ  = 82
)

// MakeThumbnail reads the image at srcKey and uploads a thumbnail of it,
// returning the thumbnail's key.
func MakeThumbnail(ctx context.Context, srcKey string) (string, error) {
	bucket := os.Getenv("S3_BUCKET")
	obj, err := s3Client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(srcKey)})
	if err != nil {
		return "", fmt.Errorf("read original: %w", err)
	}
	defer obj.Body.Close()

	// AutoOrientation applies a phone photo's EXIF rotation, so the
	// thumbnail stands the same way the original does in a browser
	img, err := imaging.Decode(obj.Body, imaging.AutoOrientation(true))
	if err != nil {
		return "", fmt.Errorf("decode original: %w", err)
	}
	if img.Bounds().Dx() > thumbWidth {
		img = imaging.Resize(img, thumbWidth, 0, imaging.Lanczos)
	}
	// JPEG has no transparency: put transparent PNGs on white, or their
	// background would come out black
	b := img.Bounds()
	flat := imaging.New(b.Dx(), b.Dy(), color.White)
	flat = imaging.Overlay(flat, img, image.Pt(0, 0), 1)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, flat, &jpeg.Options{Quality: thumbJPEGQ}); err != nil {
		return "", fmt.Errorf("encode thumbnail: %w", err)
	}

	key := ThumbPrefix + uuid.New().String() + ".jpg"
	if _, err := s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:       aws.String(bucket),
		Key:          aws.String(key),
		Body:         bytes.NewReader(buf.Bytes()),
		ContentType:  aws.String("image/jpeg"),
		CacheControl: aws.String(LongCacheControl),
	}); err != nil {
		return "", fmt.Errorf("upload thumbnail: %w", err)
	}
	return key, nil
}

// DeleteThumbnail removes a thumbnail made by MakeThumbnail. It refuses any
// key outside thumbs/, so it can never delete an original image.
func DeleteThumbnail(key string) error {
	if !strings.HasPrefix(key, ThumbPrefix) {
		return fmt.Errorf("refusing to delete %q: not a thumbnail", key)
	}
	return DeleteObject(key)
}
