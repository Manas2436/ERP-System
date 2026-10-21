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

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
if [ "$DB_NAME" != "college_erp" ]; then
  echo "Refusing to reset '$DB_NAME'; this development runner only manages college_erp." >&2
  exit 2
fi

PHASES="schema constraints functions procedures triggers views seed"
MODULES=$(ls -d [0-9][0-9]_*/ | sed 's#/##' | sort)

has_sql() {  # true if the file has at least one non-comment, non-blank line
  sed -e '/^[[:space:]]*--/d' -e '/^[[:space:]]*$/d' "$1" | grep -q .
}

run_file() {
  echo "  -> $1"
  local output
  if [ -n "${MYSQL_CMD:-}" ]; then
    if ! output=$( $MYSQL_CMD --default-character-set=utf8mb4 "$DB_NAME" < "$1" 2>&1 ); then
      printf '%s\n' "$output"
      echo "FAILED in $1"
      exit 1
    fi
  else
    local -a mysql_args=(--default-character-set=utf8mb4 --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER")
    if [ -n "${DB_PASSWORD:-}" ]; then mysql_args+=(--password="$DB_PASSWORD"); fi
    if ! output=$(mysql "${mysql_args[@]}" "$DB_NAME" < "$1" 2>&1); then
      printf '%s\n' "$output"
      echo "FAILED in $1"
      exit 1
    fi
  fi
  printf '%s\n' "$output"
  if [[ "$1" == */tests.sql ]] && grep -Eiq '(^|[[:space:]])FAIL([[:space:]]|$)' <<< "$output"; then
    echo
    echo "TEST FAILURE reported in $1"
    exit 1
  fi
}

run_admin_sql() {
  if [ -n "${MYSQL_CMD:-}" ]; then
    $MYSQL_CMD --default-character-set=utf8mb4 -e "$1"
  else
    local -a mysql_args=(--default-character-set=utf8mb4 --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER")
    if [ -n "${DB_PASSWORD:-}" ]; then mysql_args+=(--password="$DB_PASSWORD"); fi
    mysql "${mysql_args[@]}" -e "$1"
  fi
}

echo "Resetting database '$DB_NAME'"
run_admin_sql "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
run_admin_sql "SET GLOBAL log_bin_trust_function_creators = 1;" || echo "(could not set log_bin_trust_function_creators; function creation may fail)"

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
run_admin_sql "USE \`$DB_NAME\`; SELECT COUNT(*) AS tables_created FROM information_schema.tables WHERE table_schema = '$DB_NAME' AND table_type = 'BASE TABLE';"
echo "OK: database built."
