# Module 2: Product Management

## Overview
Mengelola master data produk beserta variant (SKU, warna, ukuran, harga) dan enam bucket stock per SKU.

## Data Model
```
Product
- id, name, description, category, created_at

ProductVariant (SKU)
- id, product_id, sku, color, size, price, created_at

StockBucket (per SKU)
- id, variant_id
- available_stock
- reserve_stock
- order_stock        -- counter terpisah, di luar formula total_stock
- promo_stock
- safety_stock
- broken_stock
- total_stock (computed: available + reserve + promo + safety + broken)

StockMovementLog
- id, variant_id, order_id (nullable), bucket_from, bucket_to, qty, user_id, note, created_at
```

## Business Rules
- **Hanya `available_stock` yang bisa di-checkout.** `promo_stock` tidak otomatis masuk pool checkout (perlu flow terpisah — lihat Open Questions).
- `total_stock` adalah computed field, di-generate dari formula, bukan input manual — mencegah data inconsistency.
- Setiap perubahan bucket manapun WAJIB tercatat di `StockMovementLog` (lihat `00-stock-movement-table.md` untuk aturan lengkap per event).
- Adjustment manual stock (misal pindah ke `broken_stock` karena rusak saat opname) hanya bisa dilakukan role Super User/SPV, dan wajib diisi `note` alasan.

## Key API Endpoints
- `GET /products` (list + filter/search)
- `POST /products`
- `POST /products/:id/variants`
- `PATCH /variants/:id` (update harga/detail, bukan stock langsung)
- `GET /variants/:id/stock` (breakdown 6 bucket + total)
- `POST /variants/:id/stock/adjust` (manual adjustment, role terbatas, wajib note)
- `GET /variants/:id/stock/movements` (history log)

## Edge Cases
- SKU dengan `available_stock = 0` tapi masih ada di `reserve_stock`/`order_stock` — tetap tampil di listing tapi ditandai "habis" untuk checkout baru
- Race condition saat 2 user checkout SKU sama secara bersamaan → ditangani di Modul 3 (row-level locking)

## Open Questions
1. Kapan dan bagaimana `promo_stock` digunakan untuk dijual? Perlu toggle "mode promo" di checkout atau field terpisah di cart?
2. Apakah `safety_stock` pernah "dilepas" ke `available_stock` secara sistem, atau selalu manual oleh Super User?
3. Threshold notifikasi low-stock — perlu alert kah kalau `available_stock` di bawah angka tertentu?

## Acceptance Criteria
- [ ] CRUD product & variant berjalan dengan validasi SKU unik
- [ ] Stock breakdown 6 bucket tampil akurat dan `total_stock` selalu konsisten dengan formula
- [ ] Setiap perubahan stock (via checkout, order, adjustment) tercatat lengkap di movement log
- [ ] Search/filter product berjalan cepat untuk katalog dengan variant banyak
