# Module 8: Google Sheets Sync

## Overview
Sinkronisasi data order ke Google Sheets untuk keperluan reporting management.

## Business Rules
- Autentikasi via Google Service Account (bukan OAuth user, agar sync bisa jalan otomatis tanpa login manual)
- Trigger sync: **perlu dikonfirmasi ke klien** — real-time per transaksi (via webhook/event) atau scheduled/batch (misal tiap 15 menit atau harian)
- Data yang di-sync minimal setara dengan data export (Modul 7): order, item, status, customer, attribution

## Data Model
```
SyncLog
- id, sync_type (order_created/status_update/scheduled_batch), status (success/failed), error_message (nullable), synced_at
```

## Business Rules — Error Handling
- Jika sync gagal (misal API rate limit, koneksi terputus), catat di `SyncLog` dan retry otomatis (misal exponential backoff, max 3x percobaan)
- Sediakan endpoint/tombol manual "Re-sync" untuk Super User jika retry otomatis tetap gagal

## Key API Endpoints
- `POST /internal/sync-to-sheets` (trigger manual)
- `GET /sync-logs` (untuk troubleshooting)

## Open Questions
1. Real-time atau batch? Ini menentukan arsitektur (event-driven vs cron job)
2. Struktur kolom di Google Sheets — apakah sudah ada template dari sistem existing yang harus diikuti?
3. Apakah semua perubahan status ikut ter-sync, atau hanya snapshot final (misal saat Delivered saja)?

## Acceptance Criteria
- [ ] Data order tersinkron akurat ke Google Sheets sesuai trigger yang disepakati
- [ ] Kegagalan sync tercatat dan bisa di-retry tanpa kehilangan data
