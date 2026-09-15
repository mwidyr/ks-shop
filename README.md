# KS Shop — Seller & Shop Management (Demo/MVP)

Full-stack internal tool untuk mengelola penjualan lewat host live (TikTok/Shopee/Instagram
Live, dll): dashboard performa host, order management (order dibuat manual oleh staf), produk
& stok, dan pengaturan host/kurir (Golang + PostgreSQL + React/Vite).

## Tech Stack
- **Backend:** Go 1.22, chi router, pgx (PostgreSQL driver), JWT auth
- **Database:** PostgreSQL 16
- **Frontend:** React 18 + Vite + Tailwind (CDN) + Recharts (grafik dashboard)

## Deploy ke Production (VPS sendiri)

Pendekatan saat ini: satu VPS (mis. IDCloudHost) menjalankan frontend + backend + Postgres
sekaligus lewat Docker Compose, diakses lewat IP VPS langsung (tanpa domain). Panduan lengkap
langkah demi langkah ada di [`docs/DEPLOYMENT_VPS.md`](docs/DEPLOYMENT_VPS.md) — singkatnya:

```bash
# di VPS, setelah Docker terinstall & repo di-clone
cp .env.prod.example .env
nano .env   # isi POSTGRES_PASSWORD, JWT_SECRET, APP_BASE_URL
docker compose -f docker-compose.prod.yml up -d --build
```

File yang dipakai: `docker-compose.prod.yml` (stack production — hanya nginx/`web` yang
publik di port 80, `db` & `backend` tetap internal), `frontend/Dockerfile.prod` +
`frontend/nginx.conf` (build statis + reverse proxy ke backend), `.env.prod.example` (template
env var). **Ini terpisah dari `docker-compose.yml`** di bawah, yang khusus untuk development
lokal (Vite dev server, hot reload) — jangan pakai `docker-compose.yml` untuk production.

Alternatif lama (Vercel + Back4app + Neon, semua tier gratis terpisah) masih didokumentasikan di
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) kalau suatu saat ingin kembali ke opsi tanpa VPS.

## Cara Menjalankan Lokal (Docker — paling mudah)

Prasyarat: [Docker](https://www.docker.com/) & Docker Compose terinstall. Build pertama kali butuh koneksi internet (download Go modules & npm packages).

```bash
cd project
docker compose up --build
```

Tunggu sampai semua service siap (backend akan otomatis menjalankan migration + seed data saat start), lalu buka:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8080/api
- **PostgreSQL:** localhost:5432 (user: `postgres`, password: `postgres`, db: `ordermgmt`)

Untuk stop: `Ctrl+C` lalu `docker compose down` (tambahkan `-v` untuk reset database).

> Ini adalah stack **development** (`docker-compose.yml`, frontend jalan lewat Vite dev server
> dengan hot reload di port 5173) — beda dari stack production di atas.

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
├── backend/                  # Go API server
│   ├── cmd/api/               # main.go + migrations (embedded)
│   ├── internal/              # handlers, middleware, config, db, auth
│   └── Dockerfile             # dev image (go run-style build, used by docker-compose.yml)
├── frontend/                 # React + Vite internal app
│   ├── src/
│   │   ├── pages/              # Dashboard, Orders, OrderCreate, OrderDetail, Products, ProductForm, Settings, Login
│   │   ├── components/         # AppShell, DateRangePicker, StatusPill, StatTile, ImageUpload, CustomerPicker
│   │   └── context/            # AuthContext
│   ├── Dockerfile              # dev image (npm run dev, used by docker-compose.yml)
│   ├── Dockerfile.prod         # production image (static build + nginx, used by docker-compose.prod.yml)
│   └── nginx.conf              # reverse proxy config for the production image
├── docs/                     # Spec & plan per modul + deployment guides
│   ├── DEPLOYMENT_VPS.md       # current: self-hosted VPS (Docker Compose)
│   └── DEPLOYMENT.md           # old alternative: Vercel + Back4app + Neon (free tiers)
├── docker-compose.yml        # LOCAL DEV stack (Vite dev server, hot reload)
├── docker-compose.prod.yml   # PRODUCTION stack (nginx + static build, single VPS)
├── .env.prod.example         # template for docker-compose.prod.yml secrets
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
