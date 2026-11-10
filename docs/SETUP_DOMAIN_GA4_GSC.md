# Setup Domain, HTTPS, Google Analytics 4 & Search Console (ralulu.com)

Panduan lengkap dari nol sampai live. Akun Google yang dipakai: **ralulu.admin@gmail.com**.
Domain: **ralulu.com** (storefront) dan **admin.ralulu.com** (ERP). Server: VPS IDCloudHost. DNS: Namecheap.

Urutan pengerjaan:

1. DNS di Namecheap
2. Firewall & deploy di VPS
3. nginx + HTTPS
4. Google Analytics 4
5. Google Search Console
6. Uji oleh staff (belum publik)
7. Launch publik

> Semua perintah server diawali `sudo` kalau butuh hak root. `sudo` hanya berlaku untuk satu perintah;
> pada `a && b`, `b` harus punya `sudo` sendiri.

---

## 1. DNS di Namecheap

1. Login Namecheap → **Domain List** → `ralulu.com` → **Manage**.
2. Tab **Domain**: pastikan Nameservers = **Namecheap BasicDNS**. Jika memakai nameserver lain
   (mis. Cloudflare), record dibuat di sana.
3. Tab **Advanced DNS**: hapus record bawaan untuk `@` dan `www` (parking page / URL redirect), lalu tambahkan:

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | A Record | `@` | IP VPS | Automatic |
   | A Record | `www` | IP VPS | Automatic |
   | A Record | `admin` | IP VPS | Automatic (jika belum ada) |

4. Tunggu propagasi (beberapa menit sampai 1 jam). Cek dari komputer lokal:
   ```bash
   dig ralulu.com +short
   dig www.ralulu.com +short
   dig admin.ralulu.com +short
   ```
   Semuanya harus menampilkan IP VPS.

---

## 2. Firewall & deploy di VPS

### 2.1 Firewall

Di **panel IDCloudHost** (Firewall / Security Group): buka port **80** dan **443** untuk publik.

Di server:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```
Jika status `inactive`, izinkan SSH dulu sebelum mengaktifkan:
```bash
sudo ufw allow OpenSSH
sudo ufw enable
```
Port 8081 (admin) dan 8082 (storefront) **tidak** dibuka: keduanya hanya bind ke `127.0.0.1`.

### 2.2 Konfigurasi `.env`

```bash
cd ~/ks-shop
git pull
cp .env.prod.example .env      # hanya jika belum ada; kalau sudah ada, edit saja
nano .env
```

Nilai penting untuk tahap ini:

```
APP_BASE_URL=https://admin.ralulu.com
SITE_NOINDEX=true
```

- `SITE_NOINDEX=true` menyembunyikan storefront dari Google selama masa uji (lihat bagian 6).
- Jangan set `STORE_BIND=0.0.0.0` (itu hanya untuk staging tanpa domain).
- Variabel GA4 dan `GOOGLE_SITE_VERIFICATION` diisi nanti (bagian 4 dan 5).

### 2.3 Jalankan

```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml ps
```
Jika `docker compose` tanpa sudo bisa jalan (user ada di grup `docker`), sudo tidak diperlukan.

---

## 3. nginx (host) + HTTPS

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

### 3.1 Server block storefront

```bash
sudo tee /etc/nginx/sites-available/ralulu.com > /dev/null <<'EOF'
server {
    listen 80;
    server_name ralulu.com www.ralulu.com;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/ralulu.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Admin (`admin.ralulu.com` → `127.0.0.1:8081`) memakai pola yang sama; lihat `docs/DEPLOYMENT_VPS.md` bagian 8.
Cek `ls /etc/nginx/sites-enabled/` — jika admin sudah ada, tidak perlu dibuat ulang.

Pastikan `curl http://ralulu.com` sudah menjawab sebelum lanjut (Certbot butuh itu).

### 3.2 HTTPS gratis

```bash
sudo certbot --nginx -d ralulu.com -d www.ralulu.com
sudo certbot --nginx -d admin.ralulu.com     # hanya jika admin belum punya sertifikat
```
Sertifikat diperpanjang otomatis (systemd timer).

### 3.3 Terapkan `.env`

```bash
sudo docker compose -f docker-compose.prod.yml up -d backend
```

### 3.4 Cek

- `https://ralulu.com` terbuka.
- `https://ralulu.com/robots.txt` berisi `Disallow: /` (karena `SITE_NOINDEX=true`).

---

## 4. Google Analytics 4

Login dengan **ralulu.admin@gmail.com** di semua langkah.

### 4.1 Property & web stream → `GA4_MEASUREMENT_ID`, `GA4_PROPERTY_ID`

1. Buka **analytics.google.com** → **Admin** (ikon gerigi) → **Create → Property**.
2. Isi nama (mis. "Ralulu"), zona waktu **Indonesia (GMT+7) Jakarta**, mata uang. Selesaikan wizard.
3. Pilih platform **Web**, URL `https://ralulu.com`, nama stream → **Create stream**.
4. Salin **Measurement ID** (`G-XXXXXXXXXX`) → `GA4_MEASUREMENT_ID`.
5. **Admin → Property settings (Property details)** → salin **Property ID** (angka) → `GA4_PROPERTY_ID`.

### 4.2 Service account → `GA4_SERVICE_ACCOUNT_JSON`

Dipakai supaya halaman **Website Analytics** di ERP bisa membaca laporan GA4.

1. Buka **console.cloud.google.com**, buat project baru (menu pemilih project → **New Project**).
2. **APIs & Services → Library** → cari **Google Analytics Data API** → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account**. Nama mis. `ralulu-ga` → **Done**
   (tidak perlu role di Cloud).
4. Klik service account tersebut → tab **Keys → Add key → Create new key → JSON**. File JSON terunduh.
   **Rahasia: jangan dibagikan, jangan di-commit.**
5. Salin email service account (`…@…iam.gserviceaccount.com`).
6. Di GA4: **Admin → Property access management → + → Add users**. Tempel email service account, peran **Viewer**.
7. Ubah isi file JSON menjadi **satu baris** (di komputer lokal):
   ```bash
   python3 -c "import json,sys;print(json.dumps(json.load(open(sys.argv[1]))))" ~/Downloads/nama-file.json
   ```
   Hasilnya adalah nilai `GA4_SERVICE_ACCOUNT_JSON`.

### 4.3 Isi `.env` & restart

```
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_PROPERTY_ID=123456789
GA4_SERVICE_ACCOUNT_JSON='{"type":"service_account","client_email":"…","private_key":"…"}'
```
Bungkus JSON dengan tanda petik tunggal agar tanda `"` di dalamnya aman.

```bash
sudo docker compose -f docker-compose.prod.yml up -d backend
```

### 4.4 Cek

- Buka `https://ralulu.com`, lalu di GA4 → **Reports → Realtime**: kunjungan Anda harus muncul.
- ERP → **Website Analytics** tidak lagi menampilkan "Google Analytics belum terhubung".
- Laporan lengkap baru terisi setelah ±24 jam.

### 4.5 Exclude traffic staff

Supaya data saat launch bersih:

1. **Admin → Data streams →** (stream web) **→ Configure tag settings → Show all → Define internal traffic →
   Create**. Isi nama rule dan IP kantor.
2. **Admin → Data settings → Data filters →** filter **Internal Traffic**. Mulai dari status **Testing**,
   ubah ke **Active** setelah terbukti bekerja.

---

## 5. Google Search Console → `GOOGLE_SITE_VERIFICATION`

Pastikan `https://ralulu.com` sudah bisa dibuka dengan HTTPS (bagian 3).

1. Buka **search.google.com/search-console** → **Add property**.
2. Pilih **URL prefix** (bukan Domain), isi `https://ralulu.com`.
3. Metode verifikasi **HTML tag**. Google menampilkan:
   ```html
   <meta name="google-site-verification" content="AbC123xyz..." />
   ```
4. Salin **hanya** isi `content="..."` (`AbC123xyz...`, tanpa tanda kutip) → `GOOGLE_SITE_VERIFICATION`.
5. Isi di `.env`, lalu restart backend:
   ```bash
   sudo docker compose -f docker-compose.prod.yml up -d backend
   ```
6. Cek tag keluar:
   ```bash
   curl -s https://ralulu.com | grep google-site-verification
   ```
7. Kembali ke Search Console → **Verify**.

Tag verifikasi tetap keluar walau `SITE_NOINDEX=true`, jadi verifikasi bisa dilakukan sebelum launch.

---

## 6. Masa uji (production, belum publik)

- Biarkan `SITE_NOINDEX=true`: semua halaman storefront `noindex`, `/robots.txt` = `Disallow: /`, sitemap kosong.
  Google tidak akan mengindeks situs.
- Staff menguji semua fitur di `https://ralulu.com`. Kunjungan staff yang IP-nya terdaftar di filter internal
  traffic (4.5) tidak mencemari data GA4.
- Catatan: `noindex` hanya meminta mesin pencari tidak mengindeks, bukan mengunci akses. Jika perlu benar-benar
  privat, tambahkan password (basic auth) atau IP whitelist di nginx host.

---

## 7. Launch publik

1. Di `.env`: hapus `SITE_NOINDEX` atau ubah menjadi `false`.
2. `sudo docker compose -f docker-compose.prod.yml up -d backend`.
3. Cek `https://ralulu.com/robots.txt` kini berisi `Allow: /` dan baris `Sitemap:`.
4. Search Console → **Sitemaps** → kirim `https://ralulu.com/sitemap.xml`.
5. Pastikan filter **Internal Traffic** di GA4 berstatus **Active**.

---

## Ringkasan variabel `.env`

| Variabel | Dari mana | Contoh |
|---|---|---|
| `APP_BASE_URL` | domain admin | `https://admin.ralulu.com` |
| `SITE_NOINDEX` | `true` saat uji, hapus saat launch | `true` |
| `GA4_MEASUREMENT_ID` | GA4 → Data stream | `G-XXXXXXXXXX` |
| `GA4_PROPERTY_ID` | GA4 → Property settings | `123456789` |
| `GA4_SERVICE_ACCOUNT_JSON` | Google Cloud → key JSON (satu baris) | `'{"type":"service_account",…}'` |
| `GOOGLE_SITE_VERIFICATION` | Search Console → HTML tag (isi `content`) | `AbC123xyz...` |

## Troubleshooting singkat

- **`ERROR: You need to be root`** — awali perintah dengan `sudo`.
- **Certbot gagal** — pastikan DNS sudah mengarah ke VPS (`dig`), port 80/443 terbuka di firewall panel dan `ufw`,
  dan `curl http://ralulu.com` menjawab.
- **Search Console "Verify" gagal** — cek `curl -s https://ralulu.com | grep google-site-verification`;
  jika kosong, backend belum di-restart setelah `.env` diubah atau nilainya salah.
- **GA4 Realtime kosong** — pastikan `GA4_MEASUREMENT_ID` terisi dan backend sudah di-restart; matikan ad-blocker
  saat menguji.
- **Website Analytics di ERP kosong / error** — periksa email service account sudah jadi Viewer di GA4, Google
  Analytics Data API aktif, dan JSON valid satu baris.
- Referensi lain: `docs/ga4-setup.md`, `docs/DEPLOYMENT_VPS.md`.
