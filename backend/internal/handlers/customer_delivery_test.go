package handlers

import "testing"

func TestTaiwanCityFromAddress(t *testing.T) {
	cases := []struct{ in, city, district string }{
		{"台北市中山區南京東路一段1號", "台北市", "中山區"},
		{"臺北市大安區忠孝東路", "台北市", "大安區"},
		{"新北市板橋區文化路", "新北市", "板橋區"},
		{"桃園市中壢區中正路10號", "桃園市", "中壢區"},
		{"彰化縣員林市中山路", "彰化縣", "員林市"},
		{"100台北市中正區重慶南路", "台北市", "中正區"},
		{"Jl. Merdeka 1", "", ""},
	}
	for _, c := range cases {
		city, district := taiwanCityFromAddress(c.in)
		if city != c.city || district != c.district {
			t.Errorf("%q => %q/%q, want %q/%q", c.in, city, district, c.city, c.district)
		}
	}
}
