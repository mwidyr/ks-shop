package handlers

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type UploadHandler struct {
	UploadDir string

	// Cloudinary credentials. When all three are set, uploads go to Cloudinary instead of local
	// disk - required on any host with an ephemeral filesystem (Render, Fly, etc.), since a
	// locally-saved file disappears on the next restart/redeploy there.
	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
}

const maxUploadSize = 5 << 20 // 5MB

var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

var unsafeFilenameChars = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

func (h *UploadHandler) usesCloudStorage() bool {
	return h.CloudinaryCloudName != "" && h.CloudinaryAPIKey != "" && h.CloudinaryAPISecret != ""
}

// UploadImage accepts a multipart "image" field, validates type/size, and stores it either on
// Cloudinary (when credentials are configured) or on local disk (dev fallback), returning a URL
// the frontend can store directly as a product's image_url. resolveUrl() on the frontend passes
// absolute (http...) URLs through unchanged, so a Cloudinary URL needs no special handling there.
func (h *UploadHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		respondError(w, http.StatusBadRequest, "file too large or invalid form (max 5MB)")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		respondError(w, http.StatusBadRequest, "missing image file")
		return
	}
	defer file.Close()

	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	contentType := http.DetectContentType(buf[:n])
	if !allowedImageTypes[contentType] {
		respondError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG or WebP)")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	if h.usesCloudStorage() {
		url, err := h.uploadToCloudinary(file, header.Filename)
		if err != nil {
			respondError(w, http.StatusBadGateway, "failed to upload image to cloud storage: "+err.Error())
			return
		}
		respondJSON(w, http.StatusCreated, map[string]string{"url": url})
		return
	}

	safeName := unsafeFilenameChars.ReplaceAllString(filepath.Base(header.Filename), "_")
	filename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
	destPath := filepath.Join(h.UploadDir, filename)

	dest, err := os.Create(destPath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dest.Close()

	if _, err := io.Copy(dest, file); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"url": "/uploads/" + strings.TrimPrefix(filename, "/")})
}

// uploadToCloudinary sends the file to Cloudinary's signed upload API. Signing is a plain SHA1
// over the sorted-and-concatenated params (just "timestamp" here) plus the API secret, so no
// dashboard "upload preset" needs to be configured - only the three account credentials.
func (h *UploadHandler) uploadToCloudinary(file multipart.File, filename string) (string, error) {
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	sum := sha1.Sum([]byte("timestamp=" + timestamp + h.CloudinaryAPISecret))
	signature := hex.EncodeToString(sum[:])

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", err
	}
	fields := map[string]string{
		"api_key":   h.CloudinaryAPIKey,
		"timestamp": timestamp,
		"signature": signature,
	}
	for field, value := range fields {
		if err := writer.WriteField(field, value); err != nil {
			return "", err
		}
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	uploadURL := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/image/upload", h.CloudinaryCloudName)
	req, err := http.NewRequest(http.MethodPost, uploadURL, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		SecureURL string `json:"secure_url"`
		Error     struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		if result.Error.Message != "" {
			return "", fmt.Errorf("%s", result.Error.Message)
		}
		return "", fmt.Errorf("cloudinary returned status %d", resp.StatusCode)
	}
	return result.SecureURL, nil
}
