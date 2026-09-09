package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProductImageHandler struct {
	DB *pgxpool.Pool
}

type addImageRequest struct {
	URL string `json:"url"`
}

// AddImage appends one photo to a product's gallery (max 5), used when adding photos during edit.
func (h *ProductImageHandler) AddImage(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var req addImageRequest
	if err := decodeJSON(r, &req); err != nil || req.URL == "" {
		respondError(w, http.StatusBadRequest, "url is required")
		return
	}

	var count int
	if err := h.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM product_images WHERE product_id=$1`, productID).Scan(&count); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to check existing photos")
		return
	}
	if count >= maxProductImages {
		respondError(w, http.StatusBadRequest, "maksimal 5 foto per produk")
		return
	}

	var id int
	err = h.DB.QueryRow(r.Context(), `
		INSERT INTO product_images (product_id, url, sort_order) VALUES ($1,$2,$3) RETURNING id`,
		productID, req.URL, count).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save photo")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// DeleteImage removes one photo from a product's gallery.
func (h *ProductImageHandler) DeleteImage(w http.ResponseWriter, r *http.Request) {
	imageID, err := strconv.Atoi(chi.URLParam(r, "imageId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid image id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM product_images WHERE id=$1`, imageID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete photo")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
