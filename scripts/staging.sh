#!/usr/bin/env bash
# ============================================================================
# Lokale Staging-Umgebung mit ECHTEM Supabase-Stack (PostgREST, GoTrue, Kong)
# und Browser-Smoke-Tests (Playwright). NUR LOKAL, synthetische Daten.
#
# * eigenes Compose (staging/compose.yml), Ports 553xx ausschließlich an 127.0.0.1
# * keine Verbindung zu Produktion; produktive URL und Key werden in den
#   ausgelieferten Kopien durch die lokalen Werte ersetzt und nie ausgegeben
#
# Aufruf:
#   scripts/staging.sh start          Stack starten, Ist-Zustand (Baseline) + Seed
#   scripts/staging.sh migriere 01    Migration anwenden (01|02|03|04|05|09|R01|R09)
#   scripts/staging.sh frontend alt   altes Frontend (main) auf :55380 ausliefern
#   scripts/staging.sh frontend neu   neues Frontend (Arbeitsstand) auf :55381
#   scripts/staging.sh smoke <stufe>  Playwright-Smoke-Tests (ist|01|kompat|neu|09)
#   scripts/staging.sh lauf01         Komplettlauf Migration 01: ist → 01 → R01 → 01
#   scripts/staging.sh laufrollout    Rollout: 01–05 → altes FE kompatibel → neues FE → 09
#   scripts/staging.sh stop           Stack und Webserver beenden, Daten verwerfen
#
# Stack: eigenes Compose (staging/compose.yml) aus offiziellen Supabase-Images
# (Postgres 17.6, GoTrue, PostgREST, Kong). ALLE Ports nur an 127.0.0.1 –
# die Supabase-CLI wird nicht verwendet, weil sie an 0.0.0.0 bindet.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SW="$ROOT/staging"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.49.1-noble"
ENVF="$SW/.laufzeit.env"          # zufällige Laufzeitwerte, gitignored, Modus 600
[ -f "$ENVF" ] && . "$ENVF"
DBURL="postgresql://postgres:${STAGING_DB_PW:-x}@127.0.0.1:55322/postgres"
DC=(docker compose -f "$SW/compose.yml" --env-file "$ENVF")
PROD_URL_RE='https://nwutgxjnverlvmkrpiep\.supabase\.co'
PROD_KEY_RE='sb_publishable_[A-Za-z0-9_-]+'
export PGOPTIONS="-c client_min_messages=warning"
psqlf() { psql -X -q -v ON_ERROR_STOP=1 "$DBURL" "$@"; }

lokale_werte() {   # setzt API_URL und ANON_KEY, ohne sie auszugeben
  API_URL="http://127.0.0.1:55321"
  ANON_KEY="$STAGING_ANON_JWT"
}

jwt() {  # HS256-JWT für lokale Rollen (nur Staging)
  STAGING_JWT_SECRET="$STAGING_JWT_SECRET" node -e '
    const c=require("crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const h=b({alg:"HS256",typ:"JWT"}),p=b({role:process.argv[1],iss:"spielplan-staging",
      iat:Math.floor(Date.now()/1e3),exp:Math.floor(Date.now()/1e3)+86400});
    const s=c.createHmac("sha256",process.env.STAGING_JWT_SECRET).update(h+"."+p).digest("base64url");
    process.stdout.write(h+"."+p+"."+s);' "$1"
}

migration_datei() {
  case "$1" in
    01) ls "$ROOT"/supabase/migrations/20261110000100_*.sql ;;
    02) ls "$ROOT"/supabase/migrations/20261110000200_*.sql ;;
    03) ls "$ROOT"/supabase/migrations/20261110000300_*.sql ;;
    04) ls "$ROOT"/supabase/migrations/20261110000400_*.sql ;;
    05) ls "$ROOT"/supabase/migrations/20261110000500_*.sql ;;
    09) ls "$ROOT"/supabase/migrations/20261110000900_*.sql ;;
    R01) ls "$ROOT"/supabase/rollback/R01_*.sql ;;
    R09) ls "$ROOT"/supabase/rollback/R09_*.sql ;;
    *) echo "unbekannte Migration: $1" >&2; exit 2 ;;
  esac
}

# Sicherheitsregel (docs/STAGING.md): Test-Ports dürfen nicht auf allen
# Netzwerkschnittstellen erreichbar sein. Jede Bindung ≠ 127.0.0.1 → Abbruch.
ports_pruefen() {
  local offen
  offen=$(docker ps --filter "label=com.docker.compose.project=spielplan-staging" \
            --format '{{.Names}} {{.Ports}}' | grep -E '(0\.0\.0\.0|\[::\]):' || true)
  if [ -n "$offen" ]; then
    echo "✗ Staging-Ports auf allen Netzwerkschnittstellen – Abbruch:" >&2
    echo "$offen" | sed 's/^/    /' >&2
    "${DC[@]}" --profile dienste down -v >/dev/null 2>&1 || true
    exit 3
  fi
}

warte_bis() {  # $1 Beschreibung, Rest: Befehl
  local was="$1"; shift
  for _ in $(seq 1 90); do "$@" >/dev/null 2>&1 && return 0; sleep 2; done
  echo "✗ Zeitüberschreitung: $was" >&2; exit 4
}

start() {
  umask 077
  STAGING_DB_PW="$(openssl rand -hex 16)"; STAGING_JWT_SECRET="$(openssl rand -hex 32)"
  printf 'STAGING_DB_PW=%s\nSTAGING_JWT_SECRET=%s\n' "$STAGING_DB_PW" "$STAGING_JWT_SECRET" > "$ENVF"
  STAGING_ANON_JWT="$(jwt anon)"
  printf 'STAGING_ANON_JWT=%s\n' "$STAGING_ANON_JWT" >> "$ENVF"
  DBURL="postgresql://postgres:${STAGING_DB_PW}@127.0.0.1:55322/postgres"
  "${DC[@]}" up -d db
  ports_pruefen
  warte_bis "Datenbank" psql -X -tAc "select 1 from pg_roles where rolname='authenticator'" "$DBURL"
  sleep 3
  # Dienstrollen (im Image ohne Passwort) für GoTrue/PostgREST freischalten
  psql -X -q -v ON_ERROR_STOP=1 "postgresql://supabase_admin:${STAGING_DB_PW}@127.0.0.1:55322/postgres" -c "
    alter role authenticator with password '${STAGING_DB_PW}';
    alter role supabase_auth_admin with password '${STAGING_DB_PW}';" >/dev/null
  "${DC[@]}" --profile dienste up -d auth
  warte_bis "GoTrue-Migrationen" psql -X -tAc "select 1 from auth.users limit 0; select 1 from auth.identities limit 0" "$DBURL"
  warte_bis "GoTrue bereit" docker compose -f "$SW/compose.yml" --env-file "$ENVF" exec -T auth wget -qO- http://localhost:9999/health
  psqlf -f "$ROOT/supabase/baseline/00_produktion_rekonstruiert.sql"
  psqlf -f "$ROOT/supabase/tests/_seed.sql"
  psqlf -f "$SW/seed_staging.sql"
  psqlf -f "$ROOT/supabase/tests/_sr_platzhalter.sql"
  "${DC[@]}" --profile dienste up -d rest kong
  ports_pruefen
  warte_bis "API" curl -sf -o /dev/null -H "apikey: $STAGING_ANON_JWT" -H "Authorization: Bearer $STAGING_ANON_JWT" \
    "http://127.0.0.1:55321/rest/v1/vereine?select=id"
  echo "✓ Staging läuft (API 127.0.0.1:55321, DB 127.0.0.1:55322, nur localhost), Ist-Zustand wie Produktion"
}

migriere() {
  psqlf -f "$(migration_datei "$1")"
  psqlf -c "notify pgrst, 'reload schema'"
  sleep 1
  echo "✓ angewendet: $1"
}

frontend() {
  local art="$1" port dir
  lokale_werte
  if [ "$art" = alt ]; then port=55380; dir="$SW/www-alt"; else port=55381; dir="$SW/www-neu"; fi
  [ -f "$SW/http-$art.pid" ] && { kill "$(cat "$SW/http-$art.pid")" 2>/dev/null || true; rm -f "$SW/http-$art.pid"; }
  rm -rf "$dir"; mkdir -p "$dir"
  if [ "$art" = alt ]; then git -C "$ROOT" archive main | tar -x -C "$dir"
  else git -C "$ROOT" ls-files -z | (cd "$ROOT" && xargs -0 tar -c) | tar -x -C "$dir"; fi
  find "$dir" -maxdepth 2 \( -name '*.html' -o -name '*.js' \) -print0 | xargs -0 sed -i -E \
    -e "s#${PROD_URL_RE}#${API_URL}#g" -e "s#${PROD_KEY_RE}#${ANON_KEY}#g" \
    -e "s#https://spielplanapp\.christianaust\.eu/#http://127.0.0.1:${port}/#g"
  if grep -rqE "$PROD_URL_RE" "$dir"; then echo "✗ produktive URL noch enthalten – Abbruch" >&2; exit 1; fi
  setsid python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dir" \
    </dev/null >"$SW/http-$art.log" 2>&1 &
  echo $! > "$SW/http-$art.pid"
  echo "✓ Frontend $art: http://127.0.0.1:$port/ (gegen lokalen Stack)"
}

smoke() {
  local stufe="$1" fe="http://127.0.0.1:55380"
  case "$stufe" in neu|09) fe="http://127.0.0.1:55381" ;; esac
  lokale_werte
  # Browser laufen im offiziellen Playwright-Image (bringt die Systembibliotheken
  # mit, keine Installation auf dem Host). --network host: nur 127.0.0.1-Ziele.
  docker run --rm --network host --ipc host --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e CI=1 \
    -e STAGING_API_URL="$API_URL" -e STAGING_ANON_KEY="$ANON_KEY" -e STAGING_STUFE="$stufe" -e STAGING_FRONTEND="$fe" \
    -v "$ROOT:/work" -w /work "$PLAYWRIGHT_IMAGE" \
    npx --no-install playwright test --config tests/e2e/playwright.config.js --output /tmp/pw-out
}

stop() {
  for f in "$SW"/http-*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
  [ -f "$ENVF" ] && "${DC[@]}" --profile dienste down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$SW/www-alt" "$SW/www-neu" "$SW"/http-*.log "$SW"/snap_*.txt "$ENVF"
}

case "${1:-}" in
  start)    start ;;
  migriere) migriere "$2" ;;
  frontend) frontend "$2" ;;
  smoke)    smoke "$2" ;;
  lauf01)
    stop >/dev/null 2>&1 || true
    trap 'stop >/dev/null 2>&1 || true' EXIT
    start; frontend alt
    snap() { psqlf -v bereich="$1" -f "$ROOT/supabase/tests/_katalog_snapshot.sql" > "$SW/snap_$2.txt"; }
    snap alle vorher; snap sr vorher_sr
    smoke ist
    migriere 01; snap sr nach01_sr
    diff -u "$SW/snap_vorher_sr.txt" "$SW/snap_nach01_sr.txt" \
      && echo "✓ SR/übrige Objekte nach 01 unverändert (echter Stack)"
    smoke 01
    migriere R01; snap alle nachR01
    diff -u "$SW/snap_vorher.txt" "$SW/snap_nachR01.txt" \
      && echo "✓ R01 stellt den Katalog exakt wieder her (echter Stack)"
    smoke ist
    migriere 01; smoke 01
    rm -f "$SW"/snap_*.txt
    echo "✓ Staging-Lauf Migration 01 bestanden" ;;
  laufrollout)
    stop >/dev/null 2>&1 || true
    trap 'stop >/dev/null 2>&1 || true' EXIT
    start
    snap() { psqlf -v bereich=sr -f "$ROOT/supabase/tests/_katalog_snapshot.sql" > "$SW/snap_$1.txt"; }
    snap vorher
    for m in 01 02 03 04 05; do migriere "$m"; done
    snap nach05
    diff -u "$SW/snap_vorher.txt" "$SW/snap_nach05.txt" \
      && echo "✓ SR/übrige Objekte nach 01–05 unverändert (echter Stack)"
    frontend alt; frontend neu
    smoke kompat          # Übergangsphase: altes Frontend gegen 01–05
    smoke neu             # neues Frontend gegen 01–05
    migriere 09; snap nach09
    diff -u "$SW/snap_vorher.txt" "$SW/snap_nach09.txt" \
      && echo "✓ SR/übrige Objekte nach 09 unverändert (echter Stack)"
    smoke 09              # neues Frontend nach Entzug des anonymen Tabellenzugriffs
    echo "✓ Staging-Lauf Rollout bestanden" ;;
  stop)     stop ;;
  *) sed -n 2,20p "$0"; exit 2 ;;
esac
