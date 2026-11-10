#!/usr/bin/env bash
# ============================================================================
# Datenbanktests in einer ISOLIERTEN, flüchtigen Docker-Instanz.
#
# * Container "spielplan-testdb", nur an 127.0.0.1 gebunden, Daten in tmpfs
# * ausschließlich synthetische Testdaten (supabase/tests/_seed.sql)
# * keinerlei Verbindung zur Produktivdatenbank – es wird kein produktiver
#   Host, Schlüssel oder Passwort verwendet
#
# Ablauf:
#   1. Baseline (rekonstruierter Produktiv-Ist-Zustand) + Seed
#   2. Tests "Ist-Zustand unsicher"               (10_*)
#   3. Migrationen 01–04
#   4. Tests Sicherheit/Funktion/Altpfad          (20_* … 70_*)
#   5. Migration 09 (anon entziehen)
#   6. Tests anon entzogen                        (80_*)
#   7. Rückfall R09, Altpfad-Test erneut, dann Migration 09 erneut
#
# Aufruf:  scripts/db-test.sh            (Container danach entfernen)
#          KEEP_DB=1 scripts/db-test.sh  (Container zum Untersuchen behalten)
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${TESTDB_IMAGE:-supabase/postgres:17.6.1.136}"
NAME="spielplan-testdb"
PORT="${TESTDB_PORT:-55432}"
export PGPASSWORD="lokaltest"          # nur für den flüchtigen Testcontainer
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d postgres)

cleanup() {
  if [ "${KEEP_DB:-0}" != "1" ]; then docker rm -f "$NAME" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

echo "▶ Starte isolierte Testdatenbank ($IMAGE, 127.0.0.1:$PORT)"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --label projekt=spielplan-app-test \
  --tmpfs /var/lib/postgresql/data:rw \
  -e POSTGRES_PASSWORD="$PGPASSWORD" -p "127.0.0.1:$PORT:5432" "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  s=$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo starting)
  [ "$s" = "healthy" ] && break
  sleep 2
done
# Health meldet bereit, Init-Skripte brauchen ggf. noch einen Moment
for _ in $(seq 1 30); do
  "${PSQL[@]}" -tAc "select 1 from pg_roles where rolname='authenticated'" 2>/dev/null | grep -q 1 && break
  sleep 2
done

FEHLER=0
anwenden() {   # SQL-Datei als postgres anwenden
  echo "  · wende an: ${1#$ROOT/}"
  "${PSQL[@]}" -f "$1" >/dev/null
}
testen() {     # pgTAP-Datei ausführen und auswerten
  local datei="$1" out
  if ! out=$("${PSQL[@]}" -tA -f "$ROOT/supabase/tests/_hilfen.sql" -f "$datei" 2>&1); then
    echo "  ✗ ${datei#$ROOT/} – Abbruch:"; echo "$out" | sed 's/^/      /' | tail -20
    FEHLER=$((FEHLER+1)); return
  fi
  local ok nok
  ok=$(grep -c '^ok ' <<<"$out" || true)
  nok=$(grep -c '^not ok ' <<<"$out" || true)
  if [ "$nok" -gt 0 ] || grep -q '^# Looks like' <<<"$out"; then
    echo "  ✗ ${datei#$ROOT/}: $ok ok, $nok fehlgeschlagen"
    grep -E '^(not ok|#)' <<<"$out" | sed 's/^/      /'
    FEHLER=$((FEHLER+1))
  else
    echo "  ✓ ${datei#$ROOT/}: $ok Tests bestanden"
  fi
}

"${PSQL[@]}" -c "create extension if not exists pgtap with schema extensions" >/dev/null

echo "▶ Stufe 1: Baseline (Ist-Zustand Produktion, rekonstruiert) + synthetische Daten"
anwenden "$ROOT/supabase/baseline/00_produktion_rekonstruiert.sql"
anwenden "$ROOT/supabase/tests/_seed.sql"
for t in "$ROOT"/supabase/tests/1[0-9]_*.sql; do testen "$t"; done

# Das Test-Image hat ein verkürztes auth.users; Produktionsspalten nachbilden (nur Test)
psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -c "alter table auth.users add column if not exists email_confirmed_at timestamptz,
  add column if not exists last_sign_in_at timestamptz" >/dev/null
if "${PSQL[@]}" -f "$ROOT/supabase/pruefung/vorabpruefung_readonly.sql" >/dev/null 2>"$ROOT/.vorab.err"; then
  echo "  ✓ Vorabprüfung läuft fehlerfrei gegen den Ist-Zustand (read-only-Transaktion)"
else
  echo "  ✗ Vorabprüfung fehlerhaft:"; sed 's/^/      /' "$ROOT/.vorab.err"; FEHLER=$((FEHLER+1))
fi
rm -f "$ROOT/.vorab.err"

echo "▶ Stufe 1b: Migration 01 allein (Einzelfreigabe), SR-Unberührtheit, Rückfall R01"
anwenden "$ROOT/supabase/tests/_sr_platzhalter.sql"
SNAP_DIR="$(mktemp -d)"
snapshot() { "${PSQL[@]}" -v bereich="$1" -f "$ROOT/supabase/tests/_katalog_snapshot.sql" > "$SNAP_DIR/$2"; }
vergleiche() {  # $1 $2 Snapshot-Dateien, $3 Beschreibung
  if diff -u "$SNAP_DIR/$1" "$SNAP_DIR/$2" > "$SNAP_DIR/diff.txt"; then
    echo "  ✓ $3"
  else
    echo "  ✗ $3:"; sed 's/^/      /' "$SNAP_DIR/diff.txt" | head -40; FEHLER=$((FEHLER+1))
  fi
}
snapshot alle vorher_alle.txt
snapshot sr   vorher_sr.txt
anwenden "$ROOT/supabase/migrations/20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql"
snapshot sr   nach01_sr.txt
vergleiche vorher_sr.txt nach01_sr.txt "Migration 01 ändert nichts außerhalb der Spielplan-Tabellen (SR-Platzhalter, public-Funktionen)"
testen "$ROOT/supabase/tests/20_rollen.sql"
testen "$ROOT/supabase/tests/90_migration01_allein.sql"
anwenden "$ROOT/supabase/migrations/20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql"
echo "  · Idempotenz: Migration 01 erneut"
testen "$ROOT/supabase/tests/90_migration01_allein.sql"
anwenden "$ROOT/supabase/rollback/R01_rollen_policies_wiederherstellen.sql"
snapshot alle nachR01_alle.txt
vergleiche vorher_alle.txt nachR01_alle.txt "Rückfall R01 stellt den Katalog-Ausgangszustand exakt wieder her"
for t in "$ROOT"/supabase/tests/1[0-9]_*.sql; do testen "$t"; done
rm -rf "$SNAP_DIR"

echo "▶ Stufe 2: Migrationen 01–05"
for m in "$ROOT"/supabase/migrations/2026111000010*.sql "$ROOT"/supabase/migrations/2026111000020*.sql \
         "$ROOT"/supabase/migrations/2026111000030*.sql "$ROOT"/supabase/migrations/2026111000040*.sql \
         "$ROOT"/supabase/migrations/2026111000050*.sql; do
  anwenden "$m"
done
echo "  · Idempotenz: Migrationen 01, 02, 04, 05 erneut"
anwenden "$ROOT/supabase/migrations/20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql"
anwenden "$ROOT/supabase/migrations/20261110000200_spielerlinks_und_serverfunktionen.sql"
anwenden "$ROOT/supabase/migrations/20261110000400_rueckrunde_terminimport.sql"
anwenden "$ROOT/supabase/migrations/20261110000500_mannschaftsstaerken.sql"
for t in "$ROOT"/supabase/tests/[2-7][0-9]_*.sql; do testen "$t"; done
if "${PSQL[@]}" -f "$ROOT/supabase/rollback/R01_rollen_policies_wiederherstellen.sql" >/dev/null 2>&1; then
  echo "  ✗ R01 lief trotz angewendeter Migration 02 durch"; FEHLER=$((FEHLER+1))
else
  echo "  ✓ R01 verweigert sich, sobald Migration 02 angewendet ist"
fi

echo "▶ Stufe 3: Migration 09 (anonymer Tabellenzugriff entzogen)"
anwenden "$ROOT/supabase/migrations/20261110000900_anon_tabellenzugriff_entziehen.sql"
for t in "$ROOT"/supabase/tests/8[0-9]_*.sql "$ROOT"/supabase/tests/4[0-9]_*.sql; do testen "$t"; done

echo "▶ Stufe 4: Rückfall R09 und erneute Migration 09"
anwenden "$ROOT/supabase/rollback/R09_anon_altpfad_wiederherstellen.sql"
testen "$ROOT/supabase/tests/70_altpfad_kompatibel.sql"
anwenden "$ROOT/supabase/migrations/20261110000900_anon_tabellenzugriff_entziehen.sql"
testen "$ROOT/supabase/tests/80_anon_entzogen.sql"

echo
if [ "$FEHLER" -gt 0 ]; then
  echo "✗ Datenbanktests: $FEHLER Testdatei(en) fehlgeschlagen"; exit 1
fi
echo "✓ Alle Datenbanktests bestanden"
