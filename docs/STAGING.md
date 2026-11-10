# Staging mit echtem Supabase-Stack und Browsern

Lokal, isoliert, nur synthetische Daten. Es gibt keine Verbindung zur Produktion.
Die ausgelieferten Kopien des Frontends bekommen URL und Schlüssel des lokalen
Stacks. Das Skript bricht ab, wenn die produktive URL darin verbleibt. Die
Browser-Specs blockieren jede Anfrage an `*.supabase.co`, `*.christianaust.eu`
und WhatsApp und lassen den Test dann fehlschlagen.

## Verbindliche Netzregel

Die Testports dürfen **nicht ungeschützt auf allen Netzwerkschnittstellen**
erreichbar sein.

* Der Stack läuft deshalb **nicht** über die Supabase-CLI, denn die bindet an
  `0.0.0.0`. Er läuft über ein eigenes Compose (`staging/compose.yml`), das alle
  Ports ausschließlich an `127.0.0.1` bindet:
  * 55321: API über Kong
  * 55322: Datenbank
  * 55380/55381: Frontend alt/neu, als Python-Webserver
* `scripts/staging.sh` prüft nach jedem Start die Bindungen. Ist ein Port an
  `0.0.0.0` oder `[::]` gebunden, beendet es den Stack sofort (Exit 3).
* Datenbankpasswort und JWT-Secret werden bei jedem Start zufällig erzeugt
  (`staging/.laufzeit.env`, Modus 600, gitignored) und beim Stop gelöscht.
* Am 10.11.2026 lief der erste Staging-Lauf noch über die CLI; die Ports lagen
  kurzzeitig auf `0.0.0.0`, mit rein synthetischen Daten. Das ist seitdem abgestellt.

## Bestandteile

| Datei | Zweck |
|---|---|
| `staging/compose.yml`, `staging/kong.yml` | Offizielle Images: Postgres 17.6.1.136 (wie Produktion 17.6), GoTrue 2.197, PostgREST 16.5, Kong 2.8.1 |
| `staging/seed_staging.sql` | Testkonten anmeldefähig (Passwort `staging-lokal-1`), Admin mit Rolle für alle Mannschaften wie produktiv |
| `scripts/staging.sh` | `start`, `migriere <nr>`, `frontend alt\|neu`, `smoke <stufe>`, `lauf01`, `laufrollout`, `stop` |
| `tests/e2e/migration01.spec.js` | altes Frontend: Ist-Zustand, nach 01, Übergangsphase (`kompat`) |
| `tests/e2e/neu.spec.js` | neues Frontend: komplette Abnahme (Stufen `neu`, `09`) und Smartphone |
| `tests/e2e/playwright.config.js` | Chromium Desktop und WebKit iPhone 13 im offiziellen Image `mcr.microsoft.com/playwright:v1.49.1-noble` (keine Systeminstallation) |

## Läufe

```bash
scripts/staging.sh lauf01        # Migration 01: ist → 01 → R01 → 01
scripts/staging.sh laufrollout   # 01–05 → altes FE kompatibel → neues FE → 09 → neues FE
```

Beide Läufe räumen am Ende selbst auf (Container, Volumes, Laufzeitdateien).

## Ergebnisse 10.11.2026

| Lauf | Ergebnis |
|---|---|
| `lauf01` (Compose, nur localhost) | bestanden: 34 Tests, 2 Katalogvergleiche |
| `laufrollout` | bestanden: 9 (altes FE, Übergang) + 15 (neues FE nach 01–05) + 14 (neues FE nach 09) = **38 Tests**; SR-/Fremdobjekte nach 01–05 und nach 09 unverändert |

## Voraussetzungen (eingerichtet)

* `npm`/`npx` benutzerlokal in `~/.local/bin` verlinkt, aus `~/.hermes/node/bin`.
* Playwright 1.49.1 projektlokal. Die Browser laufen im Docker-Image. Die Host-Browser
  in `~/.cache/ms-playwright` (1,1 GB) sind ohne Systembibliotheken nicht nutzbar
  und können gelöscht werden.
* Das Frontend lädt `supabase-js`, ExcelJS und jsPDF vom CDN (mit SRI). Der
  Browser-Container braucht dafür Internet; Datenzugriffe gehen nur an `127.0.0.1`.
