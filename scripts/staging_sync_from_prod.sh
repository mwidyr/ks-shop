#!/usr/bin/env bash
# MENYALIN SEMUA data production (database + file upload) ke server TESTING lewat SSH.
# Dijalankan DI VPS PRODUCTION (admin.ralulu.com):
#
#   cd ~/ks-shop
#   cp scripts/staging_sync.conf.example scripts/staging_sync.conf   # lalu isi (sekali saja)
#   bash scripts/staging_sync_from_prod.sh --dry-run                # cek koneksi, ukuran, disk - tidak menghapus apa pun
#   bash scripts/staging_sync_from_prod.sh                          # salin sungguhan
#
# Production HANYA DIBACA (pg_dump = snapshot konsisten, file dibaca read-only). Yang dihapus hanyalah
# data di server TESTING, lewat scripts/staging_wipe.sh yang dijalankan di sana (dengan pengaman
# ENV_NAME=staging). Snapshot sesaat, bukan sinkronisasi terus-menerus: jalankan ulang untuk menyegarkan
# (selalu hapus dulu).
#
# Setelah disalin, kanal keluar yang tersimpan di database (token bot & chat id Telegram) dimatikan di
# server testing (scripts/staging_neutralize.sql). Data pelanggan TIDAK diubah/disamarkan.

set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    *) echo "Opsi tidak dikenal: $a" >&2; exit 2 ;;
  esac
done

[ -f docker-compose.prod.yml ] || { echo "Error: jalankan dari root repo (ada docker-compose.prod.yml)." >&2; exit 1; }
[ -f .env ] || { echo "Error: file .env tidak ditemukan." >&2; exit 1; }
[ -f scripts/staging_sync.conf ] || { echo "Error: scripts/staging_sync.conf belum ada (salin dari staging_sync.conf.example)." >&2; exit 1; }

# shellcheck disable=SC1091
set -a; source .env; set +a
# shellcheck disable=SC1091
source scripts/staging_sync.conf
STAGING_PORT="${STAGING_PORT:-22}"
STAGING_DIR="${STAGING_DIR:-ks-shop}"
STAGING_USER="${STAGING_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/staging_sync}"

# pengaman sisi production
if [ "${ENV_NAME:-}" = "staging" ]; then
  echo "DITOLAK: .env di sini berisi ENV_NAME=staging - script ini hanya untuk dijalankan di PRODUCTION." >&2; exit 1
fi
case "${STAGING_HOST:-}" in
  ""|localhost|127.*|::1|*ralulu.com*) echo "DITOLAK: STAGING_HOST ('${STAGING_HOST:-}') tidak boleh kosong / localhost / ralulu.com." >&2; exit 1 ;;
esac
[ -f "$SSH_KEY" ] || { echo "Error: SSH key '$SSH_KEY' tidak ditemukan. Buat: ssh-keygen -t ed25519 -f $SSH_KEY (lalu tambahkan .pub ke authorized_keys VPS testing)." >&2; exit 1; }

COMPOSE="docker compose -f docker-compose.prod.yml"
SSH=(ssh -i "$SSH_KEY" -p "$STAGING_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$STAGING_USER@$STAGING_HOST")
# perintah di server testing: pindah ke folder repo, muat .env, lalu jalankan
remote() { "${SSH[@]}" "cd '$STAGING_DIR' && set -a && . ./.env && set +a && $*"; }
RCOMPOSE="docker compose -f docker-compose.prod.yml"

step() { echo; echo "==> $*"; }
fail() { echo "GAGAL: $*" >&2; exit 1; }

# ------------------------------------------------------------------ preflight
step "Preflight"
"${SSH[@]}" true 2>/dev/null || fail "tidak bisa SSH ke $STAGING_USER@$STAGING_HOST:$STAGING_PORT dengan key $SSH_KEY"
remote 'test -f docker-compose.prod.yml' || fail "folder '$STAGING_DIR' di server testing bukan repo (tidak ada docker-compose.prod.yml)"
[ "$(remote 'echo ${ENV_NAME:-}')" = "staging" ] || fail "server testing: .env tidak berisi ENV_NAME=staging (tidak akan menghapus apa pun)"
case "$(remote 'echo ${APP_BASE_URL:-}')" in
  *ralulu.com*) fail "server testing: APP_BASE_URL mengandung ralulu.com - ini terlihat seperti production" ;;
esac
[ "$(remote 'echo $POSTGRES_DB')" = "$POSTGRES_DB" ] || echo "Catatan: nama database di testing berbeda dari production (dipakai nama masing-masing)."

LOCAL_REV="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
REMOTE_REV="$(remote 'git rev-parse --short HEAD 2>/dev/null || echo ?')"
echo "  versi kode: production=$LOCAL_REV testing=$REMOTE_REV"
[ "$LOCAL_REV" = "$REMOTE_REV" ] || echo "  PERINGATAN: versi kode berbeda. Sebaiknya deploy versi yang sama di testing dulu (skema database mengikuti production)."

DB_BYTES="$($COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT pg_database_size(current_database())" | tr -d '[:space:]')"
UP_CID="$($COMPOSE ps -aq backend | head -n1)"
LOCAL_VOL=""
[ -n "$UP_CID" ] && LOCAL_VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' "$UP_CID")"
UP_KB=0
[ -n "$LOCAL_VOL" ] && UP_KB="$(docker run --rm -v "$LOCAL_VOL":/u:ro --entrypoint sh postgres:16-alpine -c 'du -sk /u | cut -f1')"
NEED_KB=$(( DB_BYTES / 1024 * 2 + UP_KB * 2 ))
FREE_KB="$(remote "df -Pk \"\$(docker info -f '{{.DockerRootDir}}')\" | awk 'NR==2{print \$4}'")"
echo "  database: $((DB_BYTES/1024/1024)) MB, upload: $((UP_KB/1024)) MB; butuh ~$((NEED_KB/1024)) MB bebas di testing, tersedia $((FREE_KB/1024)) MB"
[ "$FREE_KB" -ge "$NEED_KB" ] || fail "disk di server testing tidak cukup"

if [ "$DRY" = "1" ]; then
  echo; echo "Dry run selesai: koneksi, pengaman, versi, dan ruang disk OK. Tidak ada yang diubah."
  exit 0
fi

echo
echo "=========================================================================="
echo "  SEMUA data di server TESTING ($STAGING_HOST) akan DIHAPUS lalu diganti salinan production."
echo "  Production hanya dibaca. Data pelanggan disalin APA ADANYA (tanpa disamarkan)."
echo "=========================================================================="
read -r -p "Ketik PERSIS 'KIRIM KE $STAGING_HOST' untuk lanjut: " CONFIRM
[ "$CONFIRM" = "KIRIM KE $STAGING_HOST" ] || { echo "Dibatalkan - tidak ada yang diubah."; exit 1; }

trap 'echo; echo "GAGAL di tengah jalan: server testing mungkin setengah terisi. Production tidak berubah. Jalankan ulang script ini (selalu hapus dulu)." >&2' ERR

# ------------------------------------------------------------------ 1. hapus data testing
step "1/5 Menghapus data di server testing"
remote 'bash scripts/staging_wipe.sh --yes --no-start'

# ------------------------------------------------------------------ 2. database
step "2/5 Menyalin database (pg_dump -> pg_restore, lewat SSH)"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -Fc --no-owner --no-privileges "$POSTGRES_DB" \
  | "${SSH[@]}" "cd '$STAGING_DIR' && set -a && . ./.env && set +a && $RCOMPOSE exec -T db pg_restore -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --no-owner --no-privileges"

# ------------------------------------------------------------------ 3. file upload
step "3/5 Menyalin file upload"
RVOL="$(remote "$RCOMPOSE up --no-start backend >/dev/null 2>&1; $RCOMPOSE ps -aq backend | head -n1 | xargs docker inspect -f '{{range .Mounts}}{{if eq .Destination \"/app/uploads\"}}{{.Name}}{{end}}{{end}}'")"
if [ -n "$LOCAL_VOL" ] && [ -n "$RVOL" ]; then
  docker run --rm -v "$LOCAL_VOL":/src:ro --entrypoint tar postgres:16-alpine -C /src -cf - . \
    | "${SSH[@]}" "docker run --rm -i -v '$RVOL':/dst --entrypoint tar postgres:16-alpine -C /dst -xf -"
else
  echo "  Peringatan: volume upload tidak ditemukan (production='$LOCAL_VOL', testing='$RVOL') - file tidak disalin."
fi

# ------------------------------------------------------------------ 4. matikan kanal keluar
step "4/5 Mematikan kanal keluar di server testing (Telegram)"
"${SSH[@]}" "cd '$STAGING_DIR' && set -a && . ./.env && set +a && $RCOMPOSE exec -T db psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"" < scripts/staging_neutralize.sql

# ------------------------------------------------------------------ 5. nyalakan + verifikasi
step "5/5 Menyalakan aplikasi testing dan memverifikasi"
remote "$RCOMPOSE up -d backend web store"
COUNTS_SQL="SELECT 'users', count(*) FROM users UNION ALL SELECT 'products', count(*) FROM products UNION ALL SELECT 'product_variants', count(*) FROM product_variants
 UNION ALL SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'order_items', count(*) FROM order_items UNION ALL SELECT 'customers', count(*) FROM customers
 UNION ALL SELECT 'hosts', count(*) FROM hosts UNION ALL SELECT 'content_pages', count(*) FROM content_pages ORDER BY 1"
LOCAL_COUNTS="$($COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F' ' -c "$COUNTS_SQL")"
REMOTE_COUNTS="$(remote "$RCOMPOSE exec -T db psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tA -F' ' -c \"$COUNTS_SQL\"")"
echo "  tabel               production  testing"
# kedua sisi memakai query yang sama (urutan sama), jadi baris-barisnya sejajar
paste -d' ' <(echo "$LOCAL_COUNTS") <(echo "$REMOTE_COUNTS" | cut -d' ' -f2) | awk '{printf "  %-18s %10s %8s\n",$1,$2,$3}'
if [ "$LOCAL_COUNTS" != "$REMOTE_COUNTS" ]; then
  trap - ERR
  fail "jumlah baris production dan testing berbeda (kalau ada transaksi baru saat disalin, jalankan ulang; selain itu cek log)"
fi
LOCAL_FILES="-"; REMOTE_FILES="-"
[ -n "$LOCAL_VOL" ] && LOCAL_FILES="$(docker run --rm -v "$LOCAL_VOL":/u:ro --entrypoint sh postgres:16-alpine -c 'find /u -type f | wc -l' | tr -d '[:space:]')"
[ -n "$RVOL" ] && REMOTE_FILES="$("${SSH[@]}" "docker run --rm -v '$RVOL':/u:ro --entrypoint sh postgres:16-alpine -c 'find /u -type f | wc -l'" | tr -d '[:space:]')"
echo "  file upload: production=$LOCAL_FILES testing=$REMOTE_FILES"
[ "$LOCAL_FILES" = "$REMOTE_FILES" ] || echo "  PERINGATAN: jumlah file upload berbeda."
trap - ERR

echo
echo "SELESAI. Server testing berisi salinan production:"
echo "  admin   : http://$STAGING_HOST:8081 (atau port yang Anda buka di .env testing)"
echo "  website : http://$STAGING_HOST:8082"
echo "Login memakai akun STAFF production yang sama. Batasi akses server testing lewat firewall (ada data pelanggan asli)."
