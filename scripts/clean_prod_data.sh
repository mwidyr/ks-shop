#!/usr/bin/env bash
# Membersihkan semua data TRANSAKSIONAL/DEMO di database production, MENYISAKAN:
#   - users, roles, role_tab_access, auth_tokens        (akun staf & login)
#   - app_settings, store_settings, pickup_chains,
#     categories                                        (konfigurasi inti biar app tetap jalan)
#   - schema_migrations                                  (JANGAN PERNAH disentuh - tracking migrasi)
#
# Semua tabel LAIN (products, orders, customers, hosts, suppliers, purchases,
# promotions, live_sessions, dst - otomatis terdeteksi dari information_schema, tidak
# di-hardcode supaya tidak basi kalau ada migrasi/tabel baru nanti) akan DIKOSONGKAN TOTAL
# dan ID-nya direset ke 1 (RESTART IDENTITY).
#
# TIDAK auto-jalan dari mana pun - bukan migration, tidak dipanggil saat startup container,
# tidak ada cron. Cuma jalan kalau script ini dieksekusi manual secara eksplisit:
#
#   cd ~/ks-shop   (root repo di VPS, folder yang ada docker-compose.prod.yml & .env)
#   bash scripts/clean_prod_data.sh
#
# Selalu bikin backup penuh (pg_dump) dulu sebelum menghapus apa pun, dan minta konfirmasi
# ketik manual sebelum benar-benar jalan.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f docker-compose.prod.yml ]; then
  echo "Error: jalankan script ini dari root repo (folder yang ada docker-compose.prod.yml)." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "Error: file .env tidak ditemukan di root repo." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .env

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "=========================================================================="
echo "  Ini akan MENGOSONGKAN SEMUA DATA di database production, KECUALI:"
echo "    - users, roles, role_tab_access, auth_tokens   (akun staf & login)"
echo "    - app_settings, store_settings, pickup_chains, categories (konfigurasi)"
echo "    - schema_migrations (internal, tidak pernah disentuh)"
echo
echo "  Semua produk, order, customer, host, supplier, purchase, promo, live session,"
echo "  dll AKAN HILANG TOTAL dan ID-nya reset ke 1."
echo
echo "  Tindakan ini TIDAK BISA DIBATALKAN kecuali lewat file backup yang dibuat di bawah."
echo "=========================================================================="
echo

BACKUP_FILE="backup_before_clean_$(date +%Y%m%d_%H%M%S).sql"
echo "Membuat backup penuh dulu -> $BACKUP_FILE"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"
echo "Backup selesai ($(du -h "$BACKUP_FILE" | cut -f1)). Simpan file ini di tempat aman / download ke lokal."
echo

read -r -p "Ketik PERSIS 'HAPUS DATA' untuk lanjut, atau Ctrl+C untuk batal: " CONFIRM
if [ "$CONFIRM" != "HAPUS DATA" ]; then
  echo "Dibatalkan - tidak ada yang diubah."
  exit 1
fi

echo
echo "Menjalankan pembersihan..."
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
DO $$
DECLARE
    preserve_tables text[] := ARRAY[
        'users', 'roles', 'role_tab_access', 'auth_tokens',
        'app_settings', 'store_settings', 'pickup_chains', 'categories',
        'schema_migrations'
    ];
    tbl text;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> ALL(preserve_tables)
    LOOP
        EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', tbl);
        RAISE NOTICE 'Dikosongkan: %', tbl;
    END LOOP;
END $$;
SQL

echo
echo "Selesai. Backup tersimpan di: $BACKUP_FILE"
echo
echo "Catatan: kalau foto produk disimpan lokal di VPS (CLOUDINARY_* kosong di .env), file"
echo "gambarnya sendiri masih ada di volume Docker 'backend_uploads' walau row product_images"
echo "sudah kosong. Itu tidak dihapus script ini (beda concern - filesystem, bukan database)."
echo "Hapus manual kalau mau bersih total: docker volume rm ks-shop_backend_uploads (setelah"
echo "stack dimatikan)."
