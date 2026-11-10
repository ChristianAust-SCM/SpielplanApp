# Staging-Test mit echtem Supabase-Stack und Browser (Lücken T1/T2)

Lokal, isoliert, nur synthetische Daten. Keine Verbindung zur Produktion: Die
ausgelieferten Kopien des Frontends bekommen die URL und den Key des lokalen
Stacks. Das Skript bricht ab, falls die produktive URL noch enthalten ist.

## Bestandteile

| Datei | Zweck |
|---|---|
| `staging/supabase/config.toml` | lokaler Stack `spielplan-staging`, Ports 553xx (kollisionsfrei), Studio/Storage/Realtime/Analytics aus, Registrierung aus |
| `staging/seed_staging.sql` | macht die synthetischen Konten anmeldefähig (Passwort `staging-lokal-1`, nur lokal) |
| `scripts/staging.sh` | Start/Stop, Migrationen einzeln, Frontend alt (`main`) bzw. neu, Smoke-Tests |
| `tests/e2e/migration01.spec.js` | Browser- und REST-Smoke-Tests für das alte Frontend: Ist-Zustand und nach 01 |
| `tests/e2e/playwright.config.js` | Chromium (Desktop) und WebKit (iPhone 13) |

Beim Start enthält die Datenbank die Baseline. Das ist der Ist-Zustand, am
10.11.2026 mit den produktiven Spalten abgeglichen. Dazu kommen die Testdaten
und die SR-Platzhalter.

## Ablauf Migration 01 (`npm run test:staging01` bzw. `scripts/staging.sh lauf01`)

1. Stack starten, Frontend von `main` auf `127.0.0.1:55380`
2. Smoke `ist`: MF-/Admin-Login, Spielerlink ohne Login, Selbstvergabe per REST **gelingt** (Lücke)
3. Migration 01 → Smoke `01`: gleiche Funktionen, Selbstvergabe → HTTP 403, MF-Hochstufung ändert nichts
4. Rückfall R01 → Smoke `ist` (Ausgangszustand wieder da)
5. Migration 01 erneut → Smoke `01`
6. `scripts/staging.sh stop`: Stack und Daten verwerfen

Spätere Stufen, gleiche Umgebung: `migriere 02/03/04/05`, `frontend neu`,
danach `migriere 09`. Die Smoke-Specs für das neue Frontend folgen nach
Freigabe von 01.

## Voraussetzungen (Einmalschritte, brauchen deine Freigabe)

* **Docker-Images des Supabase-Stacks laden.** `supabase start` lädt beim ersten
  Lauf etwa 8 Images (GoTrue, PostgREST, Kong u. a., mehrere GB). Lokal liegt
  bisher nur `supabase/postgres:17.6.1.136`.
* **Playwright projektlokal installieren:**
  `npm install -D @playwright/test@1.49.1 && npx playwright install chromium webkit`.
  Das schreibt in `node_modules/` und in den Browser-Cache unter `~/.cache/ms-playwright`.
* `npm` ist im Pfad dieser Sitzung nicht vorhanden. Nur `~/.local/bin/node` ist da.
  Entweder npm bereitstellen oder den Pfad nennen.
* Das alte Frontend lädt `supabase-js` vom CDN. Der Browser braucht dafür
  Internetzugang. Die Datenzugriffe gehen trotzdem nur an `127.0.0.1`.

Supabase-CLI 3.0.0 ist vorhanden.
