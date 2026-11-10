# Nachtarbeit 09./10.11.2026 · Spielplan-App 2.0 · Übergabe

Branch `develop/spielplan-app-2.0` (lokal, **kein Push**), Basis `main` @ `65ceb9f`.
Es gab **keine** Änderung an Produktion, kein Deployment, keine
Datenbankmigration und keinen Zugriff auf Produktivdaten.

## Kurzfassung

* **Sicherheit:** Alle sechs Audit-Befunde sind in versionierten Migrationen
  behoben (nicht angewendet). Dazu kommen ein Stored-XSS-Befund im Leitstand und
  im Browser erzeugte Tokens, beide im Frontend behoben.
* **Spielerlinks:** Spieler antworten weiter ohne Login. Die bisherigen Links
  bleiben gültig, werden aber serverseitig geprüft.
* **Rückrunde:** Umschalter Vorrunde/Rückrunde mit Saison, Mannschaftsstärke je
  Mannschaft, CSV-Import mit Vorschau, Validierung und Dublettenprüfung. Es
  wurden **keine** echten Termine importiert.
* **Tests:** 51 JavaScript-Tests und 200 Datenbank-Prüfungen, alle grün.

## 1. Arbeitspakete

| AP | Stand |
|---|---|
| 1 Projektübernahme | ✅ Branch, Analyse, `CLAUDE.md`, `README.md`, `docs/TESTSTRATEGIE.md`, Entwicklungsplan mit Status, Testinfrastruktur |
| 2 Sicherheit | ✅ umgesetzt und lokal getestet; ⏸ produktive Anwendung wartet auf Freigabe; ⏸ Wahl gemeinsamer oder persönlicher Link offen (beides vorbereitet, keine Festlegung) |
| 3 Rückrunde | ✅ technisch vorbereitet (Frontend + Migration 04) |
| 4 Technische Qualität | ✅ Fehlerbehandlung je Abfrage, Eingabevalidierung (Client und Server), Datenminimierung, verständliche Fehlertexte, Exporte je Halbrunde, WhatsApp-Texte robust bei Sonderzeichen, mobile Tabellen und Touch-Ziele (ohne Umgestaltung) |
| 5 Übergabe | ✅ diese Datei |

## 2. Geänderte Dateien (47 Dateien, 6 Commits)

* **Anwendung:**
  * `app.js`: überarbeitet; gleiche Optik, gleiche Abläufe.
  * `spieler.html`, `helfer.html`: nur noch Serverfunktionen.
  * `login.html`, `index.html`, `export.js`: angepasst.
  * neu: `js/config.js`, `js/sicherheit.js`, `js/texte.js`, `js/rueckrunde.js`
* **Datenbank:**
  * `supabase/migrations/` (5 Dateien)
  * `supabase/rollback/R09_…`
  * `supabase/baseline/` (nur Tests)
  * `supabase/pruefung/vorabpruefung_readonly.sql`
* **Tests:** `supabase/tests/` (pgTAP), `tests/` (node:test + jsdom),
  `scripts/db-test.sh`, `package.json`
* **Doku:**
  * `CLAUDE.md`, `README.md`
  * `docs/ANALYSE-UND-PLAN-2.0.md`, `docs/SICHERHEITSMODELL.md`,
    `docs/MIGRATIONSPLAN.md`, `docs/TESTSTRATEGIE.md`
  * `schema.sql` als veraltet markiert

Commits: `d865916` Regeln/Analyse · `956d802` DB-Migrationen + pgTAP ·
`eae430d` Frontend · `ac446e7` Doku · dazu RPC-Signaturtest und diese Übergabe.

## 3. Tests (zuletzt 10.11.2026, lokal)

* `npm test`: **51/51 bestanden** (Unit, DOM mit XSS-Payloads, statische
  Sicherheitsprüfungen, RPC-Signaturen)
* `npm run test:db`: **alle 11 Testläufe bestanden, 200 Prüfungen**:
  * Ist-Zustand als unsicher nachgewiesen
  * nach 01–04: Rollen, Mannschaftsgrenzen, Spielerlinks, Transaktionen,
    Import, Altpfad-Kompatibilität
  * nach 09: anon ohne Tabellenzugriff, RPCs funktionieren
  * Rückfall R09 und erneute 09 geprüft; Idempotenz geprüft
* Nicht getestet: echter PostgREST/Supabase-Stack und echte Browser
  (`docs/TESTSTRATEGIE.md`, Lücken T1–T3).

## 4. Sicherheitsprobleme

| Befund | Status |
|---|---|
| Selbstvergabe von Adminrechten (`nutzer_rollen`) | gelöst in 01 · Test `20_rollen` |
| TRUNCATE/TRIGGER für anon/authenticated | gelöst in 01 |
| Anonymer Lesezugriff auf Spieler, TTR, Tokens, E-Mails, Antworten | stark reduziert in 03, **vollständig gelöst in 09** |
| Anonymes INSERT/UPDATE ohne Prüfung | Altpfad durch Trigger und Policies begrenzt (03); nur noch über RPCs (09) |
| MF nicht auf eigene Mannschaft begrenzt | gelöst in 03 (+ Trigger in 02) · Test `30_` |
| Zu breite Grants | gelöst in 01/03/09 (tabellengenau, SR-Tabellen unberührt) |
| Token keine Berechtigungsgrenze | gelöst: serverseitige Prüfung, Hash-Links mit Ablauf und Widerruf (02) |
| Stored XSS im Leitstand | gelöst im Frontend (`esc()`, keine Freitexte in `onclick`) · DOM-Tests |
| Tokens per `Math.random` im Browser | gelöst: nur serverseitig (Trigger) |
| `select('*')`, unversionierte CDN-Bibliotheken | gelöst (Spaltenlisten, feste Versionen + SRI) |
| Referrer-Leck des Tokens | Meta `no-referrer` auf allen Seiten, `rel=noreferrer` |
| **Offen:** Antworten für andere Spieler über gemeinsamen Link | Entscheidung nötig (persönliche Links sind vorbereitet) |
| **Offen:** Altpfad bis Migration 09 (Antworten/Tokens anonym lesbar) | 09 bald nach dem Frontend-Rollout anwenden |
| **Offen:** CSP-Header (GitHub Pages kann keine Header setzen) | Inline-Handler zuerst ablösen (Phase 3) |
| **Offen:** IP-Rate-Limit | nur Mengenlimits vorhanden; Edge Function/Captcha prüfen |
| **Offen:** `vereinsbefragung` anonymer INSERT | Nutzung außerhalb des Repos klären |

## 5. Vorbereitete, NICHT angewendete Migrationen

1. `20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql`: **sofort sinnvoll**, kompatibel mit dem alten Frontend
2. `20261110000200_spielerlinks_und_serverfunktionen.sql`: additiv, kompatibel
3. `20261110000300_rls_mannschaftsgrenzen.sql`: kompatibel (Test `70_`)
4. `20261110000400_rueckrunde_terminimport.sql`: additiv
5. `20261110000900_anon_tabellenzugriff_entziehen.sql`: **erst nach dem Frontend-Rollout**
   (Rückfall: `supabase/rollback/R09_…`)

Reihenfolge, Vorabprüfung und Rückfall: `docs/MIGRATIONSPLAN.md`.
**Wichtig:** Das neue Frontend braucht die Migrationen 01–04. Es darf erst nach
ihnen ausgerollt werden.

## 6. Entscheidungen für Christian

1. **Gemeinsamer oder persönlicher Spielerlink** (oder beides), inklusive
   Gültigkeitsdauer (Vorschlag: 2 Tage nach dem Spieltag). Gegenüberstellung in
   `docs/SICHERHEITSMODELL.md` §4.
2. **Freigabe der Vorabprüfung** (`supabase/pruefung/vorabpruefung_readonly.sql`,
   nur lesend, nur Struktur und Zahlen). Sie gleicht die Spaltenliste ab, die
   aus dem Code rekonstruiert ist.
3. **Freigabe Migration 01** in Produktion (schließt die Selbstvergabe von
   Adminrechten, unabhängig vom Frontend).
4. **Staging**: Supabase-Branch oder separates Testprojekt für den Ende-zu-Ende-Test (T1)?
5. **Mannschaftsstärken** (`min_spieler`) je Mannschaft, Standard aktuell 6.
6. **Nachmeldung „nicht in der Liste“** beibehalten? Aktuell erlaubt, mit
   Limit und Markierung `nachgemeldet_am`.
7. **`vereinsbefragung` und `helfer.html`** (Turnier 05.09.2026): noch nötig?
8. Ersatzregel „3. Mannschaft nur für die 2.“: weiterhin fest oder konfigurierbar?

## 7. Sinnvolle nächste Schritte

1. Vorabprüfung → Migration 01 produktiv (nach Backup und Freigabe)
2. Staging mit `supabase start` oder Branch, dazu Playwright-Smoke-Test der
   echten PostgREST-Aufrufe (T1)
3. Code-Review des Branches, danach Migrationen 02–04, Frontend-Rollout, Pilot, Migration 09
4. Rückrundentermine per CSV importieren, sobald der Rahmenterminplan feststeht
   (erst Vorschau, dann Import)
5. Phase 3: Inline-Handler ablösen → CSP; Kaderverwaltung und Freigabe von
   Nachmeldungen im Leitstand
6. Abhängig von der Entscheidung aus 6.1: Oberfläche für persönliche Links
   (Erzeugen/Verteilen/Widerrufen) nach Designabstimmung

## Hinweise zur Umgebung

* Testdatenbank: flüchtiger Docker-Container `spielplan-testdb` (lokales Image
  `supabase/postgres:17.6.1.136`, nur `127.0.0.1:55432`). Er wird nach jedem
  Lauf entfernt; andere Container sind unberührt.
* `npm install` legt nur `node_modules/` im Projekt an (jsdom 25.0.1,
  gitignored). Systemweit wurde nichts installiert.
* Zum Rekonstruieren des Ist-Zustands wurde nur die Strukturausgabe des
  vorhandenen Read-only-Audits gelesen (Policies, Grants, Constraints, Indizes,
  Zeilenzahlen). Inhalte, Backups, Schlüssel und Passwortdateien wurden nicht geöffnet.
