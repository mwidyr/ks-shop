# Panduan Deploy Gratis

Kode sudah ada di `github.com/mwidyr/ks-shop`. Arsitektur yang dipakai — semua gratis, **tanpa
kartu kredit**:

```
Browser
  → Vercel (frontend React/Vite, static hosting)
      → Back4app Containers (backend Go, free container hosting)
          → Neon (Postgres, free tier)
          → Cloudinary (foto produk, free tier)
```

Backend sudah dimodifikasi supaya upload foto produk otomatis pakai Cloudinary kalau
kredensialnya diisi (kalau tidak diisi, fallback ke disk lokal — dipakai saat dev dengan
`docker-compose`). Migrasi database (`backend/cmd/api/migrations/*.sql`) jalan otomatis setiap
backend start, termasuk seed data & akun demo — jadi begitu backend pertama kali nyala di
database Neon yang masih kosong, semua tabel + data contoh langsung ada, tidak perlu setup
manual di database.

> **Riwayat percobaan platform backend** (dunia hosting gratis ini berubah cepat, dicatat supaya
> jelas kenapa bukan pilihan pertama):
> - **Render** sekarang mewajibkan kartu kredit untuk membuat service baru (termasuk lewat
>   Blueprint `render.yaml`). File `render.yaml` di root repo tetap disimpan sebagai alternatif
>   kalau nanti Anda punya kartu dan mau pakai Render.
> - **Koyeb** baru diakuisisi Mistral AI (Maret 2026) dan menghapus tier gratisnya sama sekali.
> - **Back4app Containers** (dipakai di panduan ini) memang secara eksplisit menyatakan "no
>   credit card required" di halaman pricing resminya, deploy dari Dockerfile di GitHub sama
>   seperti dua platform di atas. Backend project ini sudah kompatibel apa adanya (baca `PORT`
>   dari environment variable, sesuai yang disyaratkan Back4app).

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

## 3. Deploy backend ke Back4app Containers

1. Buka [back4app.com](https://www.back4app.com) → **Sign up** (tidak perlu kartu kredit) →
   pilih produk **Containers** (bukan "Backend as a Service"/Parse yang jadi produk utama
   mereka — pastikan masuk ke bagian **Container as a Service**).
2. **Connect GitHub** → beri akses ke repo `mwidyr/ks-shop` → pilih repo tersebut.
3. Isi konfigurasi deployment:
   - **Nama aplikasi** → bebas, misal `ks-shop-backend`.
   - **Branch** → `main`.
   - **Root Directory** → isi `backend` — penting, supaya Back4app menemukan
     `backend/Dockerfile` dan build context-nya dari folder `backend/`, bukan root repo yang
     berisi frontend+backend sekaligus.
   - **Environment Variables** → tambahkan (nama variabel harus huruf besar, sudah sesuai
     semua nama env var project ini):
     | Key | Value |
     |---|---|
     | `DATABASE_URL` | connection string Neon dari langkah 1 |
     | `JWT_SECRET` | string acak bebas, contoh: `ganti-dengan-string-panjang-acak-anda` |
     | `CLOUDINARY_CLOUD_NAME` | dari Cloudinary langkah 2 |
     | `CLOUDINARY_API_KEY` | dari Cloudinary langkah 2 |
     | `CLOUDINARY_API_SECRET` | dari Cloudinary langkah 2 |

     Tidak perlu isi `PORT` manual — Back4app menyuntikkan env var `PORT` sendiri secara
     dinamis, dan backend project ini sudah otomatis membaca & listen di port itu.
4. Klik tombol untuk membuat/deploy aplikasi (biasanya **Create App** atau **Deploy**). Tunggu
   build Docker image selesai.
5. Setelah statusnya running, buka halaman **Overview** aplikasi untuk mendapat URL publiknya,
   bentuknya kira-kira: `https://ks-shop-backend-xxxx.b4a.run` (formatnya bisa sedikit berbeda).
6. Cek backend hidup & migrasi sudah jalan:
   ```
   https://<url-app-anda>/health
   ```
   Harus balas `{"status":"ok"}`.

> Catatan: free tier Back4app Containers pakai resource terbatas (0.25 shared CPU, 256MB RAM,
> region US saja) — cukup untuk demo/portofolio, tapi kalau ada perilaku sleep/limit jam aktif
> yang tidak terduga saat dipakai, itu wajar untuk tier gratis; cek dashboard mereka untuk detail
> real-time-nya.
>
> **UI dashboard bisa saja beda label** dari yang tertulis di atas (platform hosting sering
> mengubah tampilan). Kalau ada langkah yang tidak cocok dengan yang Anda lihat, screenshot atau
> jelaskan apa yang tampil — sesuaikan bareng-bareng.

---

## 4. Deploy frontend ke Vercel

1. Buka [vercel.com](https://vercel.com), sign up/login pakai akun GitHub yang sama.
2. **Add New** → **Project** → pilih repo `mwidyr/ks-shop`.
3. Di layar konfigurasi sebelum deploy:
   - **Root Directory** → klik Edit, pilih folder `frontend`.
   - **Framework Preset** → otomatis terdeteksi "Vite", biarkan default (build command
     `npm run build`, output `dist`).
   - **Environment Variables** → tambah satu:
     - `VITE_API_URL` = URL backend dari langkah 3 **ditambah `/api` di akhir**, contoh:
       `https://ks-shop-backend-xxxx.b4a.run/api`
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
backend Back4app + `/api`, tanpa trailing slash ganda).

---

## 6. Update selanjutnya

Repo ini sudah tersambung ke Back4app & Vercel lewat GitHub. Alur update berikutnya:

```
edit kode → git commit → git push origin main
```

Back4app dan Vercel otomatis mendeteksi push baru ke branch `main` dan re-deploy sendiri (kalau
Auto Deployment diaktifkan) — tidak perlu ulangi langkah manual di atas, kecuali kalau menambah
environment variable baru.

---

## Ringkasan biaya & batasan tier gratis

| Layanan | Fungsi | Kartu kredit? | Batasan free tier yang relevan |
|---|---|---|---|
| Vercel | Hosting frontend | Tidak perlu | Sangat generous untuk proyek pribadi |
| Back4app Containers | Hosting backend Go | Tidak perlu | 0.25 shared CPU, 256MB RAM, region US saja |
| Neon | Postgres | Tidak perlu | Auto-suspend compute saat idle; storage 0.5GB |
| Cloudinary | Storage foto produk | Tidak perlu | ~25GB storage + bandwidth/bulan |

Semua batasan di atas hanya soal **kecepatan saat pertama diakses setelah lama idle** — bukan
downtime permanen. Cocok untuk demo, portofolio, atau internal tool skala kecil; kalau nanti
butuh selalu responsif (tanpa cold start), tinggal upgrade paket berbayar termurah di masing-
masing layanan, tanpa perlu ubah kode sama sekali.
