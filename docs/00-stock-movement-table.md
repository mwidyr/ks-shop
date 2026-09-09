# Stock Movement Reference Table

> Dokumen ini adalah source of truth untuk semua perubahan stock bucket.
> Semua developer WAJIB mengacu ke tabel ini saat implementasi — bukan menebak logic sendiri.

## Bucket Definition
- `available_stock` — stok siap dijual/checkout
- `reserve_stock` — stok yang sedang di-hold saat user di Checkout Page (subject to 30-menit expiry)
- `order_stock` — stok yang sudah committed jadi Order (Pending s/d sebelum Delivered/Cancelled/Return). **Counter terpisah, TIDAK masuk formula total_stock**
- `promo_stock` — alokasi khusus promo (belum ada flow checkout — OPEN QUESTION)
- `safety_stock` — buffer, tidak dijual normal
- `broken_stock` — barang rusak/reject/hasil retur

## Formula
```
total_stock = available_stock + reserve_stock + promo_stock + safety_stock + broken_stock
```
> ⚠️ **ASUMSI (perlu konfirmasi klien):** karena `order_stock` tidak ada di formula, maka saat stock pindah ke `order_stock`, `total_stock` otomatis berkurang di titik itu juga (bukan menunggu Delivered). Ini karena secara akuntansi barang dianggap sudah "committed/terjual" begitu Order dibuat.

## Movement Table

| # | Event | available_stock | reserve_stock | order_stock (di luar formula) | broken_stock | total_stock |
|---|---|---|---|---|---|---|
| 1 | User masuk Checkout Page | -qty | +qty | - | - | tetap |
| 2 | Checkout expired (30 menit tanpa aktivitas) | +qty | -qty | - | - | tetap |
| 3 | Aktivitas di checkout page (ubah qty, dll) | - | - | - | - | tetap (timer reset) |
| 4 | Checkout sukses → Order dibuat (status **Pending**) | - | -qty | +qty | - | **-qty** |
| 5 | Status Confirm → Packing → Picking → Shipped | - | - | tetap | - | tetap |
| 6 | Order **Delivered** | - | - | -qty (sale finalized) | - | tetap |
| 7 | Order **Cancelled** (valid dari Pending s/d sebelum Delivered) | +qty | - | -qty | - | **+qty** |
| 8 | Order **Return** (valid dari Shipped atau Delivered) | - | - | -qty (jika masih ada) | +qty | **+qty** |

## Open Questions ke Klien
1. Konfirmasi asumsi formula di atas — apakah benar `total_stock` berkurang saat order masuk Pending, bukan saat Delivered?
2. `promo_stock` — kapan dan bagaimana dipakai untuk checkout? Perlu flow checkout terpisah atau manual adjustment saja oleh admin?
3. Apakah butuh proses QC untuk barang di `broken_stock` hasil retur sebelum bisa dipindah manual ke `available_stock` lagi (misal ternyata barangnya masih bagus)?
4. Concurrency: locking strategy — pessimistic lock (row lock saat checkout) atau optimistic lock (versioning + retry)? Rekomendasi: pessimistic lock untuk kasus stock terbatas dengan traffic rendah (4-5 user) — lebih simpel dan aman.

## Technical Notes
- Semua perubahan bucket harus dalam **satu database transaction** (atomic) dengan stock movement log tercatat di tabel terpisah (`stock_movements`: bucket_from, bucket_to, qty, sku, order_id, user_id, timestamp).
- Background job (cron, misal tiap 1 menit) diperlukan untuk auto-expire checkout session yang lewat 30 menit tanpa aktivitas.
