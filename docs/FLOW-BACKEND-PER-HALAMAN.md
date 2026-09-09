# Flow Backend per Halaman (Fitur Real, Bukan Mock)

Dokumen ini menjelaskan **apa yang terjadi di backend** setiap kali sebuah halaman frontend
dibuka atau sebuah aksi ditekan — khusus untuk halaman yang datanya **nyata** (terhubung ke
database), bukan halaman mock/placeholder (Chat, Returns, Notifikasi, Audit Log, Reports, Store
Management, Product Analytics, dll — halaman-halaman itu murni tampilan statis tanpa panggilan
API sama sekali, jadi tidak dibahas di sini).

Untuk penjelasan detail per file Go, struktur tabel, dan rumus lengkap, lihat
[`backend/README.md`](../backend/README.md). Dokumen ini fokus ke **alur per halaman**, jadi
lebih cocok dibaca sambil membuka frontend-nya.

Semua request dari frontend melewati jalur yang sama sebelum sampai ke handler:

```
Frontend (axios, api/client.js)
  → menyisipkan header "Authorization: Bearer <token>" dari localStorage
  → Backend: cors → middleware.JWTAuth (validasi token) → middleware.RequireRole (cek role)
  → Handler (query ke Postgres via pgx) → respondJSON
```

Kalau token tidak valid/kedaluwarsa, backend balas `401` dan `api/client.js` otomatis
menghapus token lalu redirect ke `/login`.

---

## 1. Login (`/login`)

**Komponen:** `Login.jsx` → `AuthContext.login()` → `POST /api/auth/login`

Alur backend (`AuthHandler.Login`, di `internal/handlers/auth.go`):
1. Terima `{email, password}`.
2. `JOIN users → roles` berdasarkan email untuk ambil `password_hash` dan nama role.
3. Cek `is_active` — kalau akun nonaktif, ditolak dengan pesan "account is inactive".
4. Cocokkan password dengan `bcrypt.CompareHashAndPassword`.
5. Kalau cocok, buat JWT (`auth.GenerateToken`) berisi `user_id`, `name`, `email`, `role`,
   berlaku 24 jam, dan dikirim balik bersama data user.
6. Frontend menyimpan token + user di `localStorage`, lalu semua request berikutnya otomatis
   membawa token ini.

Tidak ada refresh token — kalau token habis masa berlaku, user tinggal login ulang.

---

## 2. Dashboard (`/dashboard`)

**Komponen:** `Dashboard.jsx` — memanggil **6 endpoint sekaligus** setiap kali rentang tanggal
(hari ini/7 hari/30 hari/custom) berubah:

| Panggilan | Endpoint | Fungsi di backend |
|---|---|---|
| Grafik penjualan per host per hari | `GET /dashboard/graph` | `DashboardHandler.Graph` |
| Ranking host | `GET /dashboard/host-ranking` | `DashboardHandler.HostRanking` |
| Produk terlaris | `GET /dashboard/top-products` | `DashboardHandler.TopProducts` |
| Kartu ringkasan (Potensial/Deal/Loss, jumlah order per status) | `GET /dashboard/summary` | `DashboardHandler.Summary` |
| Waterfall Gross → Net Profit | `GET /dashboard/profit` | `DashboardHandler.Profit` |
| Panel notifikasi/alert | `GET /dashboard/alerts` | `DashboardHandler.Alerts` |
| Dropdown filter host | `GET /hosts` | `HostHandler.List` |

Semua endpoint di atas menerima `?from=YYYY-MM-DD&to=YYYY-MM-DD` (dibaca lewat helper
`dateRange()`). Yang perlu dipahami:

- **`Summary`** — hitung jumlah order dan omzet per status (`pending`, `confirm`, ...,
  `delivered`, `cancelled`, `return`). Omzet dihitung dengan `LATERAL JOIN` supaya
  `discount_amount`/`additional_amount` (yang levelnya per-order) tidak ikut terkalikan
  berkali-kali saat di-join dengan banyak baris `order_items`.
- **`Graph`** & **`HostRanking`** & **`TopProducts`** — agregasi `SUM(qty)`/`SUM(qty*harga)`
  dikelompokkan per hari/host/produk, dengan order `cancelled` dan `return` **selalu
  dikecualikan** karena dianggap bukan penjualan yang jadi.
- **`Profit`** — hitung waterfall Gross Sales → Net Profit (rumus lengkap di bagian **Profit
  Analytics** di bawah). Sebagian angkanya nyata (diambil dari order), sebagian lagi asumsi
  biaya yang diatur di halaman Pengaturan.
- **`Alerts`** — 4 angka:
  - jumlah varian stok menipis (`available_stock <= minimum_stock`, current state, tidak
    terikat rentang tanggal),
  - jumlah order yang belum dikirim (status `confirm`/`packing`/`picking`),
  - daftar produk yang penjualannya turun dibanding periode sebelumnya (dibandingkan dengan
    periode dengan panjang yang sama persis sebelum rentang yang dipilih),
  - jumlah order `delivered` dalam rentang tanggal.

Tile "Visitors" dan "Conversion Rate" di halaman ini **sengaja hardcode di frontend** (diberi
label "(mock)") karena tidak ada sumber data tracking pengunjung — bukan bug, memang belum ada
datanya.

---

## 3. Order — Daftar Order (`/orders`)

**Komponen:** `Orders.jsx` → `GET /orders` (`OrderHandler.List`), plus `GET /hosts`,
`GET /shipping-couriers`, `GET /products` untuk isi dropdown filter, dan `GET /dashboard/summary`
untuk kartu ringkasan di atas tabel.

Alur `OrderHandler.List`:
1. Query dibangun **secara dinamis** — setiap filter yang diisi (status, tanggal, host, kategori
   produk, kurir, kata kunci nama/telepon pelanggan) ditambahkan sebagai klausa `AND` lewat
   helper `addArg()` yang otomatis menomori placeholder `$1, $2, ...`.
2. Kalau yang login adalah role `sales`, otomatis ditambah filter `sales_id = <user login>` —
   sales hanya bisa lihat order yang dia buat sendiri sendiri; role lain lihat semua.
3. Total dan quantity per order dihitung dengan `SUM(qty*harga) - diskon + tambahan`,
   di-`GROUP BY` per order.
4. Hasil dipaginasi (`LIMIT`/`OFFSET`), dan query `COUNT(*)` terpisah dijalankan untuk total
   halaman.

**Aksi di halaman ini yang memanggil backend:**
- **Terima/Tolak order** (tombol muncul untuk order `pending`) → `PATCH
  /orders/:id/status` dengan `status=confirm` atau `status=cancelled`.
- **Cetak Invoice (bulk)** → tidak memanggil endpoint baru, hanya membuka route
  `/orders/print/invoice?ids=...` yang lalu memanggil `GET /orders/:id` untuk tiap order
  (dibahas di bagian **Cetak Dokumen Order** di bawah).

---

## 4. Order — Buat Order Baru (`/orders/new`)

**Komponen:** `OrderCreate.jsx` → `GET /hosts`, `GET /shipping-couriers`, `GET /products` untuk
mengisi pilihan host/kurir/produk-varian, lalu `POST /orders` (`OrderHandler.Create`) saat
form disubmit.

Alur `OrderHandler.Create`, semuanya dalam **satu database transaction**:
1. **Resolusi pembeli** — kalau memilih pelanggan existing pakai `customer.id`; kalau input
   manual (nama+telepon baru), backend insert baris baru ke `customers`.
2. Insert baris `orders` dengan status awal `pending`, nomor order dibuat otomatis
   (`ORD-<unix_timestamp>-<random 4 digit>`), plus `discount_amount`/`additional_amount` dari
   form (dua field ini yang bikin **Total** di form berubah live saat diisi — dihitung ulang di
   frontend, lalu dikirim apa adanya ke backend).
3. Catat baris pertama `order_status_log` (`NULL → pending`).
4. **Per baris item** (host + produk + varian + qty):
   - `SELECT ... FOR UPDATE` ke `stock_buckets` varian tersebut — mengunci baris supaya order
     lain yang menyasar varian sama tidak bisa jalan bersamaan (mencegah race condition
     overselling).
   - Kalau `available_stock` kurang dari qty yang diminta → gagal dengan error `409 Conflict`,
     seluruh transaksi di-rollback (tidak ada order setengah jadi).
   - Kalau cukup: stok dipindah `available_stock → order_stock` sejumlah qty, harga varian saat
     itu **disnapshot** ke `order_items.price_at_order` (supaya histori order tidak berubah
     kalau harga produk diedit belakangan), dan dicatat satu baris audit di `stock_movements`
     (`event_type = order_created`).
5. Kalau semua baris sukses → `COMMIT`. Kalau ada satu saja yang gagal → seluruh transaksi batal,
   termasuk pelanggan baru yang sempat dibuat di langkah 1.

---

## 5. Order — Detail Order (`/orders/:id`)

**Komponen:** `OrderDetail.jsx` → `GET /orders/:id` (`OrderHandler.Detail`) saat halaman dibuka,
lalu `PATCH /orders/:id/status` (`OrderHandler.UpdateStatus`) tiap kali tombol status ditekan.

`Detail` mengembalikan 3 kelompok data lewat 3 query terpisah: data order (customer, alamat,
kurir, diskon/tambahan), daftar item (join ke produk+varian+host, plus foto pertama produk), dan
riwayat status (`order_status_log`, di-join ke `users` untuk nama yang mengubah).

**Ubah status** — tombol yang muncul mengikuti tabel transisi yang valid di backend:

```
pending → confirm → packing → picking → shipped → delivered → return
   ↓          ↓          ↓          ↓          ↓
cancelled  cancelled  cancelled  cancelled  cancelled
```

(Untuk order `pending`, tombolnya diberi label khusus "Terima Order"/"Tolak Order" di frontend,
tapi secara teknis tetap request yang sama: transisi ke `confirm` atau `cancelled`.)

Setiap transisi memindahkan stok secara berbeda, semua dalam satu transaction bareng update
status + insert log:
- **`delivered`** → `order_stock` dikurangi (penjualan final; `available_stock` sudah berkurang
  sejak order dibuat, jadi total stok tidak berubah lagi di sini).
- **`cancelled`** → `order_stock` dikurangi, `available_stock` ditambah kembali (stok kembali
  bisa dijual).
- **`return`** → `broken_stock` ditambah; kalau sebelumnya sudah `delivered`, `order_stock`
  memang sudah 0 jadi cuma `broken_stock` yang berubah, kalau belum `delivered` maka
  `order_stock` ikut dikurangi juga.

`cancelled`/`return` **wajib** mengisi alasan (`reason`) — kalau kosong, backend menolak dengan
400.

### Cetak Dokumen Order (Invoice / Label / Packing Slip)

**Komponen:** `OrderPrint.jsx`, route `/orders/:id/print/:type` (satu order) atau
`/orders/print/:type?ids=1,2,3` (bulk dari halaman daftar order).

Tidak ada endpoint backend baru — halaman ini murni memanggil `GET /orders/:id` yang sama
seperti halaman detail (dipanggil berkali-kali untuk mode bulk), lalu merender datanya ke layout
khusus cetak dan memanggil `window.print()` bawaan browser. Jadi datanya selalu nyata/terbaru,
hanya tampilannya yang beda dari halaman detail biasa.

---

## 6. Produk — Daftar Produk (`/products`)

**Komponen:** `Products.jsx` → `GET /products` (`ProductHandler.List`).

`List` menjalankan **4 query terpisah** (produk, foto, varian+stok, unit terjual) lalu
menggabungkannya di Go pakai map `productID → index`, supaya tidak terjadi perkalian baris kalau
langsung di-`JOIN` semua sekaligus (satu produk bisa punya banyak foto *dan* banyak varian
sekaligus). Dua hal dihitung on-the-fly (tidak disimpan di tabel):
- **`total_stock`** = `available_stock + reserve_stock + broken_stock` per varian.
- **`status_label`** per produk: `out_of_stock` kalau total available 0, `low_stock` kalau
  available ≤ minimum_stock, kalau tidak ya `active`/`nonaktif` mengikuti `is_active`.

**Aksi bulk di halaman ini** (semua **loop di frontend** memanggil endpoint single berkali-kali
lewat `Promise.allSettled`, bukan endpoint bulk khusus di backend):
- **Update Harga massal** → loop `PATCH /products/:id/variants/:variantId` per varian terpilih.
- **Ubah Kategori massal** → loop `PATCH /products/:id` per produk terpilih.
- **Set stok tersedia massal** → loop `PATCH /products/:id/variants/:variantId`.
- **Aktif/Nonaktifkan massal** → loop `PATCH /products/:id`.
- **Hapus massal** → loop `DELETE /products/:id` (`ProductHandler.Delete` menolak dengan `409`
  kalau produk itu pernah dipakai di order — solusinya nonaktifkan saja, bukan dihapus).
- **Export CSV** → murni di frontend (`Papa.unparse` dari data yang sudah ada di state),
  tidak memanggil backend sama sekali.
- **Import CSV** → parse file di frontend (`Papa.parse`), lalu loop `POST /products` per baris.

---

## 7. Produk — Tambah/Edit Produk (`/products/new`, `/products/:id/edit`)

**Komponen:** `ProductForm.jsx`.

- **Mode edit**: `GET /products/:id` (`ProductHandler.Detail`) untuk load data awal.
- **Simpan produk baru**: `POST /products` (`ProductHandler.Create`) — dalam satu transaction:
  insert baris `products`, insert sampai 5 baris `product_images`, lalu insert tiap varian
  (`insertVariant`, sekaligus membuat baris `stock_buckets` untuk varian itu).
- **Simpan edit produk**: `PATCH /products/:id` (`ProductHandler.Update`) — **hanya** mengubah
  field produk itu sendiri (nama, deskripsi, kategori, brand, aktif/nonaktif). Field stok dan
  foto sengaja **tidak** bisa diubah lewat endpoint ini.
- **Tambah varian ke produk yang sudah ada**: `POST /products/:id/variants`
  (`ProductHandler.CreateVariant`).
- **Edit varian (harga, SKU, warna/ukuran, dan semua bucket stok kecuali total)**: `PATCH
  /products/:id/variants/:variantId` (`ProductHandler.UpdateVariant`) — ini satu-satunya tempat
  `available_stock`/`broken_stock`/`reserve_stock`/`incoming_stock`/`minimum_stock` bisa diubah
  manual. Backend membaca nilai lama dulu (`FOR UPDATE`), lalu untuk tiap bucket yang berubah
  dicatat satu baris audit ke `stock_movements` (`event_type = stock_adjustment`) lewat helper
  `logAdjustment` — **hanya kalau nilainya benar-benar berubah**, supaya log tidak penuh entri
  kosong.
- **Upload foto**: `POST /uploads/image` (multipart, divalidasi tipe file jpeg/png/webp dan
  maksimal 5MB, disimpan ke folder `uploads/`, mengembalikan URL) diikuti `POST
  /products/:id/images` untuk mendaftarkan URL itu sebagai foto produk (maksimal 5 foto,
  ditegakkan di backend).
- **Hapus foto**: `DELETE /products/:id/images/:imageId`.
- **Auto-SKU**: tombol "Auto" murni logika frontend (gabungan inisial nama produk + 3 huruf
  warna + ukuran), tidak memanggil backend.

---

## 8. Inventory (`/inventory`)

**Komponen:** `Inventory.jsx` → `GET /products` (endpoint yang sama dengan halaman Produk, tidak
ada endpoint khusus inventory) untuk menampilkan semua varian dari semua produk dalam satu
tabel, lalu `PATCH /products/:id/variants/:variantId` (`ProductHandler.UpdateVariant`) untuk
edit langsung di tabel (available/reserve/broken/incoming/minimum stock).

Baris dengan `available_stock <= minimum_stock` (dan `minimum_stock > 0`) di-highlight di
frontend — logikanya sama persis dengan yang dipakai `Alerts` di Dashboard, tapi dihitung ulang
di sisi frontend dari data yang sama, bukan panggilan endpoint alert.

---

## 9. CRM / Customer Management (`/customers`)

**Komponen:** `Customers.jsx` → `GET /customers/stats` (`CustomerHandler.Stats`), dan saat klik
satu pelanggan untuk lihat riwayat order-nya → `GET /orders?q=<nomor telepon>` (dipakai lagi,
endpoint yang sama dengan halaman daftar order).

Alur `Stats`:
1. Query `customers LEFT JOIN LATERAL (...)` — untuk tiap pelanggan dihitung `order_count`,
   `total_spend` (pakai pola `LATERAL` yang sama seperti di Dashboard: jumlah per item dikurangi
   diskon ditambah biaya tambahan, dihitung sekali per order supaya tidak dobel), dan
   `last_order_at`. `LEFT JOIN` supaya pelanggan yang belum pernah order pun tetap muncul (dengan
   angka nol).
2. Tiap baris lalu diberi label **segmen** lewat `segmentFor()`, urutan pengecekan:
   - `order_count == 0` → **Inactive**
   - order terakhir lebih dari 90 hari lalu → **Inactive** (walau dulu belanja besar)
   - total belanja ≥ Rp10.000.000 atau jumlah order ≥ 20 → **VIP**
   - total belanja ≥ Rp3.000.000 → **High Value**
   - jumlah order ≥ 2 → **Returning**
   - sisanya → **New**

Segmen ini **tidak disimpan** di kolom database manapun — dihitung ulang setiap request, supaya
threshold-nya bisa diubah kapan saja tanpa migrasi database.

---

## 10. Profit Analytics (`/profit`)

**Komponen:** `Profit.jsx` → `GET /dashboard/profit` — endpoint dan handler **persis sama**
dengan yang dipakai kartu waterfall di Dashboard (`DashboardHandler.Profit`); halaman ini cuma
menyajikannya lebih detail/besar.

Rumus lengkap yang dihitung backend:

```
Gross Sales     = SUM(qty x harga saat order)         → nyata, order 'cancelled' dikecualikan
- Diskon        = SUM(orders.discount_amount)         → nyata
+ Tambahan      = SUM(orders.additional_amount)       → nyata
= Net Sales
- Biaya Platform  = Gross Sales x platform_fee_pct%    → asumsi, diatur di Pengaturan
- Biaya Payment   = Gross Sales x payment_fee_pct%     → asumsi, diatur di Pengaturan
- Subsidi Ongkir  = shipping_subsidy_flat x jumlah order → asumsi, diatur di Pengaturan
- Biaya Iklan     = ad_cost_flat x jumlah order          → asumsi, diatur di Pengaturan
- Refund        = SUM(qty x harga) untuk order status 'return'  → nyata
- HPP (COGS)    = SUM(qty x cost_price varian)         → nyata (perlu cost_price diisi per varian)
= Net Profit
Margin %        = Net Profit / Gross Sales x 100
```

Empat baris "asumsi" itu ada karena aplikasi ini tidak terhubung ke payment gateway atau
platform ads sungguhan — angkanya diambil dari `app_settings` (diisi manual lewat Pengaturan →
Asumsi Biaya), sisanya murni hasil agregat nyata dari tabel `orders`/`order_items`/
`product_variants`.

---

## 11. Pengaturan (`/settings`)

**Komponen:** `Settings.jsx`, tiga kartu terpisah:

**a. Host Live**
- `GET /hosts?include_inactive=true` (`HostHandler.List`) — tampilkan semua termasuk yang
  nonaktif.
- Tambah → `POST /hosts`. Edit → `PATCH /hosts/:id`.
- Hapus (single/multi-select) → loop `DELETE /hosts/:id`. `HostHandler.Delete` akan menolak
  dengan `409` kalau host itu pernah dipakai di suatu order (dideteksi dari error foreign-key
  Postgres) — pesan errornya menyarankan nonaktifkan saja, bukan dihapus.

**b. Kurir Pengiriman** — pola identik dengan Host Live, lewat `GET/POST/PATCH/DELETE
/shipping-couriers` (`ShippingCourierHandler`).

**c. Asumsi Biaya (Fee Settings)**
- `GET /settings/fees` (`FeeSettingsHandler.Get`) — baca 4 angka dari tabel `app_settings`
  (`platform_fee_pct`, `payment_fee_pct`, `shipping_subsidy_flat`, `ad_cost_flat`).
- Simpan → `PATCH /settings/fees` (`FeeSettingsHandler.Update`) — tiap key di-`UPSERT`
  (`INSERT ... ON CONFLICT DO UPDATE`) ke `app_settings`. Angka baru ini langsung dipakai oleh
  halaman Dashboard dan Profit Analytics lain kali mereka memanggil `/dashboard/profit`, karena
  keduanya membaca sumber yang sama lewat helper `loadFeeSettings()`.

Hanya role `super_user`/`management` yang bisa melakukan aksi tulis (create/update/delete) di
ketiga kartu ini — dicegah di level backend lewat middleware `RequireRole`, bukan cuma
disembunyikan di frontend.

---

## 12. Halaman "semi-real" (baca data asli, tapi read-only)

Dua halaman ini bukan mock murni — datanya asli dari backend — tapi belum ada aksi tulis:

- **Categories (`/categories`)** — `GET /products` (endpoint yang sama lagi), lalu di frontend
  dikelompokkan jadi daftar kategori unik beserta jumlah produknya. Tidak ada tabel `categories`
  sendiri di database; kategori memang cuma teks bebas di kolom `products.category`.
- **Fees (`/finance/fees`)** — `GET /settings/fees`, ditampilkan read-only dengan link ke
  halaman Pengaturan untuk benar-benar mengeditnya (supaya konfigurasi biaya hanya punya satu
  tempat edit resmi).

---

## Ringkasan: endpoint mana dipakai halaman mana

| Endpoint | Handler | Dipakai di halaman |
|---|---|---|
| `POST /auth/login` | `AuthHandler.Login` | Login |
| `GET /dashboard/summary` | `DashboardHandler.Summary` | Dashboard, Orders |
| `GET /dashboard/graph` | `DashboardHandler.Graph` | Dashboard |
| `GET /dashboard/host-ranking` | `DashboardHandler.HostRanking` | Dashboard |
| `GET /dashboard/top-products` | `DashboardHandler.TopProducts` | Dashboard |
| `GET /dashboard/profit` | `DashboardHandler.Profit` | Dashboard, Profit Analytics |
| `GET /dashboard/alerts` | `DashboardHandler.Alerts` | Dashboard |
| `GET/POST /orders`, `GET /orders/:id`, `PATCH /orders/:id/status` | `OrderHandler.*` | Orders, Order Baru, Order Detail, Order Print, Customers (riwayat) |
| `GET/POST/PATCH/DELETE /products...`, `/products/:id/variants...`, `/products/:id/images...` | `ProductHandler.*`, `ProductImageHandler.*` | Products, Product Form, Inventory, Categories, Order Baru (pilih produk) |
| `POST /uploads/image` | `UploadHandler.UploadImage` | Product Form |
| `GET/POST/PATCH/DELETE /hosts` | `HostHandler.*` | Settings, Dashboard (filter), Orders (filter), Order Baru |
| `GET/POST/PATCH/DELETE /shipping-couriers` | `ShippingCourierHandler.*` | Settings, Orders (filter), Order Baru |
| `GET/POST /customers`, `GET /customers/stats` | `CustomerHandler.*` | Customers (CRM), Order Baru (cari/buat pelanggan) |
| `GET/PATCH /settings/fees` | `FeeSettingsHandler.*` | Settings, Fees (read-only), dipakai tak langsung oleh Dashboard/Profit |

Halaman-halaman di luar tabel ini (Chat, Returns, Roles & Team, Notifications, Integrations,
Audit Log, Reports, Sales Analytics detail, Product Analytics, Store Profile/Design, dan
modul-modul Marketing/Finance lain seperti Promotions/Campaigns/Advertising/Transactions/
Payouts/Warehouses/Shipping/Refunds/Reviews) **tidak memanggil backend sama sekali** — semua
datanya statis/hardcode di komponen React masing-masing, sesuai permintaan awal untuk
"mock aja".
