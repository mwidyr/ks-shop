package handlers

import "testing"

func TestExportNameUnits(t *testing.T) {
	cases := []struct {
		name string
		want int
	}{
		{"Rina Wijaya", 11}, // over the limit
		{"Tes10", 5},        // plain ASCII
		{"王小明小華", 10},       // 5 Chinese = 10 -> allowed
		{"王小明小華美", 12},      // 6 Chinese -> too long
		{"假資料98", 8},        // mixed: 3 Chinese (6) + 2 digits
		{"", 0},
	}
	for _, c := range cases {
		if got := exportNameUnits(c.name); got != c.want {
			t.Errorf("exportNameUnits(%q) = %d, want %d", c.name, got, c.want)
		}
	}
}
