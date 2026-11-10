// Package officialupdates reads the notices, circulars and notifications
// that government websites publish (CDSCO, CBIC GST, GST Council, the
// Department of Pharmaceuticals), keeps every item once, and tells staff
// when new ones appear. The scheduler runs it once a day; the panel's
// Official Updates page shows the items under each website.
package officialupdates

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// Item is one notice as a website lists it.
type Item struct {
	ExternalID  string // the site's id or link, unique within the source
	Title       string
	RefNo       string
	Category    string
	PublishedOn *time.Time
	Link        string
}

// Source is one list on one website.
type Source struct {
	Key     string `json:"key"`
	Name    string `json:"name"`     // e.g. "CDSCO: Public Notices"
	Site    string `json:"site"`     // the website, e.g. cdsco.gov.in
	PageURL string `json:"page_url"` // the list as people open it
	fetch   func(ctx context.Context, s Source) ([]Item, error)
}

// Sources, in the order the page shows them. GSTN's news page (captcha)
// and the eGazette (session-bound search) can't be read this way; the drug
// rule gazettes reach us through CDSCO's Gazette Notifications list.
var Sources = []Source{
	{Key: "cdsco_notices", Name: "CDSCO: Public Notices", Site: "cdsco.gov.in",
		PageURL: "https://cdsco.gov.in/opencms/opencms/en/Notifications/Public-Notices/", fetch: cdscoTable},
	{Key: "cdsco_gazette", Name: "CDSCO: Gazette Notifications", Site: "cdsco.gov.in",
		PageURL: "https://cdsco.gov.in/opencms/opencms/en/Notifications/Gazette-Notifications/", fetch: cdscoTable},
	{Key: "cdsco_circulars", Name: "CDSCO: Circulars", Site: "cdsco.gov.in",
		PageURL: "https://cdsco.gov.in/opencms/opencms/en/Notifications/Circulars/", fetch: cdscoTable},
	{Key: "cbic_gst", Name: "CBIC: GST Notifications", Site: "taxinformation.cbic.gov.in",
		PageURL: "https://taxinformation.cbic.gov.in/", fetch: cbicGST},
	{Key: "gst_council", Name: "GST Council: Press Releases", Site: "gstcouncil.gov.in",
		PageURL: "https://gstcouncil.gov.in/archive-press-release", fetch: gstCouncil},
	{Key: "dop", Name: "Department of Pharmaceuticals: What's New", Site: "pharma-dept.gov.in",
		PageURL: "https://pharma-dept.gov.in/en/whats-new", fetch: dopWhatsNew},
}

var client = &http.Client{Timeout: 90 * time.Second}

// get fetches a page the way a browser would; some of these sites turn
// away requests without a browser user agent.
func get(ctx context.Context, rawURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-IN,en;q=0.9")
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 20<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered %d", rawURL, res.StatusCode)
	}
	return body, nil
}

func parseHTML(ctx context.Context, rawURL string) (*html.Node, error) {
	body, err := get(ctx, rawURL)
	if err != nil {
		return nil, err
	}
	return html.Parse(strings.NewReader(string(body)))
}

// cdscoTable reads a CDSCO notifications list: a table of
// S.No | Title | Release date (2026-Oct-28) | PDF link | size. The PDF link
// carries the document's id (num_id), which is what makes an item unique.
func cdscoTable(ctx context.Context, s Source) ([]Item, error) {
	doc, err := parseHTML(ctx, s.PageURL)
	if err != nil {
		return nil, err
	}
	var items []Item
	for _, tr := range findAll(doc, "tr") {
		tds := children(tr, "td")
		if len(tds) < 4 {
			continue
		}
		title := text(tds[1])
		href := attr(find(tds[3], "a"), "href")
		if title == "" || href == "" {
			continue
		}
		link := absolute(s.PageURL, href)
		id := link
		if u, err := url.Parse(link); err == nil && u.Query().Get("num_id") != "" {
			id = u.Query().Get("num_id")
		}
		items = append(items, Item{ExternalID: id, Title: title, PublishedOn: date("2006-Jan-02", text(tds[2])), Link: link})
	}
	return items, nil
}

// cbicGST reads the GST notifications the CBIC tax portal shows as its
// latest updates (its own JSON API; the page itself is a JavaScript app).
func cbicGST(ctx context.Context, s Source) ([]Item, error) {
	const gstTaxID = "1000001"
	body, err := get(ctx, "https://taxinformation.cbic.gov.in/api/cbic-notification-msts/fetchUpdatesByTaxId/"+gstTaxID)
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID             int64  `json:"id"`
		UpdatedDate    string `json:"updatedDate"`
		NotificationNo string `json:"notificationNo"`
		Name           string `json:"notificationName"`
		UpdateType     string `json:"updateType"`
		UpdateCategory string `json:"updateCategory"`
	}
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, fmt.Errorf("CBIC sent something other than its list: %w", err)
	}
	items := make([]Item, 0, len(rows))
	for _, r := range rows {
		if r.ID == 0 || strings.TrimSpace(r.Name) == "" {
			continue
		}
		// The portal opens a document at view-pdf/<id>/ENG/<Notifications|Circulars|…>.
		tab := r.UpdateType
		if tab == "Notification" || tab == "Circular" {
			tab += "s"
		}
		id := fmt.Sprint(r.ID)
		items = append(items, Item{
			ExternalID:  id,
			Title:       strings.TrimSpace(r.Name),
			RefNo:       strings.TrimSpace(r.NotificationNo),
			Category:    strings.TrimSpace(r.UpdateCategory),
			PublishedOn: date("02-Jan-2006", r.UpdatedDate),
			Link:        "https://taxinformation.cbic.gov.in/view-pdf/" + id + "/ENG/" + url.PathEscape(tab),
		})
	}
	return items, nil
}

// gstCouncil reads the GST Council's press releases from the archive list
// (the press-release page itself shows only the latest one): a table of
// Sr. No | Date (08-10-2026) | Description, linked to the PDF, newest first.
func gstCouncil(ctx context.Context, s Source) ([]Item, error) {
	doc, err := parseHTML(ctx, s.PageURL)
	if err != nil {
		return nil, err
	}
	var items []Item
	for _, tr := range findAll(doc, "tr") {
		tds := children(tr, "td")
		if len(tds) < 3 {
			continue
		}
		a := find(tds[2], "a")
		href := attr(a, "href")
		title := text(a)
		if href == "" || title == "" {
			continue
		}
		link := absolute(s.PageURL, href)
		items = append(items, Item{ExternalID: link, Title: title, PublishedOn: date("02-01-2006", text(tds[1])), Link: link})
	}
	return items, nil
}

// dopWhatsNew reads the Department of Pharmaceuticals' What's New list:
// linked titles, no dates.
func dopWhatsNew(ctx context.Context, s Source) ([]Item, error) {
	doc, err := parseHTML(ctx, s.PageURL)
	if err != nil {
		return nil, err
	}
	var items []Item
	for _, li := range findAll(doc, "li") {
		if !strings.Contains(attr(li, "class"), "views-row") {
			continue
		}
		a := find(li, "a")
		href := attr(a, "href")
		title := text(a)
		if href == "" || title == "" {
			continue
		}
		link := absolute(s.PageURL, href)
		items = append(items, Item{ExternalID: link, Title: title, Link: link})
	}
	return items, nil
}

// ---- small HTML helpers ----

func findAll(n *html.Node, tag string) []*html.Node {
	var out []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == tag {
			out = append(out, n)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return out
}

func find(n *html.Node, tag string) *html.Node {
	if all := findAll(n, tag); len(all) > 0 {
		return all[0]
	}
	return nil
}

func children(n *html.Node, tag string) []*html.Node {
	var out []*html.Node
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == tag {
			out = append(out, c)
		}
	}
	return out
}

func attr(n *html.Node, key string) string {
	if n == nil {
		return ""
	}
	for _, a := range n.Attr {
		if a.Key == key {
			return strings.TrimSpace(a.Val)
		}
	}
	return ""
}

// text is a node's visible text with whitespace collapsed.
func text(n *html.Node) string {
	if n == nil {
		return ""
	}
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
			b.WriteByte(' ')
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.Join(strings.Fields(b.String()), " ")
}

func absolute(base, href string) string {
	b, err := url.Parse(base)
	if err != nil {
		return href
	}
	u, err := b.Parse(href)
	if err != nil {
		return href
	}
	return u.String()
}

func date(layout, s string) *time.Time {
	t, err := time.Parse(layout, strings.TrimSpace(s))
	if err != nil {
		return nil
	}
	return &t
}
