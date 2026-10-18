package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// Shared list paging. Every paged list endpoint takes `page` (1-based) and `page_size` and answers
// {items, total, page, page_size}. The size is always capped, so one request can never ask for the
// whole table.
const (
	defaultPageSize = 20
	maxPageSize     = 100
)

type pageParams struct {
	Page, Size, Offset int
}

// parsePage reads page / page_size from the query string. A missing, zero, negative or non-numeric
// value falls back to the defaults, and the size is capped at maxSize (maxPageSize when maxSize <= 0).
func parsePage(r *http.Request, defaultSize, maxSize int) pageParams {
	if defaultSize <= 0 {
		defaultSize = defaultPageSize
	}
	if maxSize <= 0 {
		maxSize = maxPageSize
	}
	q := r.URL.Query()
	p := pageParams{Page: 1, Size: defaultSize}
	if n, err := strconv.Atoi(q.Get("page")); err == nil && n > 0 {
		p.Page = n
	}
	if n, err := strconv.Atoi(q.Get("page_size")); err == nil && n > 0 {
		p.Size = n
	}
	if p.Size > maxSize {
		p.Size = maxSize
	}
	p.Offset = (p.Page - 1) * p.Size
	return p
}

func pageResponse(items any, total int, p pageParams) map[string]any {
	return map[string]any{"items": items, "total": total, "page": p.Page, "page_size": p.Size}
}

// pickSort maps the client's `sort` value to a ready-made ORDER BY fragment. Only values in the
// whitelist reach SQL; anything else (including injection attempts) gets the default.
func pickSort(requested string, allowed map[string]string, fallback string) string {
	if v, ok := allowed[strings.TrimSpace(requested)]; ok {
		return v
	}
	return fallback
}

// isPaged: list endpoints that used to return everything keep doing so unless the caller asks for a page.
func isPaged(r *http.Request) bool { return r.URL.Query().Get("page") != "" }

// limitSQL appends the page's size and offset to args and returns the matching LIMIT / OFFSET clause.
func (p pageParams) limitSQL(args *[]interface{}) string {
	*args = append(*args, p.Size, p.Offset)
	return fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(*args)-1, len(*args))
}
