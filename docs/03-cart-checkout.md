# Module 3: Cart & Checkout (Stock Reservation Logic)

## Overview
Modul paling kritis di sistem — menangani proses dari cart, checkout page dengan stock reservation 30 menit, hingga order berhasil dibuat. Setiap item dalam satu order bisa punya host/sales attribution berbeda.

## Flow
1. Sales tambah item ke Cart (belum ada perubahan stock)
2. Sales masuk **Checkout Page** → sistem lock qty: `available_stock -qty`, `reserve_stock +qty`
3. Timer 30 menit mulai berjalan
4. **Setiap aktivitas** di checkout page (ubah qty, ubah attribution, dll) → **reset timer ke 30 menit**
5. Jika checkout **berhasil** (submit final) sebelum timer habis → Order dibuat status **Pending**, stock pindah `reserve_stock -qty → order_stock +qty`, `total_stock -qty`
6. Jika **30 menit habis tanpa aktivitas** → stock auto-release `reserve_stock -qty → available_stock +qty`, session checkout expired, user diarahkan kembali ke cart dan tidak bisa lanjut bayar

## Data Model
```
Cart
- id, sales_id, customer_id, created_at

CartItem
- id, cart_id, variant_id, qty, host_sales_id  -- attribution per item

CheckoutSession
- id, cart_id, started_at, last_activity_at, expires_at, status (active/expired/completed)

Order (dibuat saat checkout sukses — detail lengkap di Modul 4)
OrderItem
- id, order_id, variant_id, qty, price_at_order, host_sales_id
```

## Business Rules — Concurrency & Locking
- **First come first serve.** Saat user masuk Checkout Page dan sistem hendak decrement `available_stock`, gunakan **row-level lock (SELECT ... FOR UPDATE)** dalam database transaction agar 2 user tidak bisa reserve stok yang sama secara bersamaan melebihi qty tersedia.
- Jika stock tidak cukup saat proses lock, tampilkan error real-time ke user kedua ("stock tidak cukup, sudah di-reserve user lain").
- Background job (cron tiap 1 menit, misal) mengecek `CheckoutSession` yang `last_activity_at` sudah lewat 30 menit → trigger auto-release.

## Key API Endpoints
- `POST /cart/items`
- `PATCH /cart/items/:id`
- `POST /checkout/start` (mulai checkout page, trigger reserve stock)
- `PATCH /checkout/:id/activity` (reset timer)
- `POST /checkout/:id/complete` (submit final → create order)
- `GET /checkout/:id/status` (untuk polling sisa waktu timer di UI)

## Edge Cases
- User buka checkout page di 2 tab/device berbeda secara bersamaan — perlu strategi (misal: invalidate session lama saat session baru dibuat)
- Browser tertutup tiba-tiba di tengah checkout — reserve tetap jalan sampai timer habis (tidak ada cara deteksi "user menutup browser" secara pasti tanpa websocket/heartbeat)

## Open Questions
1. Apakah butuh heartbeat/websocket untuk deteksi user masih aktif di checkout page (bukan hanya berdasarkan klik/submit)?
2. Attribution host/sales per item — apakah dipilih manual per item saat checkout, atau default ke sales yang login (dengan opsi override)?

## Acceptance Criteria
- [ ] Stock ter-reserve akurat saat masuk checkout page dan ter-release akurat saat expired
- [ ] Timer 30 menit reset dengan benar setiap ada aktivitas
- [ ] Tidak ada kondisi 2 user berhasil checkout stok yang sama melebihi qty tersedia (tested dengan concurrent request)
- [ ] Attribution host/sales tersimpan benar per item, bukan per order
