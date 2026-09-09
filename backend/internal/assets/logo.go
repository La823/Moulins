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

// MoulinsLogoPNGBytes returns the raw embedded PNG bytes, for callers that
// want to base64-embed the file as-is (e.g. into an SVG <image> tag) rather
// than decode-then-re-encode it.
func MoulinsLogoPNGBytes() []byte {
	return moulinsLogoPNG
}
