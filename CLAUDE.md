# CLAUDE.md – Spielplan-App FC Strass

Projektregeln für die Weiterentwicklung (Spielplan-App 2.0). Diese Regeln gelten für jede Sitzung.

## Projekt in Kürze

Statische Web-App (HTML + Vanilla JS, kein Build-Schritt) mit Supabase als Backend
(Postgres, PostgREST, Supabase Auth). Produktiv: GitHub Pages
`https://spielplanapp.christianaust.eu/`, Supabase-Projekt `nwutgxjnverlvmkrpiep`.
Architektur und Funktionen: `README.md`. Sicherheitsmodell: `docs/SICHERHEITSMODELL.md`.

| Pfad | Zweck |
|---|---|
| `index.html` + `app.js` | Leitstand MF/Admin (Login erforderlich) |
| `export.js` | Excel-/PDF-Export (Bibliotheken per CDN mit SRI) |
| `login.html` | Login MF/Admin (Supabase Auth) |
| `spieler.html` | Verfügbarkeitsabfrage **ohne Login**, nur über Token-RPCs |
| `helfer.html` | Helfer-Anmeldung (ohne Login, RPC) |
| `js/` | `config.js` (einzige Stelle für URL/Key), `sicherheit.js` (esc, Fehlertexte), `texte.js`, `rueckrunde.js` |
| `supabase/migrations/` | versionierte, **nicht angewendete** Migrationen |
| `supabase/baseline/` | rekonstruierter Produktiv-Ist-Zustand – **nur Tests** |
| `supabase/tests/`, `tests/` | pgTAP- bzw. JS-Tests |
| `schema.sql` | veraltet, nicht verwenden |

Die Datenbank wird mit der **SR-Anwendung (`sr_*`-Tabellen) geteilt** – diese
niemals ändern, keine pauschalen Rechteänderungen auf Schema-Ebene.

## Tests

```bash
npm install        # einmalig (jsdom, nur lokal)
npm test           # Unit-, DOM-, statische Tests
npm run test:db    # pgTAP in flüchtigem Docker-Container (127.0.0.1:55432)
npm run test:alle  # Pflicht vor jedem Merge nach main
```

## Verbindliche Regeln

1. **Nur auf separaten Branches entwickeln.** Hauptentwicklungsbranch ist
   `develop/spielplan-app-2.0`; Features auf eigenen Branches davon ableiten.
   Niemals direkt auf `main` committen.
2. **Kein Push und kein Merge nach `main` ohne ausdrückliche Freigabe** von Christian.
3. **Produktive Supabase-Datenbank nicht verändern.** Keine DDL, keine DML,
   keine Policy-Änderungen am Produktivprojekt.
4. **Keine produktiven Datenbankzugriffe ohne Freigabe** – auch keine lesenden
   Abfragen (SQL, MCP, REST, Dashboard). Jede Ausnahme wird vorher einzeln
   freigegeben. Entwicklung und Tests laufen gegen eine lokale Supabase-Instanz
   (`supabase start`) bzw. eine separate Test-Datenbank.
5. **Keine Secrets lesen, kopieren oder veröffentlichen.** Keine `.env`-Dateien,
   Service-Role-Keys, Passwörter oder Tokens auslesen, ausgeben, committen oder
   an externe Dienste senden. Der im Code stehende Publishable Key wird nicht
   in Dokumente, Issues oder Chats kopiert. Service-Role-Keys gehören nie in
   Frontend-Code.
6. **Automatisierte Tests vor jeder Änderung an `main`.** Ein Merge-Kandidat muss
   alle Tests (Unit, RLS/Policy-Tests, E2E-Smoke-Tests) grün bestehen; das
   Testergebnis wird im Merge-Vorschlag dokumentiert.
7. **Keine Deployments ohne ausdrückliche Freigabe.** Gilt für Webhosting,
   Supabase-Migrationen und Edge Functions.
8. **Spieler benötigen weiterhin keinen Login.** Die Abfrage per Link
   (`spieler.html?token=…` / `?alt=…`) bleibt der Zugangsweg. Absicherung erfolgt
   serverseitig (Token-geprüfte RPC-Funktionen), nicht über ein Spielerkonto.
9. **Bestehende Funktionen und Vorrundendaten erhalten.** Bereits verschickte
   Abfrage-Links müssen weiter funktionieren. Migrationen sind additiv und
   rückwärtskompatibel; Löschungen von Daten nur mit Freigabe und Backup.
10. **Spätere Migration auf eigene PostgreSQL-Infrastruktur (Titan_Ghost)
    berücksichtigen.** Logik bevorzugt in Standard-PostgreSQL (Tabellen, Views,
    Funktionen, Constraints) statt in Supabase-Spezialfunktionen. Datenzugriffe
    im Frontend über eine zentrale Datenzugriffsschicht kapseln, keine neuen
    verstreuten `sb.from(...)`-Aufrufe. Supabase-spezifische Abhängigkeiten
    (Auth, `auth.uid()`, Storage, Edge Functions) dokumentieren.
11. **Kein eigenständiges Redesign.** Das Oberflächendesign wird separat
    abgestimmt. Bestehende Farben/Gestaltung beibehalten, bis ein abgestimmtes
    Design vorliegt.

## Arbeitsweise

- Datenbankänderungen nur als versionierte Migrationsdateien
  (`supabase/migrations/…`), lokal getestet, nie direkt im Dashboard.
- Nutzereingaben (Namen, Anmerkungen, Gegner) beim Rendern immer mit `esc()`
  escapen – kein ungeprüftes `innerHTML` mit Daten; in `onclick` nur UUIDs.
- Öffentliche Seiten (ohne Login) greifen nie direkt auf Tabellen zu, nur auf
  RPCs; kein Browser-Speicher für Tokens.
- Nur ausdrücklich benötigte Spalten abfragen, kein `select('*')`.
- Jede neue `SECURITY DEFINER`-Funktion: `set search_path = ''`, Rechte
  explizit (`revoke … from public, anon, authenticated` + gezieltes `grant`).
- Jede neue Policy/Funktion bekommt Positiv- und Negativtests in `supabase/tests/`.
- Mehrstufige Schreibvorgänge (Verschiebung, Aufstellung) als eine
  transaktionale Datenbankfunktion umsetzen.
- Externe Bibliotheken mit fester Version einbinden.
- Commit-Nachrichten aussagekräftig und auf Deutsch.
