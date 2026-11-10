#!/usr/bin/env bash
# ============================================================================
# Lokale Staging-Umgebung mit ECHTEM Supabase-Stack (PostgREST, GoTrue, Kong)
# und Browser-Smoke-Tests (Playwright). NUR LOKAL, synthetische Daten.
#
# * supabase start --workdir staging, Ports 553xx (nur 127.0.0.1)
# * keine Verbindung zu Produktion; produktive URL und Key werden in den
#   ausgelieferten Kopien durch die lokalen Werte ersetzt und nie ausgegeben
#
# Aufruf:
#   scripts/staging.sh start          Stack starten, Ist-Zustand (Baseline) + Seed
#   scripts/staging.sh migriere 01    Migration 01 anwenden (01|02|03|04|09|R01|R09)
#   scripts/staging.sh frontend alt   altes Frontend (main) auf :55380 ausliefern
#   scripts/staging.sh frontend neu   neues Frontend (Arbeitsstand) auf :55381
#   scripts/staging.sh smoke <stufe>  Playwright-Smoke-Tests (stufe: ist|01|neu|09)
#   scripts/staging.sh lauf01         Komplettlauf Migration 01: ist → 01 → R01 → 01
#   scripts/staging.sh stop           Stack und Webserver beenden, Daten verwerfen
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SW="$ROOT/staging"
DBURL="postgresql://postgres:postgres@127.0.0.1:55322/postgres"
PROD_URL_RE='https://nwutgxjnverlvmkrpiep\.supabase\.co'
PROD_KEY_RE='sb_publishable_[A-Za-z0-9_-]+'
export PGOPTIONS="-c client_min_messages=warning"
psqlf() { psql -X -q -v ON_ERROR_STOP=1 "$DBURL" "$@"; }

lokale_werte() {   # setzt API_URL und ANON_KEY, ohne sie auszugeben
  eval "$(supabase status --workdir "$SW" -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=')"
  ANON_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}"
}

migration_datei() {
  case "$1" in
    01) ls "$ROOT"/supabase/migrations/20261110000100_*.sql ;;
    02) ls "$ROOT"/supabase/migrations/20261110000200_*.sql ;;
    03) ls "$ROOT"/supabase/migrations/20261110000300_*.sql ;;
    04) ls "$ROOT"/supabase/migrations/20261110000400_*.sql ;;
    09) ls "$ROOT"/supabase/migrations/20261110000900_*.sql ;;
    R01) ls "$ROOT"/supabase/rollback/R01_*.sql ;;
    R09) ls "$ROOT"/supabase/rollback/R09_*.sql ;;
    *) echo "unbekannte Migration: $1" >&2; exit 2 ;;
  esac
}

start() {
  # Supabase wendet staging/supabase/migrations beim Start an: dort liegt nur
  # die Baseline (Ist-Zustand). Echte Migrationen folgen gezielt per "migriere".
  rm -rf "$SW/supabase/migrations"; mkdir -p "$SW/supabase/migrations"
  cp "$ROOT/supabase/baseline/00_produktion_rekonstruiert.sql" "$SW/supabase/migrations/00000000000000_baseline.sql"
  cat "$ROOT/supabase/tests/_seed.sql" "$SW/seed_staging.sql" "$ROOT/supabase/tests/_sr_platzhalter.sql" > "$SW/supabase/seed.sql"
  supabase start --workdir "$SW"
  echo "✓ Staging läuft (API 127.0.0.1:55321, DB 127.0.0.1:55322), Ist-Zustand wie Produktion"
}

frontend() {
  local art="$1" port dir
  lokale_werte
  if [ "$art" = alt ]; then port=55380; dir="$SW/www-alt"; else port=55381; dir="$SW/www-neu"; fi
  rm -rf "$dir"; mkdir -p "$dir"
  if [ "$art" = alt ]; then git -C "$ROOT" archive main | tar -x -C "$dir"
  else git -C "$ROOT" ls-files -z | (cd "$ROOT" && xargs -0 tar -c) | tar -x -C "$dir"; fi
  find "$dir" -maxdepth 2 \( -name '*.html' -o -name '*.js' \) -print0 | xargs -0 sed -i -E \
    -e "s#${PROD_URL_RE}#${API_URL}#g" -e "s#${PROD_KEY_RE}#${ANON_KEY}#g" \
    -e "s#https://spielplanapp\.christianaust\.eu/#http://127.0.0.1:${port}/#g"
  if grep -rqE "$PROD_URL_RE" "$dir"; then echo "✗ produktive URL noch enthalten – Abbruch" >&2; exit 1; fi
  (cd "$dir" && nohup python3 -m http.server "$port" --bind 127.0.0.1 >"$SW/http-$art.log" 2>&1 & echo $! > "$SW/http-$art.pid")
  echo "✓ Frontend $art: http://127.0.0.1:$port/ (gegen lokalen Stack)"
}

smoke() {
  local stufe="$1"
  lokale_werte
  STAGING_API_URL="$API_URL" STAGING_ANON_KEY="$ANON_KEY" STAGING_STUFE="$stufe" npx --no-install playwright test --config "$ROOT/tests/e2e/playwright.config.js"
}

stop() {
  for f in "$SW"/http-*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
  supabase stop --workdir "$SW" --no-backup || true
  rm -rf "$SW/www-alt" "$SW/www-neu" "$SW/supabase/migrations" "$SW/supabase/seed.sql" "$SW/supabase/.temp" "$SW"/http-*.log
}

case "${1:-}" in
  start)    start ;;
  migriere) psqlf -f "$(migration_datei "$2")"; echo "✓ angewendet: $2" ;;
  frontend) frontend "$2" ;;
  smoke)    smoke "$2" ;;
  lauf01)
    start; frontend alt
    smoke ist
    psqlf -f "$(migration_datei 01)"; smoke 01
    psqlf -f "$(migration_datei R01)"; smoke ist
    psqlf -f "$(migration_datei 01)"; smoke 01
    echo "✓ Staging-Lauf Migration 01 bestanden" ;;
  stop)     stop ;;
  *) sed -n 2,20p "$0"; exit 2 ;;
esac
