# KS Shop — Seller & Shop Management (Demo/MVP)

Full-stack internal tool untuk mengelola penjualan lewat host live (TikTok/Shopee/Instagram
Live, dll): dashboard performa host, order management (order dibuat manual oleh staf), produk
& stok, dan pengaturan host/kurir (Golang + PostgreSQL + React/Vite).

## Tech Stack
- **Backend:** Go 1.22, chi router, pgx (PostgreSQL driver), JWT auth
- **Database:** PostgreSQL 16
- **Frontend:** React 18 + Vite + Tailwind (CDN) + Recharts (grafik dashboard)

## Deploy Gratis ke Internet

Mau publish project ini (frontend di Vercel, backend + database + storage foto gratis)? Ikuti
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — sudah termasuk file konfigurasi siap pakai
(`render.yaml`, `frontend/vercel.json`) dan backend sudah mendukung upload foto ke Cloudinary
supaya tidak hilang saat server restart.

## Cara Menjalankan (Docker — paling mudah)

Prasyarat: [Docker](https://www.docker.com/) & Docker Compose terinstall. Build pertama kali butuh koneksi internet (download Go modules & npm packages).

```bash
cd project
docker-compose up --build
```

Tunggu sampai semua service siap (backend akan otomatis menjalankan migration + seed data saat start), lalu buka:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8080/api
- **PostgreSQL:** localhost:5432 (user: `postgres`, password: `postgres`, db: `ordermgmt`)

Untuk stop: `Ctrl+C` lalu `docker-compose down` (tambahkan `-v` untuk reset database).

## Cara Menjalankan Manual (tanpa Docker)

**1. PostgreSQL** — jalankan Postgres lokal, buat database `ordermgmt`.

**2. Backend:**
```bash
cd backend
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/ordermgmt?sslmode=disable"
export JWT_SECRET="dev-secret-change-me"
go mod tidy
go run ./cmd/api
```
Migration & seed data akan otomatis dijalankan saat backend start pertama kali.

**3. Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Buka http://localhost:5173

## Sample Akun (Password Semua: `password123`)

Aplikasi ini khusus untuk staf internal — tidak ada lagi login/portal customer terpisah.

| Role | Email | Akses |
|---|---|---|
| Super User | superuser@demo.com | Full access, termasuk kelola produk & pengaturan |
| Management | management@demo.com | Full access, termasuk kelola produk & pengaturan |
| SPV | spv@demo.com | Order management, override cancel/return |
| Sales | sales1@demo.com / sales2@demo.com | Order (miliknya sendiri) |

## Sample Data

12 produk fashion (sepatu, atasan, outerwear, aksesoris) sudah di-seed otomatis, masing-masing
dengan 3 varian warna dan gambar (dari layanan gambar gratis LoremFlickr — butuh koneksi
internet saat browser me-load gambar). Juga tersedia 4 host live contoh (TikTok/Shopee/
Instagram) dan 5 kurir pengiriman (JNE, J&T, SiCepat, AnterAja, Kurir Toko).

## Flow yang Bisa Dicoba End-to-End

1. **Login sebagai `sales1@demo.com`**
2. Buka **Order** → **+ Buat Order Baru**
3. Cari pelanggan (contoh: "Rina" atau "Joko") atau tambahkan pelanggan baru
4. Tambahkan satu atau lebih baris produk: pilih **host live**, produk, varian/SKU, dan qty — total harga terhitung otomatis
5. Pilih kurir pengiriman & isi alamat, klik **Buat Pesanan**
6. Order akan muncul di **Order** dengan status **Pending**; buka order tersebut → gunakan tombol **Confirm → Packing → Picking → Shipped → Delivered**, atau **Cancelled/Return** (wajib isi alasan)
7. Buka **Dashboard** → pilih rentang tanggal (Hari Ini/7 Hari/30 Hari/Custom) → lihat grafik penjualan per host per hari dan ranking host (toggle qty terjual/revenue)
8. Buka **Produk** → **+ Tambah Produk** untuk menambah produk baru (gambar, varian, SKU, stok), atau klik salah satu produk untuk edit stok (available/reserve/broken — total stok otomatis terhitung)
9. Buka **Pengaturan** untuk menambah/menonaktifkan host live atau kurir pengiriman

## Simplifikasi dari Spec Asli (untuk kebutuhan demo)

- **Cart/checkout customer self-service** (dari spec awal Modul 3) dihilangkan sepenuhnya —
  order dibuat langsung oleh staf lewat form manual, tidak ada storefront publik.
- **Google Sheets sync** & **Export** (Modul 7 & 8 di spec) belum diimplementasikan.
- **promo_stock & safety_stock** dihapus dari model stok — hanya `available_stock`,
  `reserve_stock`, `broken_stock` (staf-editable) dan `order_stock` (otomatis, terkunci ke
  order yang belum selesai). `total_stock` = available + reserve + broken.
- Role granular untuk proses **Packing/Picking** disatukan ke sales/spv/super_user untuk update status — belum ada role gudang terpisah.
- Password semua sample user sama (`password123`) — untuk kebutuhan demo saja.

## Struktur Folder

```
project/
├── backend/            # Go API server
│   ├── cmd/api/         # main.go + migrations (embedded)
│   ├── internal/        # handlers, middleware, config, db, auth
│   └── Dockerfile
├── frontend/            # React + Vite internal app
│   ├── src/
│   │   ├── pages/        # Dashboard, Orders, OrderCreate, OrderDetail, Products, ProductForm, Settings, Login
│   │   ├── components/   # AppShell, DateRangePicker, StatusPill, StatTile, ImageUpload, CustomerPicker
│   │   └── context/      # AuthContext
│   └── Dockerfile
├── docs/                # Spec & plan per modul (dari sesi requirement sebelumnya)
├── docker-compose.yml
└── README.md
```

## API Reference Singkat

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | Login (staf internal) |
| GET | `/api/products` | List produk + varian + stok |
| GET | `/api/products/:id` | Detail produk |
| POST | `/api/products` | Buat produk + varian awal |
| PATCH | `/api/products/:id` | Edit data produk |
| POST | `/api/products/:id/variants` | Tambah varian |
| PATCH | `/api/products/:id/variants/:variantId` | Edit varian & stok |
| POST | `/api/uploads/image` | Upload gambar produk |
| GET | `/api/orders` | List order (filter status/tanggal/host/kategori/kurir, paginated) |
| GET | `/api/orders/:id` | Detail order + riwayat status |
| POST | `/api/orders` | Buat order manual |
| PATCH | `/api/orders/:id/status` | Update status order |
| GET | `/api/customers?q=` | Cari customer |
| GET/POST/PATCH/DELETE | `/api/hosts...` | Kelola host live |
| GET/POST/PATCH/DELETE | `/api/shipping-couriers...` | Kelola kurir pengiriman |
| GET | `/api/dashboard/summary` | Ringkasan order & stok (filter tanggal) |
| GET | `/api/dashboard/graph` | Penjualan per host per hari (qty & revenue) |
| GET | `/api/dashboard/host-ranking` | Ranking host (qty & revenue) |
