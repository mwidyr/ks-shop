# Menyalin data production ke server testing (116.193.191.197)

Dua script di `scripts/`:

| Script | Dijalankan di | Fungsi |
|---|---|---|
| `staging_sync_from_prod.sh` | **VPS production** (admin.ralulu.com) | Menghapus data testing, lalu menyalin database + file upload production ke testing lewat SSH |
| `staging_wipe.sh` | **VPS testing** | Hanya menghapus semua data testing (database + upload) dan menyalakan aplikasi kosong |

Production **hanya dibaca**. Tidak ada perintah penghapusan yang jalan di production.

## Persiapan sekali saja

**Di VPS testing** (`~/ks-shop`, folder yang ada `docker-compose.prod.yml` dan `.env`):
1. Tambahkan ke `.env`: `ENV_NAME=staging`. Tanpa baris ini kedua script menolak menghapus apa pun.
2. `APP_BASE_URL=http://116.193.191.197` (tidak boleh mengandung `ralulu.com`).
3. Biarkan **kosong** di `.env` testing: `RESEND_API_KEY`, `SMTP_*`, `WHATSAPP_*`, `TELEGRAM_*`, `ECPAY_*`, `OPENAI_*`
   (supaya email/OTP hanya tercatat di log dan tidak ada pesan terkirim ke pelanggan sungguhan).
4. Untuk membuka admin dan website lewat IP: di `docker-compose.prod.yml` testing ubah port `web` menjadi `"8081:80"` dan set `STORE_BIND=0.0.0.0`
   (lihat `docs/DEPLOYMENT_VPS.md`). **Batasi dengan firewall** hanya ke IP tim (lihat peringatan di bawah).
5. Pastikan versi kode sama dengan production (`git pull` + `docker compose -f docker-compose.prod.yml up -d --build`).

**Di VPS production:**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/staging_sync -N ""
cat ~/.ssh/staging_sync.pub        # tempel ke ~/.ssh/authorized_keys di VPS testing
cd ~/ks-shop
cp scripts/staging_sync.conf.example scripts/staging_sync.conf   # isi STAGING_USER / STAGING_DIR bila berbeda
```

## Menjalankan

```bash
cd ~/ks-shop                                   # di VPS production
bash scripts/staging_sync_from_prod.sh --dry-run   # cek SSH, pengaman, versi kode, ruang disk. Tidak mengubah apa pun
bash scripts/staging_sync_from_prod.sh             # salin sungguhan (minta ketik: KIRIM KE 116.193.191.197)
```
Urutannya: hapus data testing -> `pg_dump | pg_restore` lewat SSH -> salin file upload -> matikan kanal keluar
(`scripts/staging_neutralize.sql`) -> nyalakan aplikasi -> bandingkan jumlah baris tabel utama production vs testing.

Hanya menghapus data testing (tanpa menyalin), di VPS testing:
```bash
cd ~/ks-shop
bash scripts/staging_wipe.sh        # minta ketik: HAPUS DATA TESTING
```
Backup sebelum hapus ada di `backups/staging_before_wipe_*.dump` (3 terakhir). Mengembalikan:
`docker compose -f docker-compose.prod.yml exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < backups/<file>.dump`.

## Peringatan
- Server testing berisi **data pelanggan asli** (nama, telepon, alamat) dan hanya HTTP di IP publik. Batasi akses dengan firewall / allow-list IP, jangan ditautkan di mana pun,
  dan kosongkan lagi (`staging_wipe.sh`) kalau sudah selesai. Data disalin **apa adanya**, tidak disamarkan.
- Akun staf production (termasuk password) berlaku juga di testing.
- Yang dimatikan otomatis di testing: token bot Telegram dan chat id Telegram (global dan per Location), karena tersimpan di database. Kanal lain diatur lewat `.env` (poin 3).
- Ini snapshot satu waktu, bukan sinkronisasi terus-menerus. Jalankan ulang untuk menyegarkan (selalu hapus dulu).
- Hasil kerja di testing (order, stok, export ke 7-ELEVEN/FamilyMart/3PL) tidak boleh dikirim ke provider asli; jangan isi kredensial provider di `.env` testing.
- Butuh Postgres versi sama (keduanya `postgres:16-alpine`) dan disk cukup (script mengeceknya).
