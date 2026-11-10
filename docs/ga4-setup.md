# Setup Google Analytics 4 (Website Analytics, Adjust #147)

Halaman **Analysis → Website Analytics** membaca data dari GA4. Sampai tiga variabel di bawah diisi, halaman
menampilkan "Google Analytics belum terhubung" dan website tidak memuat tag apa pun.

1. **Buat properti GA4** (analytics.google.com → Admin → Create → Property) dan tambahkan *Web data stream* untuk
   domain storefront. Salin **Measurement ID** (`G-XXXXXXXXXX`) dan **Property ID** (angka, Admin → Property details).
2. **Service account**: Google Cloud Console → IAM → Service Accounts → Create → Keys → *Add key (JSON)*.
   Aktifkan *Google Analytics Data API* di project yang sama.
3. Di GA4: Admin → Property access management → tambahkan email service account (`…@…iam.gserviceaccount.com`)
   dengan peran **Viewer**.
4. Isi environment backend, lalu restart API:

   ```
   GA4_MEASUREMENT_ID=G-XXXXXXXXXX
   GA4_PROPERTY_ID=123456789
   GA4_SERVICE_ACCOUNT_JSON={"type":"service_account","client_email":"…","private_key":"…"}   # atau
   GA4_SERVICE_ACCOUNT_FILE=/path/ke/key.json
   ```

Catatan:
- Data baru ada setelah tag aktif; GA4 butuh sampai ±24 jam untuk laporan penuh.
- Kode Produk diambil dari URL `/p/{id}` dan artikel dari `/style/{slug}` (dengan atau tanpa prefix bahasa).
- Hasil di-cache 5 menit per rentang tanggal. Izin menu: tab `website_analytics` (Roles & Permissions).

## Pre-launch (production tapi belum publik)

- Set `SITE_NOINDEX=true` di `.env` production: semua halaman storefront dapat `noindex`, `/robots.txt` menjadi
  `Disallow: /` dan sitemap kosong. Saat launch: hapus / set `false`, restart backend, lalu kirim sitemap di Search Console.
- **GA4 Measurement ID, Property ID, service account**: lihat langkah di atas; di production isi `GA4_MEASUREMENT_ID`,
  `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON` (satu baris) di `.env` (sudah diteruskan oleh `docker-compose.prod.yml`).
- **Exclude traffic staff**: GA4 → Admin → Data streams → (stream) → Configure tag settings → Show all → *Define internal
  traffic* (rule dengan IP kantor), lalu Admin → Data settings → Data filters → aktifkan filter *Internal Traffic*
  (mulai dari status Testing, ubah ke Active setelah terbukti bekerja).

## Google Search Console (ralulu.com)

1. search.google.com/search-console → Add property → **URL prefix** `https://ralulu.com` (akun `ralulu.admin@gmail.com`).
2. Metode **HTML tag**: salin nilai `content` dan isi `GOOGLE_SITE_VERIFICATION=<token>` di `.env`, restart backend.
   Tag tetap dikeluarkan walau `SITE_NOINDEX=true`. Klik *Verify*.
3. Setelah launch (SITE_NOINDEX dimatikan): Sitemaps → kirim `https://ralulu.com/sitemap.xml`.
