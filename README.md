# Spielplan-App · FC Strass e.V.

Web-App für die Verfügbarkeitsabfrage, Verschiebungen und Aufstellungen der
Tischtennis-Mannschaften des FC Strass. Spieler antworten **ohne Login** über
einen Link. Mannschaftsführer (MF) und Admins melden sich an.

Produktiv: GitHub Pages (`https://spielplanapp.christianaust.eu/`) + Supabase
(Projekt `nwutgxjnverlvmkrpiep`). Entwicklungsstand 2.0: Branch
`develop/spielplan-app-2.0`. Details stehen in `NACHTARBEIT_2026-11-09.md`.

## Architektur

```
Browser (statisches HTML/JS, kein Build)            Supabase
┌──────────────────────────────┐                 ┌───────────────────────────────┐
│ spieler.html  (ohne Login) ──┼── RPC + Token ─▶│ public.abfrage_laden/…        │
│ helfer.html   (ohne Login) ──┼── RPC ─────────▶│ public.helfer_eintragen       │  SECURITY DEFINER,
│ login.html    (Supabase Auth)┼── Auth ────────▶│ auth                          │  prüfen Token/Rolle
│ index.html + app.js (MF/Admin)┼─ Tabellen (RLS)▶│ public.* Tabellen + RLS       │
│ export.js (Excel/PDF)        │   + RPCs        │ private.* (Helfer, Links,     │
│ js/config.js  Konfiguration  │                 │   Einstellungen – nicht per   │
│ js/sicherheit.js  Escaping   │                 │   API erreichbar)             │
│ js/texte.js   WhatsApp-Texte │                 └───────────────────────────────┘
│ js/rueckrunde.js Runde/Import│
└──────────────────────────────┘
```

* **Spieler**: Der Link `spieler.html?token=…` (Spieltag) bzw. `?alt=…`
  (Ausweichtermin) enthält ein zufälliges Token. Die Seite ruft nur
  Serverfunktionen auf, und die prüfen das Token. Persönliche Links (ein Link je
  Spieler) sind serverseitig vorbereitet, siehe `docs/SICHERHEITSMODELL.md`.
* **MF/Admin**: Supabase Auth (E-Mail/Passwort). Rollen stehen in
  `nutzer_rollen` (`mf` je Mannschaft, `admin`). Alle Rechte prüft die Datenbank
  per RLS. Die Oberfläche blendet nur Bedienelemente ein oder aus.
* **Portabilität (Titan_Ghost)**: Die Fachlogik steckt in Standard-PostgreSQL.
  Supabase-spezifisch sind nur `auth.uid()`, gekapselt in
  `private.aktueller_nutzer()`, sowie PostgREST und der JS-Client.

## Funktionen

| Bereich | Funktion |
|---|---|
| Spieler | Verfügbarkeit Ja/Vielleicht/Nein + Anmerkung, Antwort änderbar, Nachmeldung „nicht in der Liste“, Ausweichtermine |
| MF | Spielplan je Mannschaft, Umschalter **Vorrunde/Rückrunde** und Saison, Ampel nach `min_spieler`, Rückmeldungen inkl. Anmerkungen, WhatsApp-Abfrage und -Erinnerung, Alternativtermine, Verschiebungsbedarf melden, Aufstellung (inkl. Ersatz 3. Mannschaft), Exporte (Excel/PDF) |
| Admin | wie MF für alle Mannschaften, Verschiebung bestätigen, **CSV-Terminimport** mit Vorschau/Dublettenprüfung, Turnier-Helferliste |

## Verzeichnisstruktur

| Pfad | Inhalt |
|---|---|
| `*.html`, `app.js`, `export.js` | Anwendung (wird über GitHub Pages ausgeliefert) |
| `js/` | Konfiguration und testbare Hilfsmodule |
| `supabase/baseline/` | Rekonstruierter Produktiv-Ist-Zustand, **nur für Tests** |
| `supabase/migrations/` | Versionierte Migrationen, **noch nicht angewendet** |
| `supabase/rollback/` | Rückfallskripte |
| `supabase/tests/` | pgTAP-Tests (nur synthetische Daten) |
| `tests/` | JavaScript-Tests (node:test + jsdom) |
| `scripts/db-test.sh` | Startet eine flüchtige Test-Datenbank in Docker und führt alle DB-Tests aus |
| `docs/` | Analyse, Sicherheitsmodell, Migrationsplan, Teststrategie |
| `schema.sql` | **veraltet** (Schema v1), nur noch zur Historie |

## Entwicklung & Tests

Voraussetzungen: Node.js ≥ 20, Docker, lokales Image `supabase/postgres:17.6.1.136`.

```bash
npm install          # einmalig, installiert nur jsdom (devDependency)
npm test             # JS: Unit-, DOM- und statische Sicherheitstests
npm run test:db      # DB: Baseline → Migrationen → pgTAP (isolierter Container)
npm run test:alle    # beides
```

Lokal ansehen: `python3 -m http.server 8080` im Projektverzeichnis. Die Seiten
sprechen dann allerdings die in `js/config.js` eingetragene Datenbank an. Für
die Entwicklung deshalb dort eine lokale bzw. Test-Instanz eintragen (nicht
committen).

Verbindliche Regeln: `CLAUDE.md`. Teststrategie: `docs/TESTSTRATEGIE.md`.
