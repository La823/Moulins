package packing

import (
	"bytes"
	"image"
	_ "image/jpeg" // registers the decoders DecodeConfig needs
	_ "image/png"

	_ "golang.org/x/image/webp"
)

// imageSize reads a photo's pixel size from its header (0, 0 if unknown).
func imageSize(b []byte) (width, height int) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}
