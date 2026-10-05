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

## 8. Domain + HTTPS (mis. admin.domainanda.com)

Karena frontend sudah dibangun untuk memanggil API secara relatif (`/api`, bukan alamat IP
tertulis langsung), pindah ke domain **tidak perlu rebuild frontend sama sekali** — tinggal
pasang domain + HTTPS di depan stack Docker yang sudah jalan.

Pendekatan: nginx di **host** (bukan di dalam Docker) yang terbuka ke publik di :80/:443 dan
menangani sertifikat HTTPS (lewat Certbot, auto-renew), lalu meneruskan semua trafik ke container
`web` yang sekarang hanya bind ke `127.0.0.1:8081` (lihat `docker-compose.prod.yml`). Ini dipilih
karena Certbot plugin nginx butuh mengedit config nginx yang benar-benar menerima trafik publik —
nginx di dalam Docker tidak terlihat olehnya.

```
Browser → https://admin.domainanda.com (nginx HOST, :80 redirect → :443 HTTPS)
               → 127.0.0.1:8081 → container "web" (nginx Docker, build statis React)
                                        ├─ /api/*, /uploads/*, /health → container backend
```

### 8.1 Arahkan DNS

Di panel registrar domain Anda (mis. Namecheap → Domain List → Manage → Advanced DNS), tambahkan:
- **Type**: A Record, **Host**: `admin` (atau subdomain lain yang diinginkan), **Value**: IP VPS
  Anda, **TTL**: Automatic.
- **Jangan** menambah/mengubah record untuk `@` (root domain) kalau root domain memang sengaja
  dibiarkan kosong — biarkan apa adanya (biasanya halaman parking bawaan registrar).

Tunggu beberapa menit - jam untuk propagasi DNS. Cek dengan `dig admin.domainanda.com +short` dari
komputer lokal - harus menampilkan IP VPS Anda.

### 8.2 Pastikan container `web` hanya bind ke localhost

`docker-compose.prod.yml` versi terbaru di repo ini sudah mem-bind container `web` ke
`127.0.0.1:8081` (bukan `80:80` lagi), supaya hanya nginx host yang bisa menjangkau port publik.
Kalau sudah pernah `up` dengan versi lama, jalankan ulang setelah `git pull`:
```bash
docker compose -f docker-compose.prod.yml up -d --build web
```

### 8.3 Install nginx + Certbot di host

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
ufw allow 80/tcp
ufw allow 443/tcp
```

### 8.4 Buat server block nginx (host)

```bash
cat > /etc/nginx/sites-available/admin.domainanda.com <<'EOF'
server {
    listen 80;
    server_name admin.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -s /etc/nginx/sites-available/admin.domainanda.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```
Ganti `admin.domainanda.com` di dua tempat di atas (nama file & `server_name`) dengan subdomain
asli Anda. Pastikan `curl http://admin.domainanda.com/health` sudah balas `{"status":"ok"}`
sebelum lanjut ke langkah HTTPS — Certbot butuh ini untuk verifikasi domain (HTTP-01 challenge).

### 8.5 Pasang HTTPS gratis (Certbot)

```bash
certbot --nginx -d admin.domainanda.com
```
Ikuti prompt (isi email, setuju ToS). Certbot otomatis mengubah server block di atas untuk
redirect HTTP→HTTPS dan menambah blok `listen 443 ssl`, lalu memasang systemd timer untuk
perpanjangan otomatis sebelum sertifikat kedaluwarsa (90 hari) — tidak perlu langkah manual lagi.

### 8.6 Update APP_BASE_URL

Edit `.env` di root repo, ubah `APP_BASE_URL` dari IP ke domain HTTPS-nya:
```
APP_BASE_URL=https://admin.domainanda.com
```
Lalu terapkan ke backend:
```bash
docker compose -f docker-compose.prod.yml up -d backend
```

## Troubleshooting singkat

- `docker compose -f docker-compose.prod.yml logs backend` — cek log backend, termasuk baris
  migrasi (`applying migration: ...`) dan status ECPay saat startup.
- `docker compose -f docker-compose.prod.yml logs web` — cek log nginx kalau halaman blank atau
  error saat memanggil API.
- Kalau `docker compose up` gagal di step build backend/frontend, jalankan build satu-satu untuk
  lihat error lebih jelas: `docker compose -f docker-compose.prod.yml build backend` /
  `... build web`.
