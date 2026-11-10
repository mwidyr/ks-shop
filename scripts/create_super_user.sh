#!/usr/bin/env bash
# Membuat (atau mengaktifkan ulang + reset password) akun super_user di production.
# Pengganti superuser@demo.com yang sudah dinonaktifkan di production.
#
# Pakai (dari root repo di VPS):
#   bash scripts/create_super_user.sh <email> "<Nama>" [password]
# Contoh:
#   bash scripts/create_super_user.sh admin@ralulu.com "Admin Ralulu"
#     -> password acak dibuat & ditampilkan sekali di akhir.
#   bash scripts/create_super_user.sh admin@ralulu.com "Admin Ralulu" 'PasswordKuat123!'
#
# Idempotent: kalau email sudah ada -> role diset super_user, is_active=true, password di-reset.
# Hash bcrypt dibuat oleh pgcrypto (crypt + gen_salt('bf', 10)), kompatibel dengan bcrypt di backend.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo 'Pakai: bash scripts/create_super_user.sh <email> "<Nama>" [password]' >&2
  exit 1
fi
EMAIL="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
NAME="$2"
PASSWORD="${3:-}"

if [ ! -f docker-compose.prod.yml ] || [ ! -f .env ]; then
  echo "Error: jalankan dari root repo (folder yang ada docker-compose.prod.yml & .env)." >&2
  exit 1
fi
if [ -z "$PASSWORD" ]; then
  # (not "tr </dev/urandom | head": head closing the pipe makes tr exit 141, which pipefail turns into a script failure)
  PASSWORD="$(openssl rand -hex 8)"
  GENERATED=1
else
  GENERATED=0
fi
if [ "${#PASSWORD}" -lt 8 ]; then
  echo "Error: password minimal 8 karakter." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .env
COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v email="$EMAIL" -v name="$NAME" -v pw="$PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (name, email, password_hash, role_id, is_active)
VALUES (:'name', :'email', crypt(:'pw', gen_salt('bf', 10)),
        (SELECT id FROM roles WHERE name = 'super_user'), true)
ON CONFLICT (email) DO UPDATE
   SET name          = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role_id       = EXCLUDED.role_id,
       is_active     = true;

SELECT u.id, u.email, r.name AS role, u.is_active
FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.email = :'email';
SQL

echo
echo "Selesai. Login dengan:"
echo "  Email    : $EMAIL"
if [ "$GENERATED" = 1 ]; then
  echo "  Password : $PASSWORD   (acak - simpan sekarang, segera ganti lewat Manajemen Pengguna)"
else
  echo "  Password : (sesuai yang Anda berikan)"
fi
