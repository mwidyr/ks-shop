# Spec & Plan — Sistem Order Management Freelance Full Stack

Dokumen ini adalah index dari seluruh spesifikasi modul untuk project "Formulir Pendaftaran Freelance Full Stack Web Developer".

## Daftar File

| File | Isi |
|---|---|
| `00-state-diagram.mermaid` | Diagram state order status + stock bucket movement (visual) |
| `00-stock-movement-table.md` | Tabel referensi lengkap perubahan stock per event — **source of truth** |
| `01-auth-role-management.md` | Role: Super User, Management, SPV, Sales, Customer (portal terpisah) |
| `02-product-management.md` | Product, variant/SKU, 6 bucket stock |
| `03-cart-checkout.md` | Cart, checkout page, reservation 30 menit, concurrency locking |
| `04-order-management.md` | Order status flow, transisi valid, audit log |
| `05-stock-movement.md` | Eksekusi movement, picking process |
| `06-customer-database-portal.md` | Data customer internal + portal self-service |
| `07-export.md` | Export data order untuk pengiriman |
| `08-google-sheets-sync.md` | Sinkronisasi ke Google Sheets |
| `09-dashboard-reporting.md` | Dashboard (akses: Super User/Management/SPV/Sales) |
| `10-responsive-ui.md` | UI/UX desktop & mobile, internal + portal |

## Cara Pakai
1. Baca `00-state-diagram.mermaid` dan `00-stock-movement-table.md` dulu — ini fondasi seluruh business logic
2. Setiap modul punya bagian **Open Questions** — WAJIB dikonfirmasi ke klien sebelum development modul tersebut dimulai
3. **Acceptance Criteria** di tiap file dipakai sebagai checklist QA/UAT

## Prioritas Konfirmasi ke Klien (Sebelum Development)
1. Asumsi formula `total_stock` (order_stock di luar formula) — lihat `00-stock-movement-table.md`
2. Status order berlaku per-Order atau per-Item (dampak besar ke data model — lihat `04-order-management.md`)
3. Role untuk proses Packing/Picking — siapa yang bertanggung jawab
4. Trigger Google Sheets sync: real-time atau batch
5. Flow checkout untuk `promo_stock`
