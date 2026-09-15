# Panduan Deploy — VPS Sendiri (IDCloudHost, Docker Compose)

Frontend, backend, dan Postgres berjalan sebagai satu paket Docker Compose di VPS Anda sendiri,
diakses lewat IP VPS langsung (tanpa domain, tanpa HTTPS untuk saat ini). Hanya nginx (bagian
dari container `web`) yang terbuka ke internet di port 80 — database dan backend tidak bisa
diakses langsung dari luar VPS.

```
Browser → http://<IP-VPS>  (nginx, port 80)
              ├─ file statis frontend (React build)
              ├─ /api/*, /uploads/*, /health  → diteruskan ke container backend (internal)
                                                    → container db (internal, Postgres)
```

> **Peringatan keamanan**: karena tidak ada HTTPS, semua trafik (termasuk login) lewat HTTP biasa
> (tidak terenkripsi). Cukup untuk demo/internal tool skala kecil dengan risiko rendah — kalau
> nanti butuh HTTPS sungguhan, itu berarti perlu domain asli (Let's Encrypt tidak bisa terbitkan
> sertifikat untuk alamat IP polos) - bisa jadi langkah lanjutan terpisah, tidak dibahas di sini.

---

## 1. Siapkan VPS

1. Buat VPS di IDCloudHost (Ubuntu 22.04/24.04 direkomendasikan kalau ada pilihan OS).
2. SSH masuk ke VPS: `ssh root@<IP-VPS>`.
3. Install Docker + Docker Compose plugin (skip kalau sudah ada, cek dengan `docker --version`):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
   Ini juga menginstall `docker compose` (plugin v2, dipanggil sebagai `docker compose ...` bukan
   `docker-compose ...`).
4. (Opsional tapi disarankan) Buka hanya port yang perlu lewat firewall:
   ```bash
   apt install -y ufw
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw enable
   ```

## 2. Clone repo

```bash
git clone git@github.com:mwidyr/ks-shop.git
cd ks-shop
```
(Kalau clone via SSH gagal karena belum ada SSH key di VPS, pakai HTTPS:
`git clone https://github.com/mwidyr/ks-shop.git`.)

## 3. Isi konfigurasi

```bash
cp .env.prod.example .env
nano .env   # atau editor lain
```

Wajib diisi:
- `POSTGRES_PASSWORD` — password bebas, asal panjang & acak.
- `JWT_SECRET` — generate dengan `openssl rand -hex 32`, tempel hasilnya.
- `APP_BASE_URL` — isi `http://<IP-VPS-Anda>` (cek IP dengan `curl ifconfig.me` dari dalam VPS).

Sisanya (Cloudinary, SMTP, ECPay) opsional — boleh dikosongkan dulu, aplikasi tetap jalan
(foto produk fallback ke volume Docker lokal, email hanya dicatat di log, ECPay pakai akun test).

## 4. Jalankan

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Build pertama kali makan waktu beberapa menit (compile Go + build Vite). Migrasi database
(termasuk data contoh/demo) berjalan otomatis begitu backend menyala — tidak perlu langkah
manual tambahan.

Cek semua container jalan:
```bash
docker compose -f docker-compose.prod.yml ps
```

## 5. Verifikasi

```bash
curl http://localhost/health          # dari dalam VPS
curl http://<IP-VPS>/health           # dari luar - harus balas {"status":"ok"}
```

Buka `http://<IP-VPS>` di browser — halaman login harus muncul. Login pakai salah satu akun
demo (lihat langkah 6 di bawah untuk daftar akunnya) untuk memastikan koneksi ke database & API
benar-benar jalan, bukan cuma halaman statis yang tampil.

## 6. PENTING — amankan akun demo

Migrasi otomatis membuat beberapa akun staf dengan password sama: `password123`
(`superuser@demo.com`, `management@demo.com`, `spv@demo.com`, `sales1@demo.com`,
`sales2@demo.com`, `customer@demo.com`). Karena VPS ini terbuka ke internet publik tanpa HTTPS,
**segera setelah verifikasi di langkah 5 berhasil**, lakukan salah satu:
- Ganti password akun-akun ini lewat halaman **Manajemen Pengguna** di aplikasi, atau
- Nonaktifkan (set tidak aktif) akun-akun demo yang tidak dipakai sungguhan, dan buat akun staf
  baru dengan email & password asli.

Jangan biarkan `password123` tetap aktif di lingkungan production.

## 7. Update selanjutnya

```bash
cd ks-shop
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

Data di Postgres dan foto yang sudah diupload tidak hilang saat rebuild — keduanya tersimpan di
Docker volume (`db_data`, `backend_uploads`), bukan di dalam container itu sendiri.

## 8. Kalau nanti punya domain asli

Karena frontend sudah dibangun untuk memanggil API secara relatif (`/api`, bukan alamat IP
tertulis langsung), pindah ke domain asli nanti **tidak perlu rebuild frontend sama sekali**:
1. Arahkan DNS domain Anda (A record) ke IP VPS ini.
2. Tambahkan `server_name domain-anda.com;` di `frontend/nginx.conf`, lalu
   `docker compose -f docker-compose.prod.yml up -d --build web`.
3. (Opsional) Pasang HTTPS gratis via [Certbot](https://certbot.eff.org/) untuk domain tersebut.

## Troubleshooting singkat

- `docker compose -f docker-compose.prod.yml logs backend` — cek log backend, termasuk baris
  migrasi (`applying migration: ...`) dan status ECPay saat startup.
- `docker compose -f docker-compose.prod.yml logs web` — cek log nginx kalau halaman blank atau
  error saat memanggil API.
- Kalau `docker compose up` gagal di step build backend/frontend, jalankan build satu-satu untuk
  lihat error lebih jelas: `docker compose -f docker-compose.prod.yml build backend` /
  `... build web`.
