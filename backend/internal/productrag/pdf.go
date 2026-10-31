package productrag

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"strings"
)

const transcribePrompt = `Transcribe this document into clean Markdown so it can be searched and quoted.
- Keep every piece of text: headings, paragraphs, bullet points, tables (as Markdown tables), footnotes.
- Where a slide or page carries a meaningful picture, chart or diagram, describe it in one short line in [brackets].
- Leave out page numbers, repeated headers/footers and decoration.
- Do not summarise, add commentary or add anything that is not in the document.
Output only the transcription.`

// transcribePDF has Gemini read a PDF and return its text as Markdown. The
// model sees each page as an image as well as its text layer, so this also
// works for scanned PDFs and slide decks saved as PDF, where plain text
// extraction returns little or nothing.
func transcribePDF(ctx context.Context, pdf []byte) (string, error) {
	text, truncated, err := generate(ctx, geminiRequest{
		Parts:     []map[string]any{pdfPart(base64.StdEncoding.EncodeToString(pdf)), textPart(transcribePrompt)},
		MaxTokens: 32000,
	})
	if err != nil {
		return "", fmt.Errorf("productrag: transcribe pdf: %w", err)
	}
	if truncated {
		log.Printf("productrag: pdf transcription hit the output limit — indexing the part transcribed")
	}
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("productrag: transcribe pdf: empty transcription")
	}
	return text, nil
}

// chunk sizes in characters — about 400–600 tokens of English per chunk:
// big enough to hold a whole idea, small enough that a search hit points at
// the right passage.
const (
	chunkTarget = 2000
	chunkMax    = 3000
)

// chunkText splits Markdown into passages along paragraph boundaries. Each
// passage repeats the last paragraph of the one before, so an idea that
// straddles a boundary is still whole in at least one of them.
func chunkText(text string) []string {
	var paras []string
	for _, p := range strings.Split(text, "\n\n") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// a single giant paragraph (a long table, say) is cut by lines
		for len(p) > chunkMax {
			cut := strings.LastIndex(p[:chunkMax], "\n")
			if cut < chunkMax/2 {
				cut = chunkMax
			}
			paras = append(paras, strings.TrimSpace(p[:cut]))
			p = strings.TrimSpace(p[cut:])
		}
		paras = append(paras, p)
	}

	var chunks []string
	var cur []string
	size := 0
	for _, p := range paras {
		if size > 0 && size+len(p) > chunkTarget {
			chunks = append(chunks, strings.Join(cur, "\n\n"))
			last := cur[len(cur)-1]
			cur, size = nil, 0
			if len(last)+len(p) <= chunkMax {
				cur, size = []string{last}, len(last)
			}
		}
		cur = append(cur, p)
		size += len(p)
	}
	if len(cur) > 0 {
		chunks = append(chunks, strings.Join(cur, "\n\n"))
	}
	return chunks
}
