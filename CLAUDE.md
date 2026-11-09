# CLAUDE.md – Spielplan-App FC Strass

Projektregeln für die Weiterentwicklung (Spielplan-App 2.0). Diese Regeln gelten für jede Sitzung.

## Projekt in Kürze

Statische Web-App (HTML + Vanilla JS, kein Build-Schritt) mit Supabase als Backend
(Postgres, PostgREST, Supabase Auth). Live unter `https://spielplanapp.christianaust.eu/`.

| Datei          | Zweck                                                          |
|----------------|----------------------------------------------------------------|
| `index.html`   | Mannschaftsführer-/Admin-Leitstand (Login erforderlich)        |
| `app.js`       | Logik des Leitstands (Spielplan, Verschiebung, Aufstellung)    |
| `export.js`    | Excel-/PDF-Export (ExcelJS, jsPDF – per CDN nachgeladen)       |
| `login.html`   | Login für MF/Admin (Supabase Auth, E-Mail + Passwort)          |
| `spieler.html` | Verfügbarkeitsabfrage für Spieler **ohne Login** (Token-Link)  |
| `helfer.html`  | Helfer-Anmeldung Mitternachtsturnier (ohne Login)              |
| `schema.sql`   | Schema v1 – **veraltet**, entspricht nicht der Produktiv-DB    |

Analyse und Entwicklungsplan: `docs/ANALYSE-UND-PLAN-2.0.md`.

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
- Nutzereingaben (Namen, Anmerkungen, Gegner) beim Rendern immer escapen –
  kein ungeprüftes `innerHTML` mit Daten.
- Mehrstufige Schreibvorgänge (Verschiebung, Aufstellung) als eine
  transaktionale Datenbankfunktion umsetzen.
- Externe Bibliotheken mit fester Version einbinden.
- Commit-Nachrichten aussagekräftig und auf Deutsch.
