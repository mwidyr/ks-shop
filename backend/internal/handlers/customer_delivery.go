package handlers

import (
	"regexp"
	"strings"
)

// customerDelivery is where a customer's parcels go: a CVS store (name + code, Chinese name when
// the code exists in the 3rd-party store list) or a courier address.
type customerDelivery struct {
	ChainName     string `json:"chain_name"`
	ChainType     string `json:"chain_type"`
	StoreName     string `json:"store_name"`
	StoreCode     string `json:"store_code"`
	Address       string `json:"address"`
	City          string `json:"city"`
	District      string `json:"district"`
	StoreVerified bool   `json:"store_verified"`
}

// customerLastOrder is the most recent valid order, used by the Customer Management export.
type customerLastOrder struct {
	OrderNo   string  `json:"order_no"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"created_at"`
	Total     float64 `json:"total"`
	Items     string  `json:"items"`
	ChainName string  `json:"chain_name"`
	StoreName string  `json:"store_name"`
	StoreCode string  `json:"store_code"`
	Address   string  `json:"address"`
}

// Taiwan address: city/county (…市 / …縣) optionally followed by a district/township (…區 / …鄉 / …鎮 / …市).
var twAddressRe = regexp.MustCompile(`^\s*(?:\d{3,6})?\s*([^\s市縣區鄉鎮]{1,4}[市縣])\s*([^\s市縣區鄉鎮路街道]{1,4}[區鄉鎮市])?`)

// taiwanCityFromAddress extracts the city/county and district from a Taiwan address, normalising
// 臺 to 台. Returns empty strings when the address does not start with one.
func taiwanCityFromAddress(addr string) (city, district string) {
	addr = strings.NewReplacer("臺", "台", "，", "", ",", "").Replace(addr)
	m := twAddressRe.FindStringSubmatch(addr)
	if m == nil {
		return "", ""
	}
	return m[1], m[2]
}
