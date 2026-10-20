#!/usr/bin/env bash
# Rebuilds the whole database from scratch, phase by phase across all modules.
# Usage: bash database/run_all.sh [--test]
set -euo pipefail
cd "$(dirname "$0")"

RUN_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --test) RUN_TESTS=1 ;;
    *) echo "Unknown option: $arg (use --test)"; exit 2 ;;
  esac
done

if [ -f ../.env ]; then set -a; . ../.env; set +a; fi
DB_NAME="${DB_NAME:-college_erp}"

if [ -z "${MYSQL_CMD:-}" ]; then
  MYSQL_CMD="docker compose -f ../docker-compose.yml exec -T mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD:-rootpass} --default-character-set=utf8mb4"
fi

PHASES="schema constraints functions procedures triggers views seed"
MODULES=$(ls -d [0-9][0-9]_*/ | sed 's#/##' | sort)

has_sql() {  # true if the file has at least one non-comment, non-blank line
  sed -e '/^[[:space:]]*--/d' -e '/^[[:space:]]*$/d' "$1" | grep -q .
}

run_file() {
  echo "  -> $1"
  if ! $MYSQL_CMD "$DB_NAME" < "$1"; then
    echo
    echo "FAILED in $1"
    exit 1
  fi
}

echo "Resetting database '$DB_NAME'"
$MYSQL_CMD -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
$MYSQL_CMD -e "SET GLOBAL log_bin_trust_function_creators = 1;" || echo "(could not set log_bin_trust_function_creators; function creation may fail)"

for phase in $PHASES; do
  echo "== phase: $phase"
  for m in $MODULES; do
    f="$m/$phase.sql"
    if [ -f "$f" ] && has_sql "$f"; then run_file "$f"; fi
  done
done

if [ "$RUN_TESTS" = "1" ]; then
  echo "== phase: tests"
  for m in $MODULES; do
    f="$m/tests.sql"
    if [ -f "$f" ] && has_sql "$f"; then run_file "$f"; fi
  done
fi

echo
$MYSQL_CMD "$DB_NAME" -e "SELECT COUNT(*) AS tables_created FROM information_schema.tables WHERE table_schema = '$DB_NAME' AND table_type = 'BASE TABLE';"
echo "OK: database built."
