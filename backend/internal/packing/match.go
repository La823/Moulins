package packing

import (
	"strings"
	"unicode"
)

// normBatch reduces a batch number to what matters for comparing it: upper
// case letters and digits only, with O read as 0 and I/L as 1 on both
// sides, since photos and fonts blur those (a real batch differing only
// there is not something Marg holds).
func normBatch(s string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		switch {
		case r == 'O':
			b.WriteRune('0')
		case r == 'I' || r == 'L':
			b.WriteRune('1')
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
		}
	}
	return b.String()
}

// sameBatch reports whether two batch numbers are the same batch.
func sameBatch(a, b string) bool {
	na, nb := normBatch(a), normBatch(b)
	return na != "" && na == nb
}

// Result values stored in order_item_packing.result.
const (
	ResultMatch      = "match"
	ResultMismatch   = "mismatch"
	ResultUnreadable = "unreadable"
	ResultUnchecked  = "unchecked" // nothing in Marg to compare with; recorded as read
)

// verdict compares the batch read off a pack with what the line expects:
// the batch chosen on the order when there is one, otherwise any batch Marg
// has for the product. productDiffers is the reader's view that the photo
// shows a different product.
func verdict(read, expected string, known []string, productDiffers bool, productSeen string) (result, note string) {
	if strings.TrimSpace(read) == "" {
		return ResultUnreadable, "The batch number could not be read. Take the photo again, closer and in good light."
	}
	if productDiffers {
		seen := strings.TrimSpace(productSeen)
		if seen == "" {
			seen = "a different product"
		}
		return ResultMismatch, "The photo looks like " + seen + ", not this product."
	}
	if expected != "" {
		if sameBatch(read, expected) {
			return ResultMatch, ""
		}
		for _, k := range known {
			if sameBatch(read, k) {
				return ResultMismatch, "This is batch " + k + ", but the order needs batch " + expected + "."
			}
		}
		return ResultMismatch, "Batch " + read + " is not the batch on the order (" + expected + ")."
	}
	if len(known) == 0 {
		return ResultUnchecked, "No batch was chosen on the order and Marg has none for this product, so the batch read has been recorded."
	}
	for _, k := range known {
		if sameBatch(read, k) {
			return ResultMatch, "No batch was chosen on the order; " + k + " is one of this product's batches in Marg."
		}
	}
	return ResultMismatch, "Batch " + read + " is not one of this product's batches in Marg."
}
