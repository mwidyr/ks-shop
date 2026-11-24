# 12 — Sinkronisasi harian toko 7-ELEVEN & FamilyMart

Scraper Python buatan klien (`scripts/ralulu-store-sync/`) mengambil daftar toko dari situs
7-ELEVEN dan FamilyMart Taiwan setiap hari, lalu mengirimnya ke backend. Backend meng-upsert ke
`cvs_stores` dan mencatat hasil tiap proses untuk panel monitoring di halaman **Audit Logs**.

```
cron 03:00 → sync.py → output/*.json (snapshot lokal)
                     → POST /api/internal/cvs-sync  (Bearer CVS_SYNC_TOKEN)
                              → cvs_stores (upsert, tidak pernah delete)
                              → cvs_sync_runs (1 baris per chain per run)
Audit Logs ← GET /api/cvs-sync/status
```

## Kontrak endpoint

`POST /api/internal/cvs-sync` — header `Authorization: Bearer <CVS_SYNC_TOKEN>`.

nginx menolak body di atas 1 MB (413), dan batas itu sengaja **tidak dinaikkan**. Karena itu scraper
mengirim data dalam potongan ±700 KB (`UPLOAD_CHUNK_BYTES`), semuanya dengan `session` yang sama:

1. **Potongan:** `{session, stores[]}`. Backend hanya menampung ke `cvs_sync_staging`; `cvs_stores`
   belum berubah. Mengirim ulang potongan yang sama aman (idempotent).
2. **Commit:** `{session, generated_at, summary{7eleven, familymart}}` tanpa `stores`. Backend
   mencocokkan jumlah toko yang ditampung dengan `summary.count` tiap chain. Kalau ada potongan
   hilang → 422 dan tidak ada yang berubah. Kalau cocok, tiap chain diterapkan ke `cvs_stores`
   dalam satu transaksi, lalu baris penampung dihapus.

Run yang terputus di tengah (tanpa commit) tidak mengubah `cvs_stores`; sisa penampung dibersihkan
otomatis setelah 1 hari. Batas body di backend 2 MB.

- Token kosong di server → semua request 401.
- Scraper **selalu** mengirim laporan (commit), termasuk saat gagal, supaya kegagalan tampil di
  dashboard. Hanya chain yang lolos validasi yang mengirim potongan `stores`; chain gagal/sebagian
  **tidak mengubah `cvs_stores`**.
- Tiap chain diproses di transaksi sendiri. Payload tidak valid (store_id kosong/duplikat, chain
  tidak cocok, toko dikirim untuk chain yang gagal) ditolak 422 dan tidak mengubah apa pun.
- Status per chain: `success` (tanpa error), `partial` (sebagian wilayah gagal, data tidak diterapkan),
  `failed` (tidak ada data / gagal total).
- "Jumlah sebelumnya" dihitung dari run terakhir yang diterapkan di database, bukan snapshot lokal
  scraper (jadi tetap benar kalau folder `output/` hilang).
- Toko yang hilang dari sumber **tidak dihapus**; `cvs_stores.last_seen_at` menandai terakhir terlihat.

## Setup di server

1. Backend: tambahkan `CVS_SYNC_TOKEN=$(openssl rand -hex 32)` ke `.env`, lalu redeploy
   (migrasi `138_cvs_sync.sql` jalan otomatis). Begitu token diisi, refresh ECPay untuk `cvs_stores`
   dimatikan agar tidak menimpa data scraper.
2. Scraper (Ubuntu, Python 3.11+): ikuti `scripts/ralulu-store-sync/README.md`
   (`/opt/ralulu-store-sync`, venv, `.env` dengan `RALULU_SYNC_URL=https://<domain>/api/internal/cvs-sync`
   dan `RALULU_SYNC_TOKEN` yang sama).
3. **Tes dulu tanpa menyentuh database**: `./run.sh --no-upload`, cek `output/last_run.json`.
4. Tes upload sekali manual (`./run.sh`), cek panel Audit Logs.
5. Baru aktifkan jadwal (lihat bawah).

## Jadwal 03:00

Permintaan klien: 03:00 JKT. README scraper menulis 03:00 Taipei. Kedua zona berbeda 1 jam
(WIB = UTC+7, Taiwan = UTC+8) → **konfirmasi ke klien** zona mana yang dimaksud. Gunakan systemd
timer atau cron dengan `CRON_TZ`, dan pastikan jalan pertama sesuai jam yang diharapkan.

```cron
CRON_TZ=Asia/Jakarta
0 3 * * * cd /opt/ralulu-store-sync && /usr/bin/flock -n /tmp/ralulu-store-sync.lock ./run.sh >> /opt/ralulu-store-sync/output/cron.log 2>&1
```

## Perubahan pada paket scraper

`sync.py` asli hanya mengunggah kalau **kedua** chain sukses, sehingga kegagalan tidak pernah
sampai ke Audit Logs, dan mengirim semuanya dalam satu request (±3 MB, ditolak nginx 413). Blok upload
diganti fungsi `upload()` yang mengirim potongan lalu commit; laporan selalu dikirim, dan `all_stores`
sudah hanya berisi chain yang lolos validasi. Logika scraping tidak disentuh.
