// Package assets holds small static files embedded directly into the Go
// binary (not served over HTTP) — currently just the Moulins mark used to
// brand generated QR codes.
package assets

import (
	"bytes"
	_ "embed"
	"image"
	_ "image/png"
)

//go:embed moulins_logo.png
var moulinsLogoPNG []byte

// MoulinsLogo decodes the embedded Moulins mark once per call. Callers that
// need it repeatedly (e.g. per QR code) should cache the result themselves.
func MoulinsLogo() (image.Image, error) {
	img, _, err := image.Decode(bytes.NewReader(moulinsLogoPNG))
	return img, err
}
