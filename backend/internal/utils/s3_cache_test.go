package utils

import (
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

// Proves SetLongCacheControl on a throwaway object in the real bucket: the
// object must stay publicly readable (copying an object onto itself can
// reset a per-object ACL), keep its content type and content, and come back
// with the new Cache-Control. Deletes the object afterwards.
//
// Opt-in, because it touches the real bucket:
//
//	S3_CACHE_TEST=1 go test ./internal/utils/ -run TestSetLongCacheControl
func TestSetLongCacheControl(t *testing.T) {
	if os.Getenv("S3_CACHE_TEST") == "" {
		t.Skip("set S3_CACHE_TEST=1 to run")
	}
	_ = godotenv.Load("../../.env")
	if err := InitS3(); err != nil {
		t.Fatal(err)
	}
	key := "tmp-cache-check/" + uuid.New().String() + " a file.txt" // a space, as real filenames have
	body := "cache check " + key
	if err := UploadToS3(key, []byte(body), "text/plain"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := DeleteObject(key); err != nil {
			t.Errorf("could not delete test object %s: %v", key, err)
		}
	}()

	if err := SetLongCacheControl(context.Background(), key); err != nil {
		t.Fatal(err)
	}

	res, err := http.Get(strings.ReplaceAll(GetPublicURL(key), " ", "%20"))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	got, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("public GET after copy: %d — the copy made the object private", res.StatusCode)
	}
	if cc := res.Header.Get("Cache-Control"); cc != LongCacheControl {
		t.Errorf("Cache-Control = %q, want %q", cc, LongCacheControl)
	}
	if ct := res.Header.Get("Content-Type"); ct != "text/plain" {
		t.Errorf("Content-Type = %q, want text/plain", ct)
	}
	if string(got) != body {
		t.Errorf("content changed: %q", got)
	}
}
