# Module 1: Authentication & Role Management

## Overview
Modul autentikasi dan pengelolaan akses untuk dua populasi user yang berbeda: (1) internal team (CS/Sales/SPV/Management/Super User) yang mengoperasikan sistem order management, dan (2) Customer yang punya portal terpisah untuk tracking order mereka sendiri.

## Roles & Permission Matrix (Internal System)

| Role | Product Mgmt | Customer Data | Cart/Checkout | Order Status Update | Stock Adjustment | Dashboard/Report | System Config |
|---|---|---|---|---|---|---|---|
| **Super User** | Full | Full | Full | Full (semua status) | Full | Full | Full |
| **Management** | Read | Read | - | Read only | - | Full | - |
| **SPV** | Read/Update | Full | Full | Full (termasuk override Cancel/Return) | Read + request | Full | - |
| **Sales** | Read | Full | Full (order milik sendiri) | Update status dasar (sesuai flow) | - | Read (performa sendiri saja) | - |

> Detail akses per status order (siapa boleh ubah ke Packing/Picking/Shipped, dll) perlu difinalisasi bersama klien — kemungkinan Packing/Picking dilakukan role gudang yang belum terdefinisi di list role saat ini.

## Customer Portal (Terpisah)
- Aplikasi/URL terpisah dari sistem internal
- Self-registration & login (email/no. telp + password)
- Hanya bisa lihat order & status miliknya sendiri (read-only)
- Tidak bisa akses data customer lain, product management, atau dashboard internal

## Data Model
```
User (internal)
- id, name, email, password_hash, role_id, is_active, created_at

Role
- id, name (super_user, management, spv, sales)

Permission (opsional, jika butuh granular custom permission per user)
- id, user_id, module, action (create/read/update/delete)

CustomerAccount (portal terpisah)
- id, customer_id (FK ke Customer di modul 6), email/phone, password_hash, created_at
```

## Business Rules
- Password di-hash (bcrypt/argon2), tidak pernah disimpan plain text
- Session/token expiry wajar (misal 8 jam untuk internal, lebih panjang untuk customer portal)
- Semua aksi sensitif (ubah status order, adjust stock, cancel/return) tercatat di audit log dengan user_id & timestamp

## Key API Endpoints
- `POST /auth/login` (internal)
- `POST /auth/logout`
- `POST /customer-portal/register`
- `POST /customer-portal/login`
- `GET /users` (Super User only)
- `POST /users` (create user, Super User only)
- `PATCH /users/:id/role`

## Open Questions
1. Apakah ada role khusus untuk tim gudang/picking, atau ditangani SPV/Sales juga?
2. Customer portal — perlu verifikasi email/OTP saat registrasi, atau cukup input manual?
3. Apakah Sales bisa lihat order sales lain, atau strictly hanya order attribution miliknya?

## Acceptance Criteria
- [ ] User internal bisa login sesuai role dan hanya melihat menu sesuai permission matrix
- [ ] Customer bisa daftar akun sendiri dan login di portal terpisah
- [ ] Customer hanya bisa melihat order miliknya, tidak bisa akses data lain
- [ ] Semua perubahan status order & stock tercatat di audit log dengan identitas user yang jelas
