package utils

import (
	"bytes"
	"context"
	"crypto/sha256"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func TestDeleteThumbnailRefusesOriginals(t *testing.T) {
	for _, key := range []string{"products/abc.jpg", "thumbsX/abc.jpg", "", "/thumbs/abc.jpg"} {
		if err := DeleteThumbnail(key); err == nil || !strings.Contains(err.Error(), "not a thumbnail") {
			t.Errorf("DeleteThumbnail(%q) = %v, want a refusal", key, err)
		}
	}
}

// Makes a thumbnail from a throwaway image in the real bucket and checks it,
// and that the original is byte-for-byte untouched. Cleans up after itself.
//
//	S3_CACHE_TEST=1 go test ./internal/utils/ -run TestMakeThumbnail
func TestMakeThumbnail(t *testing.T) {
	if os.Getenv("S3_CACHE_TEST") == "" {
		t.Skip("set S3_CACHE_TEST=1 to run")
	}
	_ = godotenv.Load("../../.env")
	if err := InitS3(); err != nil {
		t.Fatal(err)
	}

	// 1600x900, transparent except a red square in the middle
	src := image.NewNRGBA(image.Rect(0, 0, 1600, 900))
	for y := 300; y < 600; y++ {
		for x := 650; x < 950; x++ {
			src.Set(x, y, color.NRGBA{255, 0, 0, 255})
		}
	}
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, src); err != nil {
		t.Fatal(err)
	}
	original := pngBuf.Bytes()
	srcKey := "tmp-thumb-check/" + uuid.New().String() + " original.png"
	if err := UploadToS3(srcKey, original, "image/png"); err != nil {
		t.Fatal(err)
	}
	defer DeleteObject(srcKey)

	thumbKey, err := MakeThumbnail(context.Background(), srcKey)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := DeleteThumbnail(thumbKey); err != nil {
			t.Errorf("cleanup: %v", err)
		}
	}()
	if !strings.HasPrefix(thumbKey, ThumbPrefix) {
		t.Errorf("thumbnail key %q is not under %s", thumbKey, ThumbPrefix)
	}

	get := func(key string) (*http.Response, []byte) {
		t.Helper()
		res, err := http.Get(strings.ReplaceAll(GetPublicURL(key), " ", "%20"))
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		if res.StatusCode != 200 {
			t.Fatalf("GET %s: %d", key, res.StatusCode)
		}
		return res, body
	}

	// the original is exactly what was uploaded
	_, after := get(srcKey)
	if sha256.Sum256(after) != sha256.Sum256(original) {
		t.Fatal("the original image changed")
	}

	res, body := get(thumbKey)
	if ct := res.Header.Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("thumbnail Content-Type = %q", ct)
	}
	if cc := res.Header.Get("Cache-Control"); cc != LongCacheControl {
		t.Errorf("thumbnail Cache-Control = %q", cc)
	}
	thumb, err := jpeg.Decode(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if b := thumb.Bounds(); b.Dx() != 480 || b.Dy() != 270 {
		t.Errorf("thumbnail is %dx%d, want 480x270", b.Dx(), b.Dy())
	}
	// transparency became white, not black
	if r, g, b, _ := thumb.At(5, 5).RGBA(); r>>8 < 240 || g>>8 < 240 || b>>8 < 240 {
		t.Errorf("corner pixel is %d,%d,%d — transparent background should be white", r>>8, g>>8, b>>8)
	}
	// and the red square survived
	if r, g, _, _ := thumb.At(240, 135).RGBA(); r>>8 < 200 || g>>8 > 60 {
		t.Errorf("centre pixel is not red: r=%d g=%d", r>>8, g>>8)
	}
	t.Logf("original %d KB → thumbnail %d KB", len(original)/1024, len(body)/1024)
}
