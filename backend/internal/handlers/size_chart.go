package handlers

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Product size chart (#139, product_size_chart): any number of rows, each a free-text size name
// (S, Free Size, 26 ...) with the same optional measurements the product form always had. It is
// independent of the variants and stock, and is shown as the size chart on the website.
type sizeChartRow struct {
	Size         string `json:"size"`
	Bust         string `json:"bust"`
	Waist        string `json:"waist"`
	Length       string `json:"length"`
	BottomLength string `json:"bottom_length"`
	Elasticity   string `json:"elasticity"`
	Note         string `json:"note"`
}

func (s sizeChartRow) trimmed() sizeChartRow {
	t := strings.TrimSpace
	return sizeChartRow{t(s.Size), t(s.Bust), t(s.Waist), t(s.Length), t(s.BottomLength), t(s.Elasticity), t(s.Note)}
}

func (s sizeChartRow) empty() bool { return s.trimmed() == sizeChartRow{} }

func loadSizeChart(ctx context.Context, db queryRower, productID int) []sizeChartRow {
	out := []sizeChartRow{}
	rows, err := db.Query(ctx, `
		SELECT size_label, bust, waist, length, bottom_length, elasticity, note
		FROM product_size_chart WHERE product_id=$1 ORDER BY sort_order, id`, productID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var s sizeChartRow
		if rows.Scan(&s.Size, &s.Bust, &s.Waist, &s.Length, &s.BottomLength, &s.Elasticity, &s.Note) == nil {
			out = append(out, s)
		}
	}
	return out
}

// saveSizeChartTx replaces a product's size chart; rows with nothing filled in are dropped.
func saveSizeChartTx(ctx context.Context, tx pgx.Tx, productID int, chart []sizeChartRow) error {
	if _, err := tx.Exec(ctx, `DELETE FROM product_size_chart WHERE product_id=$1`, productID); err != nil {
		return err
	}
	order := 0
	for _, row := range chart {
		if row.empty() {
			continue
		}
		s := row.trimmed()
		if _, err := tx.Exec(ctx, `
			INSERT INTO product_size_chart (product_id, sort_order, size_label, bust, waist, length, bottom_length, elasticity, note)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			productID, order, s.Size, s.Bust, s.Waist, s.Length, s.BottomLength, s.Elasticity, s.Note); err != nil {
			return err
		}
		order++
	}
	return nil
}
