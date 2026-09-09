# Module 6: Customer Database & Customer Portal

## Overview
Dua sisi: (1) data master customer yang dikelola internal CS/Sales, (2) portal terpisah untuk customer self-service tracking order.

## Data Model
```
Customer (master data, dikelola internal)
- id, name, phone, address, created_at, created_by (sales_id)

CustomerAccount (portal login — lihat juga Modul 1)
- id, customer_id, email/phone, password_hash, created_at
```

## Business Rules — Internal
- Search customer by nama ATAU nomor telepon (quick search/autocomplete di cart/checkout)
- Satu Customer bisa punya banyak Order (riwayat order tampil di detail customer)
- Duplikasi data (nomor telp sama, nama beda) — perlu validasi/warning saat input baru

## Business Rules — Customer Portal
- Registrasi mandiri oleh customer (portal terpisah dari sistem internal)
- Login → hanya bisa lihat order & status miliknya sendiri (read-only)
- Tidak ada akses ke data customer lain, product, atau dashboard internal

## Key API Endpoints (Internal)
- `GET /customers?search=` (by nama/no. telp)
- `POST /customers`
- `GET /customers/:id/orders` (riwayat order)

## Key API Endpoints (Customer Portal — terpisah base URL/app)
- `POST /portal/register`
- `POST /portal/login`
- `GET /portal/my-orders`
- `GET /portal/my-orders/:id` (detail + status tracking)

## Open Questions
1. Saat registrasi portal, apakah customer baru otomatis ter-link ke data Customer existing (by no. telp), atau selalu buat data baru dan perlu proses merge manual oleh CS?
2. Apakah customer portal perlu notifikasi (email/SMS) tiap kali status order berubah?

## Acceptance Criteria
- [ ] Search customer internal cepat dan akurat by nama/no. telp
- [ ] Customer bisa daftar & login mandiri di portal terpisah
- [ ] Customer hanya bisa melihat order miliknya sendiri, data lain ter-isolasi penuh
