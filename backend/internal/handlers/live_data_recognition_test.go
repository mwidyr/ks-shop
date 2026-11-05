package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func liveIntPtr(v int) *int { return &v }

func TestNormalizeRecognizedKeepsOnlyTheTabsFields(t *testing.T) {
	r := &recognizedLiveData{Tab: " Penonton ", Views: liveIntPtr(772), Likes: liveIntPtr(5), LiveDurationSeconds: liveIntPtr(10260)}
	normalizeRecognized(r)
	if r.Tab != tabViewers || r.Views == nil || r.Likes != nil || *r.LiveDurationSeconds != 10260 {
		t.Fatalf("penonton: %+v", r)
	}
	e := &recognizedLiveData{Tab: "ENGAGEMENT", Views: liveIntPtr(1), Likes: liveIntPtr(468), Chats: liveIntPtr(91)}
	normalizeRecognized(e)
	if e.Tab != tabEngagement || e.Views != nil || *e.Likes != 468 || *e.Chats != 91 {
		t.Fatalf("engagement: %+v", e)
	}
	o := &recognizedLiveData{Tab: "berlian", Views: liveIntPtr(1), LiveDurationSeconds: liveIntPtr(5)}
	normalizeRecognized(o)
	if o.Tab != tabOther || o.Views != nil || o.LiveDurationSeconds != nil {
		t.Fatalf("other: %+v", o)
	}
}

func pngOfWidth(w int) []byte {
	var b bytes.Buffer
	_ = png.Encode(&b, image.NewRGBA(image.Rect(0, 0, w, 10)))
	return b.Bytes()
}

// A fake OpenAI that answers by the width of the image it was sent: 10px = Penonton, 20px = Engagement,
// 30px = a tab we do not use.
func fakeOpenAI(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []struct {
				Content []struct {
					ImageURL struct {
						URL string `json:"url"`
					} `json:"image_url"`
				} `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		raw, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(req.Messages[0].Content[1].ImageURL.URL, "data:image/png;base64,"))
		cfg, _, _ := image.DecodeConfig(bytes.NewReader(raw))
		answer := map[int]string{
			10: `{"tab":"penonton","views":772,"uv":665,"active_viewers":19,"awt_seconds":37,"pcu":8,"acu":2,"live_duration_seconds":10260,"likes":9}`,
			20: `{"tab":"engagement","follows":12,"chats":91,"shares":1,"likes":468,"live_duration_seconds":10260}`,
			30: `{"tab":"berlian"}`,
		}[cfg.Width]
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": map[string]string{"content": answer}}}})
	}))
}

func TestRecognizeReadsEachScreenshotOnItsOwn(t *testing.T) {
	ai := fakeOpenAI(t)
	defer ai.Close()
	openAIChatURL = ai.URL
	defer func() { openAIChatURL = "https://api.openai.com/v1/chat/completions" }()

	files := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(pngOfWidth(map[string]int{"/a.png": 10, "/b.png": 20, "/c.png": 30}[r.URL.Path]))
	}))
	defer files.Close()

	h := &LiveDataHandler{OpenAIAPIKey: "k", OpenAIVisionModel: "m", LiveDataAccessSecret: "s"}
	tok, _ := generateLiveDataToken("s")
	body, _ := json.Marshal(map[string]any{"image_urls": []string{files.URL + "/b.png", files.URL + "/a.png", files.URL + "/c.png"}})
	req := httptest.NewRequest(http.MethodPost, "/recognize", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	h.Recognize(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var out struct {
		Images []recognizedImage `json:"images"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Images) != 3 || out.Images[0].Data.Tab != tabEngagement || out.Images[1].Data.Tab != tabViewers || out.Images[2].Data.Tab != tabOther {
		t.Fatalf("tabs: %s", rec.Body)
	}
	// order of the request is kept, and the Penonton screenshot's stray "likes" was dropped
	if *out.Images[1].Data.Views != 772 || out.Images[1].Data.Likes != nil || *out.Images[0].Data.Likes != 468 || *out.Images[1].Data.AWTSeconds != 37 {
		t.Fatalf("values: %s", rec.Body)
	}
}

func TestRecognizeRejectsMoreThanFourImages(t *testing.T) {
	h := &LiveDataHandler{OpenAIAPIKey: "k", LiveDataAccessSecret: "s"}
	tok, _ := generateLiveDataToken("s")
	body, _ := json.Marshal(map[string]any{"image_urls": []string{"a", "b", "c", "d", "e"}})
	req := httptest.NewRequest(http.MethodPost, "/recognize", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	h.Recognize(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d", rec.Code)
	}
}
