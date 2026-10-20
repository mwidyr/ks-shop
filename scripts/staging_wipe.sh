#!/usr/bin/env bash
# MENGHAPUS SEMUA DATA di server TESTING (database + file upload) lalu menyalakan aplikasi kosong lagi.
# Dijalankan DI VPS TESTING (bukan production):
#
#   cd ~/ks-shop
#   bash scripts/staging_wipe.sh
#
# Pengaman (script menolak jalan kalau salah satu tidak terpenuhi):
#   - .env harus berisi  ENV_NAME=staging
#   - APP_BASE_URL tidak boleh mengandung "ralulu.com"
#   - harus mengetik persis 'HAPUS DATA TESTING'
# Selalu bikin backup (pg_dump) dulu ke backups/ (3 terakhir disimpan).
#
# Opsi (dipakai oleh staging_sync_from_prod.sh):
#   --yes        tanpa pertanyaan konfirmasi
#   --no-start   biarkan backend/web/store mati sesudah dihapus (database tetap hidup, kosong)

set -euo pipefail
cd "$(dirname "$0")/.."

YES=0
NO_START=0
for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    --no-start) NO_START=1 ;;
    *) echo "Opsi tidak dikenal: $a" >&2; exit 2 ;;
  esac
done

[ -f docker-compose.prod.yml ] || { echo "Error: jalankan dari root repo (ada docker-compose.prod.yml)." >&2; exit 1; }
[ -f .env ] || { echo "Error: file .env tidak ditemukan." >&2; exit 1; }

# shellcheck disable=SC1091
set -a; source .env; set +a

if [ "${ENV_NAME:-}" != "staging" ]; then
  echo "DITOLAK: .env tidak berisi ENV_NAME=staging. Script ini hanya boleh jalan di server TESTING." >&2
  exit 1
fi
case "${APP_BASE_URL:-}" in
  *ralulu.com*) echo "DITOLAK: APP_BASE_URL mengandung ralulu.com - ini terlihat seperti server production." >&2; exit 1 ;;
esac

COMPOSE="docker compose -f docker-compose.prod.yml"
psql_admin() { $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 "$@"; }

echo "=========================================================================="
echo "  SEMUA data di server TESTING ini akan DIHAPUS:"
echo "    - database '$POSTGRES_DB' (di-drop dan dibuat ulang, kosong)"
echo "    - semua file upload (foto produk, dll)"
echo "  Server: ${APP_BASE_URL:-?}"
echo "=========================================================================="

if [ "$YES" != "1" ]; then
  read -r -p "Ketik PERSIS 'HAPUS DATA TESTING' untuk lanjut: " CONFIRM
  [ "$CONFIRM" = "HAPUS DATA TESTING" ] || { echo "Dibatalkan - tidak ada yang diubah."; exit 1; }
fi

# 1. backup dulu (kalau database-nya sudah ada)
mkdir -p backups
if $COMPOSE up -d db >/dev/null 2>&1 && $COMPOSE exec -T db pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
  if $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" | grep -q 1; then
    BACKUP="backups/staging_before_wipe_$(date +%Y%m%d_%H%M%S).dump"
    echo "Backup dulu -> $BACKUP"
    $COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$BACKUP"
    # simpan hanya 3 backup terakhir
    # shellcheck disable=SC2012
    ls -1t backups/staging_before_wipe_*.dump 2>/dev/null | tail -n +4 | xargs -r rm -f
  fi
fi

# 2. hentikan aplikasi
echo "Menghentikan backend / web / store ..."
$COMPOSE stop backend web store >/dev/null 2>&1 || true

# 3. drop + buat ulang database
echo "Menghapus database '$POSTGRES_DB' ..."
psql_admin -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)"
psql_admin -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""

# 4. kosongkan volume upload (nama volume dibaca dari container backend, bukan ditebak)
$COMPOSE up --no-start backend >/dev/null 2>&1 || true
CID="$($COMPOSE ps -aq backend | head -n1)"
UPLOADS_VOL=""
if [ -n "$CID" ]; then
  UPLOADS_VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' "$CID")"
fi
if [ -n "$UPLOADS_VOL" ]; then
  echo "Mengosongkan volume upload '$UPLOADS_VOL' ..."
  docker run --rm -v "$UPLOADS_VOL":/u --entrypoint sh postgres:16-alpine -c 'find /u -mindepth 1 -delete'
else
  echo "Peringatan: volume upload tidak ditemukan - dilewati."
fi

# 5. nyalakan lagi (backend membuat ulang skema lewat migrasi)
if [ "$NO_START" = "1" ]; then
  echo "Selesai. Database kosong; backend/web/store sengaja dibiarkan mati (--no-start)."
  exit 0
fi
echo "Menyalakan aplikasi ..."
$COMPOSE up -d backend web store
for _ in $(seq 1 60); do
  n="$($COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -n "$n" ] && [ "$n" -gt 10 ] 2>/dev/null; then
    echo "Selesai. Aplikasi hidup dengan data kosong ($n tabel dibuat oleh migrasi)."
    exit 0
  fi
  sleep 2
done
echo "Peringatan: aplikasi belum siap dalam 2 menit - cek: $COMPOSE logs backend" >&2
exit 1
