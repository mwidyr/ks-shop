package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ActivityLogHandler powers Log Audit: a unified feed of "important changes" - order status
// transitions (order_status_log), stock changes (stock_movements), and everything else logged
// via logActivity (product price edits, pickup-chain fee edits, customer label changes, staff
// role/active changes) - combined via UNION rather than duplicating the existing history tables.
type ActivityLogHandler struct {
	DB *pgxpool.Pool
}

// execer is satisfied by both *pgxpool.Pool and pgx.Tx, so logActivity can be called either
// standalone or inside an existing transaction.
type execer interface {
	Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error)
}

// logActivity records one activity_log row. userID may be nil (system-initiated change).
func logActivity(ctx context.Context, db execer, entityType string, entityID int, action string, userID *int, detail string) {
	db.Exec(ctx, `
		INSERT INTO activity_log (entity_type, entity_id, action, changed_by, detail) VALUES ($1,$2,$3,$4,$5)`,
		entityType, entityID, action, userID, detail)
}

type activityRow struct {
	EntityType string `json:"entity_type"`
	EntityID   int    `json:"entity_id"`
	Action     string `json:"action"`
	ActorName  string `json:"actor_name"`
	Detail     string `json:"detail"`
	CreatedAt  string `json:"created_at"`
}

// List returns the combined activity feed, newest first, paginated.
func (h *ActivityLogHandler) List(w http.ResponseWriter, r *http.Request) {
	page := 1
	if p, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 50
	if ps, err := strconv.Atoi(r.URL.Query().Get("page_size")); err == nil && ps > 0 {
		pageSize = ps
	}

	query := `
		WITH feed AS (
			SELECT 'activity'::text AS source, entity_type, entity_id, action, changed_by, detail, created_at
			FROM activity_log
			UNION ALL
			SELECT 'order'::text, 'order', order_id, 'status: ' || COALESCE(status_from,'-') || ' -> ' || status_to,
			       changed_by, COALESCE(reason,''), created_at
			FROM order_status_log
			UNION ALL
			SELECT 'stock'::text, 'product_variant', variant_id, 'stock: ' || event_type,
			       user_id, bucket_from || ' -> ' || bucket_to || ' (qty ' || qty || ')' || CASE WHEN note IS NOT NULL THEN ' - ' || note ELSE '' END,
			       created_at
			FROM stock_movements
		)
		SELECT feed.entity_type, feed.entity_id, feed.action, COALESCE(u.name, 'system'), feed.detail, feed.created_at
		FROM feed LEFT JOIN users u ON u.id = feed.changed_by
		ORDER BY feed.created_at DESC
		LIMIT $1 OFFSET $2`

	rows, err := h.DB.Query(r.Context(), query, pageSize, (page-1)*pageSize)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch activity log")
		return
	}
	defer rows.Close()

	list := []activityRow{}
	for rows.Next() {
		var a activityRow
		var createdAt time.Time
		if err := rows.Scan(&a.EntityType, &a.EntityID, &a.Action, &a.ActorName, &a.Detail, &createdAt); err != nil {
			continue
		}
		a.CreatedAt = createdAt.Format(time.RFC3339)
		list = append(list, a)
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"items": list, "page": page, "page_size": pageSize})
}
