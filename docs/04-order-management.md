# Module 4: Order Management

## Overview
Mengelola lifecycle order dari Pending hingga selesai (Delivered/Cancelled/Return), termasuk validasi transisi status dan audit trail.

## Order Status Flow
```
Pending → Confirm → Packing → Picking → Shipped → Delivered
```
- **Cancelled**: valid dari status manapun **sebelum** Delivered (Pending/Confirm/Packing/Picking/Shipped)
- **Return**: valid **hanya** dari status Shipped atau Delivered

Lihat `00-state-diagram.mermaid` untuk visualisasi lengkap.

## Data Model
```
Order
- id, customer_id, sales_id (pembuat), status, created_at, updated_at

OrderItem
- id, order_id, variant_id, qty, price_at_order, host_sales_id

OrderStatusLog (audit trail)
- id, order_id, status_from, status_to, changed_by (user_id), reason (nullable, wajib untuk Cancelled/Return), created_at
```

## Business Rules
- Transisi status HARUS mengikuti flow yang valid — tidak boleh loncat (misal Pending langsung ke Shipped) kecuali via Cancelled/Return sesuai aturan di atas
- Setiap perubahan status trigger stock movement sesuai `00-stock-movement-table.md`
- Cancelled & Return WAJIB diisi alasan (reason) — untuk keperluan reporting & evaluasi
- Role yang boleh update tiap status perlu difinalisasi (lihat Open Questions di Modul 1)

## Key API Endpoints
- `GET /orders` (list + filter by status/tanggal/sales)
- `GET /orders/:id`
- `PATCH /orders/:id/status` (validasi transisi + trigger stock movement, atomic transaction)
- `GET /orders/:id/status-log`

## Edge Cases
- Order dengan beberapa item dari SKU berbeda — status berlaku di level Order, bukan per item (perlu dikonfirmasi apakah klien butuh partial fulfillment per item, misal 1 item Shipped sementara item lain masih Packing)
- Cancelled/Return di order yang sudah ter-export atau ter-sync ke Google Sheets — perlu re-sync data terbaru

## Open Questions
1. Apakah status berlaku per Order (semua item barengan) atau per Item (bisa beda-beda status per item dalam 1 order)? Ini berdampak besar ke desain data model.
2. Role spesifik untuk tiap transisi status (siapa yang boleh ubah ke Packing/Picking/Shipped)?
3. Return — apakah partial return (sebagian item saja) perlu didukung, atau selalu seluruh order?

## Acceptance Criteria
- [ ] Transisi status order tervalidasi sesuai flow yang ditentukan, tidak bisa loncat status ilegal
- [ ] Cancelled hanya bisa sebelum Delivered, Return hanya dari Shipped/Delivered
- [ ] Setiap perubahan status tercatat lengkap di audit log dengan alasan untuk Cancelled/Return
- [ ] Stock movement otomatis ter-trigger dan konsisten setiap perubahan status
