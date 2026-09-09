# Module 7: Export Module

## Overview
Export data order untuk keperluan proses pengiriman (misal dikirim ke kurir/tim logistik).

## Business Rules
- Export format: Excel (.xlsx) dan/atau CSV/PDF — perlu dikonfirmasi format mana yang dipakai tim pengiriman
- Filter export: by tanggal, status order, sales/host — agar tidak export seluruh data tiap kali
- Data yang di-export minimal: no. order, nama customer, alamat, no. telp, daftar item + qty, status, sales attribution

## Key API Endpoints
- `GET /export/orders?format=xlsx&status=&date_from=&date_to=`

## Open Questions
1. Format export spesifik apa yang dipakai tim pengiriman saat ini (di sistem existing)? Sebaiknya samakan formatnya agar tidak perlu training ulang.
2. Apakah export perlu template khusus (logo perusahaan, kolom tertentu) atau generic table saja?
3. Export sekali jalan (manual trigger) atau perlu terjadwal otomatis (misal tiap pagi export order status Confirm)?

## Acceptance Criteria
- [ ] Export menghasilkan file sesuai format yang disepakati dan data akurat sesuai filter
- [ ] Export bisa handle volume order harian tanpa timeout
