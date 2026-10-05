#!/usr/bin/env bash
# Memulihkan HANYA tabel users (+ auth_tokens) dari backup pg_dump yang dibuat otomatis oleh
# clean_prod_data.sh, TANPA mengembalikan tabel lain (jangan sampai data demo yang sengaja
# dihapus - products/orders/customers/dst - ikut balik lagi).
#
# Caranya: load backup penuh ke database sementara (scratch), lalu copy HANYA baris dari
# users + auth_tokens dari database sementara itu ke database production yang sekarang sudah
# kosong di kedua tabel tersebut. Database sementara dihapus lagi di akhir.
#
# Pakai:
#   cd ~/ks-shop
#   bash scripts/recover_users_table.sh backup_before_clean_20261005_161530.sql
#     (ganti dengan nama file backup yang benar - lihat dengan: ls backup_before_clean_*.sql)

set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -ne 1 ]; then
  echo "Pakai: bash scripts/recover_users_table.sh <nama_file_backup.sql>" >&2
  echo "Lihat file backup yang ada: ls backup_before_clean_*.sql" >&2
  exit 1
fi
BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file '$BACKUP_FILE' tidak ditemukan." >&2
  exit 1
fi
if [ ! -f docker-compose.prod.yml ] || [ ! -f .env ]; then
  echo "Error: jalankan dari root repo (folder yang ada docker-compose.prod.yml & .env)." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .env
COMPOSE="docker compose -f docker-compose.prod.yml"
SCRATCH_DB="ordermgmt_restore_scratch"

echo "1/5 Membuat database sementara '$SCRATCH_DB' di dalam container db..."
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH_DB;"
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $SCRATCH_DB;"

echo "2/5 Memuat backup penuh ke database sementara (bisa makan waktu beberapa menit)..."
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$SCRATCH_DB" < "$BACKUP_FILE" > /dev/null

echo "3/5 Mengambil baris users + auth_tokens dari database sementara..."
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$SCRATCH_DB" \
  --data-only --table=users --table=auth_tokens --column-inserts > /tmp/users_recovered.sql

echo "4/5 Memasukkan baris itu ke database production (tabel users & auth_tokens saat ini kosong)..."
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /tmp/users_recovered.sql

echo "5/5 Membersihkan database sementara..."
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $SCRATCH_DB;"

echo
echo "Selesai. Cek jumlah user yang kembali:"
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, name, email, is_active FROM users ORDER BY id;"
echo
echo "Coba login sekarang. Kalau sudah bisa, hapus file /tmp/users_recovered.sql kalau mau:"
echo "  rm /tmp/users_recovered.sql"
