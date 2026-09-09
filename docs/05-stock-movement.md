# Module 5: Stock Movement & Picking

## Overview
Modul inti yang mengeksekusi seluruh perubahan bucket stock berdasarkan trigger dari Checkout (Modul 3) dan perubahan status Order (Modul 4). Juga mencakup proses fisik picking di gudang.

## Referensi Utama
Semua aturan movement mengacu ke `00-stock-movement-table.md` — dokumen ini fokus ke implementasi teknis & proses picking.

## Data Model
```
StockMovementLog (sama dengan Modul 2, direferensikan di sini)
- id, variant_id, order_id (nullable), bucket_from, bucket_to, qty, user_id, event_type, created_at

PickingTask (opsional, jika picking perlu tracking terpisah dari status order)
- id, order_id, assigned_to (user_id), status (pending/in_progress/done), started_at, completed_at
```

## Business Rules
- Semua movement WAJIB dieksekusi dalam **satu database transaction** (atomic) — tidak boleh ada partial update yang membuat total_stock inconsistent.
- Setiap movement mencatat `event_type` (checkout_start, checkout_expired, order_created, order_delivered, order_cancelled, order_returned, manual_adjustment) agar mudah di-audit dan di-reporting.
- Picking dilakukan di status **Picking** — tidak ada perubahan bucket tambahan di titik ini (stock sudah di `order_stock` sejak Pending), picking murni proses fisik ambil barang di gudang yang di-track untuk kepastian operasional.

## Key API Endpoints
- `GET /stock-movements` (filter by variant/order/date/event_type — untuk audit & reporting)
- `POST /picking-tasks` (assign picker ke order, jika dibutuhkan tracking terpisah)
- `PATCH /picking-tasks/:id/complete`

## Edge Cases
- Order dibatalkan tepat saat picking sedang berjalan — perlu notifikasi ke picker agar berhenti proses fisik
- Movement log volume besar dalam jangka panjang — pertimbangkan indexing di kolom variant_id, order_id, created_at untuk performa query reporting

## Open Questions
1. Apakah proses Picking perlu tracking granular (siapa picker, berapa lama), atau cukup update status Order saja tanpa sub-modul PickingTask terpisah?
2. Notifikasi real-time (misal WebSocket/polling) diperlukan untuk tim gudang saat ada order baru masuk status Picking?

## Acceptance Criteria
- [ ] Semua event stock movement tercatat lengkap dan bisa di-trace per SKU/order
- [ ] Tidak ada race condition yang menyebabkan stock minus atau inconsistent (tested dengan concurrent transaction)
- [ ] `total_stock` selalu sinkron dengan formula setelah event apapun
