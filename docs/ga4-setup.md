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
