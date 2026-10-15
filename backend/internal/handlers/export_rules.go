package handlers

import (
	"context"
	"fmt"
	"unicode"
	"unicode/utf8"
)

// Limits imposed by the logistics providers' own import files (see Export File Adjustments):
//   - recipient name: 10 English characters or 5 Chinese characters; one Chinese character counts
//     as two English ones (7-ELEVEN, FamilyMart, and HCT keeps the same 10 limit);
//   - HCT (POS home delivery) address: at most 50 characters.
const (
	exportNameMaxUnits   = 10
	exportAddressMaxChar = 50
)

// exportNameUnits is the name's length in "English character" units (CJK = 2, everything else = 1).
func exportNameUnits(s string) int {
	n := 0
	for _, r := range s {
		if unicode.Is(unicode.Han, r) || (r >= 0x3000 && r <= 0x303F) || (r >= 0xFF00 && r <= 0xFFEF) {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// validateExportFields returns a user-facing message when the customer name (all chains) or the
// delivery address (POS / courier only) would break a logistics import file; "" when fine.
func validateExportFields(ctx context.Context, db rowQuerier, chainID int, name, address string) string {
	if exportNameUnits(name) > exportNameMaxUnits {
		return fmt.Sprintf("nama pelanggan terlalu panjang untuk file logistik (maks. 10 huruf Inggris atau 5 huruf Mandarin, 1 huruf Mandarin = 2): %q", name)
	}
	var chainType string
	if err := db.QueryRow(ctx, `SELECT chain_type FROM pickup_chains WHERE id=$1`, chainID).Scan(&chainType); err == nil &&
		chainType == "courier" && utf8.RuneCountInString(address) > exportAddressMaxChar {
		return "alamat POS terlalu panjang untuk file logistik (maks. 50 karakter Mandarin)"
	}
	return ""
}
