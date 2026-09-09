# Panduan Deploy Gratis

Kode sudah ada di `github.com/mwidyr/ks-shop`. Arsitektur yang dipakai — semua gratis:

```
Browser
  → Vercel (frontend React/Vite, static hosting)
      → Render (backend Go, free web service)
          → Neon (Postgres, free tier)
          → Cloudinary (foto produk, free tier)
```

Backend sudah dimodifikasi supaya upload foto produk otomatis pakai Cloudinary kalau
kredensialnya diisi (kalau tidak diisi, fallback ke disk lokal — dipakai saat dev dengan
`docker-compose`). Migrasi database (`backend/cmd/api/migrations/*.sql`) jalan otomatis setiap
backend start, termasuk seed data & akun demo — jadi begitu backend pertama kali nyala di
database Neon yang masih kosong, semua tabel + data contoh langsung ada, tidak perlu setup
manual di database.

Total waktu: sekitar 20-30 menit, semua lewat dashboard web (klik-klik), tidak perlu command
line di sisi Anda.

---

## 1. Buat database gratis di Neon

1. Buka [neon.tech](https://neon.tech), sign up (bisa pakai akun GitHub).
2. Buat project baru, nama bebas (misal `ks-shop`), region terdekat (misal Singapore).
3. Setelah project dibuat, buka tab **Connection Details** / **Dashboard** → copy
   **Connection string**-nya. Bentuknya kira-kira:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxxx-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Simpan string ini — dipakai sebagai `DATABASE_URL` di langkah 3.

> Catatan: Neon free tier akan "tidur" (auto-suspend compute) kalau tidak ada aktivitas — request
> pertama setelah tidur akan sedikit lebih lambat (beberapa detik) saat database "bangun" lagi.
> Ini normal untuk tier gratis.

---

## 2. Buat akun Cloudinary (untuk foto produk)

1. Buka [cloudinary.com](https://cloudinary.com), sign up gratis.
2. Begitu masuk dashboard, halaman utama sudah menampilkan **Cloud name**, **API Key**, dan
   **API Secret** — copy ketiganya. Tidak perlu setting tambahan apapun (upload preset dsb),
   backend sudah pakai signed upload jadi cukup 3 nilai ini.

---

## 3. Deploy backend ke Render

1. Buka [render.com](https://render.com), sign up (bisa pakai akun GitHub — sekalian kasih akses
   ke repo `mwidyr/ks-shop`).
2. Dashboard Render → **New** → **Blueprint**.
3. Pilih repo `mwidyr/ks-shop`. Render akan otomatis mendeteksi file `render.yaml` di root repo
   dan menyiapkan satu service: `ks-shop-backend` (web service, free plan, build dari
   `backend/Dockerfile`).
4. Sebelum "Apply", Render akan minta isi env var yang ditandai butuh input manual:
   - `DATABASE_URL` → paste connection string dari Neon (langkah 1).
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` → paste dari
     Cloudinary (langkah 2).
   - `JWT_SECRET` sudah otomatis di-generate random oleh Render, tidak perlu diisi manual.
5. Klik **Apply** / **Create Web Service**. Tunggu build selesai (build pertama ~2-3 menit,
   proses build Docker image Go).
6. Setelah statusnya **Live**, copy URL service-nya, contoh:
   `https://ks-shop-backend.onrender.com`
7. Cek backend sudah hidup dan migrasi sudah jalan:
   ```
   https://ks-shop-backend.onrender.com/health
   ```
   Harus balas `{"status":"ok"}`. Kalau ini sukses, berarti koneksi ke Neon berhasil dan semua
   17 file migrasi (termasuk seed data) sudah otomatis dijalankan.

> Catatan: Render free web service akan "tidur" setelah ~15 menit tanpa request, request
> berikutnya butuh ~30-50 detik untuk "bangun" lagi (cold start). Ini batasan tier gratis, wajar
> untuk demo/portfolio, kurang cocok kalau butuh selalu responsif.

---

## 4. Deploy frontend ke Vercel

1. Buka [vercel.com](https://vercel.com), sign up/login pakai akun GitHub yang sama.
2. **Add New** → **Project** → pilih repo `mwidyr/ks-shop`.
3. Di layar konfigurasi sebelum deploy:
   - **Root Directory** → klik Edit, pilih folder `frontend`.
   - **Framework Preset** → otomatis terdeteksi "Vite", biarkan default (build command
     `npm run build`, output `dist`).
   - **Environment Variables** → tambah satu:
     - `VITE_API_URL` = `https://ks-shop-backend.onrender.com/api` (URL backend dari langkah 3,
       **ditambah `/api` di akhir**)
4. Klik **Deploy**. Tunggu ~1-2 menit.
5. Setelah selesai, Vercel kasih URL publik, contoh: `https://ks-shop.vercel.app`.

File `frontend/vercel.json` sudah disiapkan supaya semua route React Router (misalnya
`/orders/5`, `/products/new`) tetap membuka `index.html` dan tidak 404 saat diakses langsung
(refresh browser atau buka link langsung ke halaman dalam).

---

## 5. Tes end-to-end

1. Buka `https://ks-shop.vercel.app` (atau URL Vercel Anda).
2. Login pakai salah satu akun demo (password semua sama: `password123`):

   | Role | Email |
   |---|---|
   | Super User | `superuser@demo.com` |
   | Management | `management@demo.com` |
   | SPV | `spv@demo.com` |
   | Sales | `sales1@demo.com` |

3. Cek Dashboard tampil grafik & data (dari seed data otomatis).
4. Coba tambah produk baru dengan upload foto — foto akan tersimpan di Cloudinary (cek juga di
   dashboard Cloudinary → Media Library, filenya akan muncul di sana), bukan hilang saat backend
   restart.
5. Coba buat order baru end-to-end.

Kalau ada halaman blank atau error CORS di console browser: backend sudah diset
`AllowedOrigins: []string{"*"}` (izinkan semua origin) jadi seharusnya tidak ada masalah CORS —
kalau tetap terjadi, cek dulu apakah `VITE_API_URL` di Vercel sudah benar (harus persis URL
Render + `/api`, tanpa trailing slash ganda).

---

## 6. Update selanjutnya

Repo ini sudah tersambung ke Render & Vercel lewat GitHub. Alur update berikutnya:

```
edit kode → git commit → git push origin main
```

Render dan Vercel otomatis mendeteksi push baru ke branch `main` dan re-deploy sendiri — tidak
perlu ulangi langkah manual di atas, kecuali kalau menambah environment variable baru.

---

## Ringkasan biaya & batasan tier gratis

| Layanan | Fungsi | Batasan free tier yang relevan |
|---|---|---|
| Vercel | Hosting frontend | Sangat generous untuk proyek pribadi, praktis tidak ada masalah |
| Render | Hosting backend Go | Auto-sleep setelah ~15 menit idle → cold start ~30-50 detik |
| Neon | Postgres | Auto-suspend compute saat idle → cold start beberapa detik; storage 0.5GB |
| Cloudinary | Storage foto produk | ~25GB storage + bandwidth/bulan, jauh lebih dari cukup untuk demo |

Semua batasan di atas hanya soal **kecepatan saat pertama diakses setelah lama idle** — bukan
downtime permanen. Cocok untuk demo, portofolio, atau internal tool skala kecil; kalau nanti
butuh selalu responsif (tanpa cold start), tinggal upgrade Render/Neon ke paket berbayar
termurahnya (mulai ~$6-7/bulan), tanpa perlu ubah kode sama sekali.
