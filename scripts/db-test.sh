#!/usr/bin/env bash
# Corre TODAS las migraciones sobre un Postgres 16 vacío y después los
# escenarios de supabase/tests/*.test.sql. Es la única forma de probar RLS y
# las funciones de la base sin tocar el proyecto de Supabase.
#
#   scripts/db-test.sh                         levanta un postgres:16 descartable en Docker
#   DB_TEST_URL=postgres://postgres@localhost scripts/db-test.sh
#                                              usa un servidor propio: crea y borra la base mrdrop_test
#
# Cada migración corre en su propia transacción (-1), como en el SQL Editor:
# así se detecta lo que el Editor rechazaría, como usar un valor de enum en la
# misma transacción que lo agrega (por eso 0012 y 0013 van separadas).
set -euo pipefail
cd "$(dirname "$0")/.."

export PGOPTIONS='-c client_min_messages=warning'

if [[ -n "${DB_TEST_URL:-}" ]]; then
  admin_url="${DB_TEST_URL%/}"
  psql -q "$admin_url/postgres" -c 'drop database if exists mrdrop_test' -c 'create database mrdrop_test'
  trap 'psql -q "$admin_url/postgres" -c "drop database if exists mrdrop_test"' EXIT
  run() { psql -q -X -v ON_ERROR_STOP=1 "$admin_url/mrdrop_test" "$@"; }
  root="."
else
  name="mrdrop-dbtest-$$"
  docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test \
    -v "$PWD/supabase:/supabase:ro" postgres:16 >/dev/null
  trap 'docker rm -f "$name" >/dev/null' EXIT
  # Por TCP: durante el init la imagen levanta un servidor temporal solo en el
  # socket, y conectarse ahí da una base que se reinicia en el medio.
  until docker exec "$name" pg_isready -q -h 127.0.0.1 -U postgres; do sleep 0.5; done
  run() { docker exec -i -e PGOPTIONS "$name" psql -q -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres "$@"; }
  root=""
fi

run -f "$root/supabase/tests/_setup.sql" >/dev/null
for f in supabase/migrations/*.sql; do
  run -1 -f "$root/$f" >/dev/null || { echo "✗ migración $f"; exit 1; }
done
echo "✓ migraciones"
for f in supabase/tests/*.test.sql; do
  run -f "$root/$f" >/dev/null || { echo "✗ $f"; exit 1; }
  echo "✓ $f"
done
