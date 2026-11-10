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

Die Browser laufen im offiziellen Image `mcr.microsoft.com/playwright:v1.49.1-noble`
(`--network host`). Auf dem Host fehlen Systembibliotheken für die Browser, und eine
`apt`-Installation wäre systemweit. Die Specs blockieren und melden jede Browser-Anfrage
an `*.supabase.co` oder `*.christianaust.eu`.

**Verbindliche Regel Netz (seit 10.11.2026):** Die Supabase-Testports (553xx: API, DB,
Mailpit) dürfen **nicht ungeschützt auf allen Netzwerkschnittstellen** erreichbar sein.
Die Supabase-CLI bindet sie an `0.0.0.0`, und das lässt sich in der CLI nicht abstellen.
Beim Lauf am 10.11.2026 waren sie deshalb kurzzeitig ungeschützt offen; es lagen
nur synthetische Daten darin.

* `scripts/staging.sh` prüft die Bindungen nach dem Start. Ist ein Port auf
  `0.0.0.0` oder `[::]` gebunden, wird der Stack **sofort beendet** (Exit 3).
* Weiter geht es nur, wenn eine Absicherung eingerichtet und bestätigt ist:
  * Host-Firewall: Regel in der `DOCKER-USER`-Kette, die 55320–55399 nur von
    `127.0.0.1`/`docker0` zulässt. Docker umgeht `ufw`, daher muss es `DOCKER-USER` sein.
  * Bestätigung pro Lauf: `STAGING_PORTS_GESCHUETZT=1 scripts/staging.sh lauf01`.
* Die Firewall-Regel ist eine systemweite Änderung und braucht Christians Freigabe.
* Alternative ohne Firewall: den Stack nicht über die CLI starten, sondern per
  eigenem Compose mit `127.0.0.1:`-Portbindungen. Das ist noch nicht umgesetzt.

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

## Ergebnis 10.11.2026

`scripts/staging.sh lauf01`: **bestanden** (Exit 0), 34 Browser-/REST-Tests in 4 Stufen,
2 Katalogvergleiche gegen den echten Stack. Details: `docs/FREIGABE_MIGRATION01_2026-11-10.md` §9.

## Voraussetzungen (am 10.11.2026 erledigt)

* **Docker-Images des Supabase-Stacks laden.** `supabase start` lädt beim ersten
  Lauf etwa 8 Images (GoTrue, PostgREST, Kong u. a., mehrere GB). Lokal liegt
  bisher nur `supabase/postgres:17.6.1.136`.
* **Playwright projektlokal installieren:**
  `npm install -D @playwright/test@1.49.1 && npx playwright install chromium webkit`.
  Das schreibt in `node_modules/` und in den Browser-Cache unter `~/.cache/ms-playwright`.
* `npm`/`npx`: benutzerlokal nach `~/.local/bin` verlinkt, wie `node` aus `~/.hermes/node/bin`.
* Playwright 1.49.1 projektlokal (`package.json`, exakte Version). Die Host-Browser in
  `~/.cache/ms-playwright` (1,1 GB) sind ohne Systembibliotheken nicht lauffähig und können
  gelöscht werden.
* Das alte Frontend lädt `supabase-js` vom CDN. Der Browser braucht dafür
  Internetzugang. Die Datenzugriffe gehen trotzdem nur an `127.0.0.1`.

Supabase-CLI 3.0.0 ist vorhanden.
