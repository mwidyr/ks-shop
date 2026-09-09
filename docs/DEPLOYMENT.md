# Panduan Deploy Gratis

Kode sudah ada di `github.com/mwidyr/ks-shop`. Arsitektur yang dipakai — semua gratis, **tanpa
kartu kredit**:

```
Browser
  → Vercel (frontend React/Vite, static hosting)
      → Koyeb (backend Go, free web service)
          → Neon (Postgres, free tier)
          → Cloudinary (foto produk, free tier)
```

Backend sudah dimodifikasi supaya upload foto produk otomatis pakai Cloudinary kalau
kredensialnya diisi (kalau tidak diisi, fallback ke disk lokal — dipakai saat dev dengan
`docker-compose`). Migrasi database (`backend/cmd/api/migrations/*.sql`) jalan otomatis setiap
backend start, termasuk seed data & akun demo — jadi begitu backend pertama kali nyala di
database Neon yang masih kosong, semua tabel + data contoh langsung ada, tidak perlu setup
manual di database.

> **Kenapa Koyeb, bukan Render?** Render sekarang mewajibkan kartu kredit untuk membuat service
> baru (termasuk lewat Blueprint `render.yaml`). Koyeb tidak mewajibkan kartu kredit di awal
> (baru diminta kalau sistem mereka gagal memverifikasi otomatis bahwa pendaftarnya manusia,
> jarang terjadi). File `render.yaml` di root repo tetap disimpan sebagai alternatif kalau
> nanti Anda memutuskan pakai Render juga — tidak dipakai di panduan ini.

Total waktu: sekitar 20-30 menit, semua lewat dashboard web (klik-klik), tidak perlu command
line di sisi Anda kecuali sudah ditangani di sesi ini (push ke GitHub, cek koneksi database).

---

## 1. Buat database gratis di Neon — ✅ sudah selesai

Kalau Anda mengikuti sesi sebelumnya: project Neon `ksshopdb` sudah dibuat, dan backend sudah
pernah dijalankan sekali secara lokal mengarah ke database ini untuk memverifikasi 17 file
migrasi + seed data berhasil masuk. Simpan connection string-nya (format
`postgresql://...sslmode=require&channel_binding=require`) — dipakai sebagai `DATABASE_URL` di
langkah 3.

Kalau belum: buka [neon.tech](https://neon.tech) → sign up → buat project baru → copy
**Connection string** dari dashboard.

> Neon free tier auto-suspend compute saat idle — request pertama setelah tidur akan sedikit
> lebih lambat (beberapa detik) saat database "bangun" lagi. Normal untuk tier gratis.

---

## 2. Buat akun Cloudinary (untuk foto produk)

1. Buka [cloudinary.com](https://cloudinary.com), sign up gratis (tidak perlu kartu kredit).
2. Di halaman dashboard utama, copy **Cloud name**, **API Key**, dan **API Secret**. Tidak perlu
   setting tambahan (upload preset dsb) — backend sudah pakai signed upload jadi cukup 3 nilai
   ini.

---

## 3. Deploy backend ke Koyeb

1. Buka [koyeb.com](https://www.koyeb.com), **Sign up** — paling gampang pakai tombol "Sign up
   with GitHub" (sekalian kasih akses ke repo `mwidyr/ks-shop`).
2. Di dashboard Koyeb → **Create Web Service** (atau **Create App** → **Web Service**).
3. **Deployment method** → pilih **GitHub** → pilih repo `mwidyr/ks-shop` → branch `main`.
4. **Builder** → pilih **Dockerfile**.
5. **Work directory** (kadang disebut "Root directory") → isi `backend` — ini penting, supaya
   Koyeb membangun image dari `backend/Dockerfile`, bukan dari root repo yang isinya
   frontend+backend sekaligus.
6. **Environment variables** → tambahkan:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | connection string Neon dari langkah 1 |
   | `JWT_SECRET` | string acak bebas, contoh: `ganti-dengan-string-panjang-acak-anda` |
   | `CLOUDINARY_CLOUD_NAME` | dari Cloudinary langkah 2 |
   | `CLOUDINARY_API_KEY` | dari Cloudinary langkah 2 |
   | `CLOUDINARY_API_SECRET` | dari Cloudinary langkah 2 |
   | `PORT` | `8080` (opsional, ini sudah default kalau tidak diisi) |
7. **Exposing your service / Ports** → set port ke `8080`, protocol HTTP.
8. **Health check** → isi path `/health`.
9. **Instance type** → pilih yang **Free**.
10. Klik **Deploy**. Tunggu build selesai (~2-3 menit untuk build Docker image Go).
11. Setelah status **Healthy**, copy URL service-nya, bentuknya kira-kira:
    `https://ks-shop-backend-<nama-org-anda>.koyeb.app`
12. Cek backend hidup & migrasi sudah jalan:
    ```
    https://ks-shop-backend-<nama-org-anda>.koyeb.app/health
    ```
    Harus balas `{"status":"ok"}`.

> Catatan: instance Free Koyeb scale-to-zero setelah ±1 jam tanpa traffic — request berikutnya
> butuh beberapa detik untuk "bangun" lagi (cold start). Batasan wajar untuk tier gratis, cocok
> untuk demo/portofolio.

---

## 4. Deploy frontend ke Vercel

1. Buka [vercel.com](https://vercel.com), sign up/login pakai akun GitHub yang sama.
2. **Add New** → **Project** → pilih repo `mwidyr/ks-shop`.
3. Di layar konfigurasi sebelum deploy:
   - **Root Directory** → klik Edit, pilih folder `frontend`.
   - **Framework Preset** → otomatis terdeteksi "Vite", biarkan default (build command
     `npm run build`, output `dist`).
   - **Environment Variables** → tambah satu:
     - `VITE_API_URL` = `https://ks-shop-backend-<nama-org-anda>.koyeb.app/api` (URL backend dari
       langkah 3, **ditambah `/api` di akhir**)
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
Koyeb + `/api`, tanpa trailing slash ganda).

---

## 6. Update selanjutnya

Repo ini sudah tersambung ke Koyeb & Vercel lewat GitHub. Alur update berikutnya:

```
edit kode → git commit → git push origin main
```

Koyeb dan Vercel otomatis mendeteksi push baru ke branch `main` dan re-deploy sendiri — tidak
perlu ulangi langkah manual di atas, kecuali kalau menambah environment variable baru.

---

## Ringkasan biaya & batasan tier gratis

| Layanan | Fungsi | Kartu kredit? | Batasan free tier yang relevan |
|---|---|---|---|
| Vercel | Hosting frontend | Tidak perlu | Sangat generous untuk proyek pribadi |
| Koyeb | Hosting backend Go | Tidak perlu (biasanya) | Scale-to-zero setelah ±1 jam idle → cold start beberapa detik |
| Neon | Postgres | Tidak perlu | Auto-suspend compute saat idle; storage 0.5GB |
| Cloudinary | Storage foto produk | Tidak perlu | ~25GB storage + bandwidth/bulan |

Semua batasan di atas hanya soal **kecepatan saat pertama diakses setelah lama idle** — bukan
downtime permanen. Cocok untuk demo, portofolio, atau internal tool skala kecil; kalau nanti
butuh selalu responsif (tanpa cold start), tinggal upgrade paket berbayar termurah di masing-
masing layanan, tanpa perlu ubah kode sama sekali.
