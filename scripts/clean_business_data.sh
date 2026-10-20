#!/usr/bin/env bash
# Mengosongkan data bisnis untuk permintaan klien, HANYA di menu berikut:
#   Order Management, Shipping Workbench, Stock Management, Customer Management,
#   Procurement Orders, Purchase Requisitions, Restock Planning, Promotion Management
#
# Yang TIDAK disentuh: produk & varian, supplier, user/staf, member storefront, host, live session,
# konten, semua pengaturan. Halaman yang turunan dari order (dashboard, analytics, Restock Planning)
# otomatis jadi nol.
#
#   cd ~/ks-shop
#   bash scripts/clean_business_data.sh --dry-run   # cuma tampilkan jumlah baris, tidak mengubah apa pun
#   bash scripts/clean_business_data.sh             # backup -> konfirmasi -> hapus
#
# Selalu bikin backup (pg_dump -Fc) dulu dan minta konfirmasi ketik manual.

set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0; YES=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    *) echo "Opsi tidak dikenal: $a" >&2; exit 1 ;;
  esac
done

[ -f docker-compose.prod.yml ] || { echo "Error: jalankan dari root repo (ada docker-compose.prod.yml)." >&2; exit 1; }
[ -f .env ] || { echo "Error: .env tidak ditemukan." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
COMPOSE="docker compose -f docker-compose.prod.yml"
PSQL="$COMPOSE exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 -X -q"

# Tabel yang dikosongkan (urutan tidak penting: satu perintah TRUNCATE, tanpa CASCADE, jadi Postgres
# menolak kalau ada tabel lain yang masih mengacu ke salah satunya).
WIPE="order_export_log shipping_import_issues shipping_import_log shipping_batch_orders shipping_batches
promotion_redemptions host_coupons member_coupons promotions
product_reviews web_return_requests returns order_shipment_group_members order_shipment_groups order_attachments
order_status_log order_items orders customer_labels customers
purchase_requisition_supplier_notes purchase_requisition_items purchase_requisition_suppliers purchase_requisitions
purchase_item_batches purchase_change_log purchase_items purchases stock_movements"
# Tabel yang harus tetap utuh (dibandingkan sebelum/sesudah).
KEEP="products product_variants suppliers users members hosts live_sessions content_pages stock_buckets"

counts() { # $1 = daftar tabel
  local sql="" t
  for t in $1; do sql+="SELECT '$t' AS tabel, count(*) AS baris FROM $t UNION ALL "; done
  $PSQL -c "${sql% UNION ALL } ORDER BY 1"
}

echo "== Jumlah baris SEKARANG: tabel yang akan DIKOSONGKAN =="
counts "$WIPE"
echo "== Tabel yang harus TETAP =="
counts "$KEEP" | tee /tmp/.keep_before.$$ >/dev/null
cat /tmp/.keep_before.$$

if [ "$DRY" = 1 ]; then
  rm -f /tmp/.keep_before.$$
  echo "Dry-run selesai - tidak ada yang diubah."; exit 0
fi

echo
echo "Stok (stock_buckets) TIDAK dihapus barisnya; angka stok direset ke 0, minimum_stock tetap."
echo "Tindakan ini tidak bisa dibatalkan kecuali lewat backup di bawah."
mkdir -p backups
BACKUP="backups/before_clean_business_$(date +%Y%m%d_%H%M%S).dump"
echo "Membuat backup -> $BACKUP"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$BACKUP"
echo "Backup selesai ($(du -h "$BACKUP" | cut -f1))."
ls -1t backups/before_clean_business_*.dump | tail -n +4 | while read -r f; do rm -f "$f"; done

if [ "$YES" != 1 ]; then
  read -r -p "Ketik PERSIS 'HAPUS DATA BISNIS' untuk lanjut: " C
  [ "$C" = "HAPUS DATA BISNIS" ] || { echo "Dibatalkan - tidak ada yang diubah."; rm -f /tmp/.keep_before.$$; exit 1; }
fi

# File upload yang terkait (lampiran order & foto retur). Hanya path lokal /uploads/..., bukan URL http.
FILES=$($PSQL -At -c "SELECT url FROM order_attachments WHERE url LIKE '/uploads/%'
  UNION SELECT unnest(photos) FROM web_return_requests" | grep '^/uploads/' | sed 's#^/uploads/##' | grep -E '^[A-Za-z0-9._-]+$' || true)

echo "Menghapus data..."
{
  echo "BEGIN;"
  # Tiga FK dari tabel yang DIPERTAHANKAN ke tabel yang dihapus. Postgres menolak TRUNCATE selama FK
  # itu ada (walau nilainya NULL), jadi dilepas lalu dipasang lagi persis sama di transaksi yang sama.
  echo "UPDATE users SET customer_id = NULL WHERE customer_id IS NOT NULL;"
  echo "UPDATE members SET customer_id = NULL WHERE customer_id IS NOT NULL;"
  echo "UPDATE member_ledger SET order_id = NULL WHERE order_id IS NOT NULL;"
  echo "ALTER TABLE users DROP CONSTRAINT users_customer_id_fkey;"
  echo "ALTER TABLE members DROP CONSTRAINT members_customer_id_fkey;"
  echo "ALTER TABLE member_ledger DROP CONSTRAINT member_ledger_order_id_fkey;"
  echo "TRUNCATE $(echo $WIPE | tr ' ' ',') RESTART IDENTITY;"
  echo "ALTER TABLE users ADD CONSTRAINT users_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);"
  echo "ALTER TABLE members ADD CONSTRAINT members_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);"
  echo "ALTER TABLE member_ledger ADD CONSTRAINT member_ledger_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;"
  echo "UPDATE stock_buckets SET available_stock=0, reserve_stock=0, broken_stock=0, incoming_stock=0, order_stock=0;"
  echo "DELETE FROM activity_log WHERE entity_type IN ('order','customer','shipping_batch');"
  echo "COMMIT;"
} | $PSQL

if [ -n "$FILES" ]; then
  echo "Menghapus $(echo "$FILES" | wc -l | tr -d ' ') file upload terkait..."
  # shellcheck disable=SC2086
  $COMPOSE exec -T backend sh -c 'cd /app/uploads && rm -f -- "$@"' sh $FILES || echo "(peringatan: sebagian file upload gagal dihapus)"
fi

echo
echo "== Sesudah: tabel yang dikosongkan =="
counts "$WIPE"
echo "== Sesudah: tabel yang harus TETAP (bandingkan dengan sebelumnya) =="
counts "$KEEP" > /tmp/.keep_after.$$; cat /tmp/.keep_after.$$
if diff -q <(grep -v stock_buckets /tmp/.keep_before.$$) <(grep -v stock_buckets /tmp/.keep_after.$$) >/dev/null; then
  echo "OK: tabel yang harus tetap jumlahnya sama."
else
  echo "PERINGATAN: ada perbedaan jumlah baris di tabel yang seharusnya tetap! Restore: pg_restore -d <db> --clean $BACKUP" >&2
fi
rm -f /tmp/.keep_before.$$ /tmp/.keep_after.$$
echo "Selesai. Backup: $BACKUP"
echo "Restore bila perlu: $COMPOSE exec -T db pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists < $BACKUP"
