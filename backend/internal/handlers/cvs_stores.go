package handlers

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CvsStoreHandler validates a typed 7-Eleven/FamilyMart store code against a locally-cached
// copy of ECPay's own store directory (their "取得門市清單"/GetStoreList Logistics API), so
// staff get an immediate "kode toko tidak ditemukan" warning instead of only finding out at
// pickup time. The cache is refreshed lazily (once a day at most) rather than on a schedule,
// consistent with this app's existing "computed/refreshed at query time" convention.
type CvsStoreHandler struct {
	DB         *pgxpool.Pool
	MerchantID string
	HashKey    string
	HashIV     string
	BaseURL    string
}

func (h *CvsStoreHandler) configured() bool {
	return h.MerchantID != "" && h.HashKey != "" && h.HashIV != "" && h.BaseURL != ""
}

// phpURLEncode replicates PHP's urlencode(): percent-encode everything except letters, digits
// and -_. (uppercase hex), space becomes '+'. ECPay's CheckMacValue algorithm is defined in
// terms of this exact encoding, not the stricter RFC 3986 encoding Go's net/url uses by default.
func phpURLEncode(s string) string {
	var b strings.Builder
	for _, r := range []byte(s) {
		switch {
		case r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			b.WriteByte(r)
		case r == ' ':
			b.WriteByte('+')
		default:
			fmt.Fprintf(&b, "%%%02X", r)
		}
	}
	return b.String()
}

var ecpayEncodeReplacements = []struct{ from, to string }{
	{"%2D", "-"}, {"%5F", "_"}, {"%2E", "."}, {"%21", "!"},
	{"%2A", "*"}, {"%28", "("}, {"%29", ")"},
}

// ecpayCheckMacValue implements ECPay's checksum algorithm for their Logistics "Helper" APIs
// (GetStoreList and friends), which - unlike the newer SHA256-based payment APIs - still uses
// MD5: sort params A-Z, wrap with HashKey/HashIV, URL-encode, restore a few characters PHP's
// urlencode would otherwise escape, lowercase, MD5, uppercase. Verified against ECPay's own
// interactive API tester (developersmock.ecpay.com.tw) and confirmed live against their stage
// GetStoreList endpoint before this handler was written.
func ecpayCheckMacValue(params map[string]string, hashKey, hashIV string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, k+"="+params[k])
	}
	raw := "HashKey=" + hashKey + "&" + strings.Join(pairs, "&") + "&HashIV=" + hashIV

	encoded := phpURLEncode(raw)
	for _, rep := range ecpayEncodeReplacements {
		encoded = strings.ReplaceAll(encoded, rep.from, rep.to)
	}
	encoded = strings.ToLower(encoded)

	sum := md5.Sum([]byte(encoded))
	return strings.ToUpper(fmt.Sprintf("%x", sum))
}

// chainTypeToCvsType maps this app's pickup_chains.chain_type values to ECPay's CvsType enum.
func chainTypeToCvsType(chainType string) (string, bool) {
	switch chainType {
	case "cvs_711":
		return "UNIMART", true
	case "cvs_familymart":
		return "FAMI", true
	default:
		return "", false
	}
}

type ecpayStoreInfo struct {
	StoreID    string `json:"StoreId"`
	StoreName  string `json:"StoreName"`
	StoreAddr  string `json:"StoreAddr"`
	StorePhone string `json:"StorePhone"`
}

type ecpayStoreListResponse struct {
	RtnCode   int    `json:"RtnCode"`
	RtnMsg    string `json:"RtnMsg"`
	StoreList []struct {
		CvsType   string           `json:"CvsType"`
		StoreInfo []ecpayStoreInfo `json:"StoreInfo"`
	} `json:"StoreList"`
}

// fetchStoreList calls ECPay's GetStoreList for one chain and returns its raw store records.
func (h *CvsStoreHandler) fetchStoreList(cvsType string) ([]ecpayStoreInfo, error) {
	mac := ecpayCheckMacValue(map[string]string{
		"MerchantID": h.MerchantID,
		"CvsType":    cvsType,
	}, h.HashKey, h.HashIV)

	form := url.Values{}
	form.Set("MerchantID", h.MerchantID)
	form.Set("CvsType", cvsType)
	form.Set("CheckMacValue", mac)

	req, err := http.NewRequest(http.MethodPost, h.BaseURL+"/Helper/GetStoreList", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var parsed ecpayStoreListResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("unexpected ECPay response: %s", string(body))
	}
	if parsed.RtnCode != 1 {
		return nil, fmt.Errorf("ECPay GetStoreList error: %s", parsed.RtnMsg)
	}

	var stores []ecpayStoreInfo
	for _, chain := range parsed.StoreList {
		stores = append(stores, chain.StoreInfo...)
	}
	return stores, nil
}

// refreshChain re-fetches one chain's store list from ECPay and replaces the cached rows.
func (h *CvsStoreHandler) refreshChain(ctx context.Context, chainType string) error {
	cvsType, ok := chainTypeToCvsType(chainType)
	if !ok {
		return fmt.Errorf("unsupported chain_type: %s", chainType)
	}
	stores, err := h.fetchStoreList(cvsType)
	if err != nil {
		return err
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM cvs_stores WHERE chain_type=$1`, chainType); err != nil {
		return err
	}
	for _, s := range stores {
		if _, err := tx.Exec(ctx, `
			INSERT INTO cvs_stores (chain_type, store_code, store_name, store_addr, store_phone, updated_at)
			VALUES ($1,$2,$3,$4,$5, now())
			ON CONFLICT (chain_type, store_code) DO UPDATE SET
				store_name=EXCLUDED.store_name, store_addr=EXCLUDED.store_addr,
				store_phone=EXCLUDED.store_phone, updated_at=now()`,
			chainType, s.StoreID, s.StoreName, s.StoreAddr, s.StorePhone); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// ValidateStoreCode checks whether a typed store code exists for the given chain, refreshing
// the local cache first if it's missing or more than 24h stale. If ECPay logistics credentials
// aren't configured, responds {"configured": false} so the frontend can silently skip the
// check rather than show a false "not found" error.
func (h *CvsStoreHandler) ValidateStoreCode(w http.ResponseWriter, r *http.Request) {
	if !h.configured() {
		respondJSON(w, http.StatusOK, map[string]any{"configured": false})
		return
	}
	chainType := r.URL.Query().Get("chain_type")
	code := r.URL.Query().Get("code")
	cvsType, ok := chainTypeToCvsType(chainType)
	if !ok || code == "" {
		respondError(w, http.StatusBadRequest, "chain_type and code are required")
		return
	}
	_ = cvsType

	ctx := r.Context()
	var lastUpdated *time.Time
	h.DB.QueryRow(ctx, `SELECT MAX(updated_at) FROM cvs_stores WHERE chain_type=$1`, chainType).Scan(&lastUpdated)
	if lastUpdated == nil || time.Since(*lastUpdated) > 24*time.Hour {
		if err := h.refreshChain(ctx, chainType); err != nil {
			// Serve whatever's cached (possibly empty/stale) rather than fail the request outright -
			// a transient ECPay/network hiccup shouldn't block order entry over a soft validation check.
			if lastUpdated == nil {
				respondJSON(w, http.StatusOK, map[string]any{"configured": true, "exists": nil, "error": err.Error()})
				return
			}
		}
	}

	var storeName string
	err := h.DB.QueryRow(ctx, `SELECT store_name FROM cvs_stores WHERE chain_type=$1 AND store_code=$2`, chainType, code).Scan(&storeName)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]any{"configured": true, "exists": false})
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"configured": true, "exists": true, "store_name": storeName})
}
