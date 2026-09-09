# Module 9: Dashboard & Reporting

## Overview
Ringkasan visual data order & stock untuk pengambilan keputusan tim internal.

## Access Control
**Hanya bisa diakses oleh: Super User, Management, SPV, Sales.** Customer TIDAK punya akses ke modul ini (customer hanya lihat order sendiri via portal terpisah, Modul 6).

## Business Rules — Konten per Role
- **Sales**: dashboard performa order milik sendiri (jumlah order, status breakdown, attribution)
- **SPV/Management/Super User**: dashboard keseluruhan — semua sales, semua order, stock overview (breakdown 6 bucket per SKU), tren order per waktu

## Key Widgets/Reports
- Order count by status (Pending/Confirm/Packing/Picking/Shipped/Delivered/Cancelled/Return)
- Stock overview per bucket (available/reserve/order/promo/safety/broken) per SKU atau agregat kategori
- Performa per sales/host (jumlah order, total value)
- Tren order harian/mingguan/bulanan

## Key API Endpoints
- `GET /dashboard/summary` (role-aware, return data sesuai scope akses)
- `GET /dashboard/stock-overview`
- `GET /dashboard/sales-performance?sales_id=`

## Open Questions
1. Apakah dashboard ini menggantikan kebutuhan reporting di Google Sheets, atau keduanya tetap dipakai untuk keperluan berbeda (dashboard = real-time monitoring, Sheets = laporan formal)?
2. Perlu filter tanggal custom (date range picker) atau preset saja (hari ini/minggu ini/bulan ini)?

## Acceptance Criteria
- [ ] Dashboard hanya bisa diakses role yang diizinkan, Customer ter-block penuh
- [ ] Data yang ditampilkan real-time atau near-real-time (tidak stale lebih dari beberapa menit)
- [ ] Sales hanya melihat data performa miliknya sendiri, role lain melihat keseluruhan
