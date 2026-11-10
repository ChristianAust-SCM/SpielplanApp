# Sicherheitsmodell Spielplan-App 2.0

Stand 09.11.2026. Grundlage sind der Read-only-Strukturaudit vom 09.11.2026
(nur Katalogdaten, keine Inhalte) und der Quellcode.

## 1. Ausgangslage (Audit bestätigt, in `supabase/tests/10_*` nachgestellt)

| # | Befund | Ursache |
|---|---|---|
| A1 | **Selbstvergabe von Adminrechten** | Policy „Admins verwalten Rollen“ `FOR ALL USING (auth.uid() = user_id)` ohne eigenes `WITH CHECK` → jeder Angemeldete darf eigene Zeilen mit `rolle='admin'` einfügen |
| A2 | anon liest alle Spieler, TTR, Spielertokens, MF-E-Mails, alle Antworten/Anmerkungen und **alle Abfrage-Tokens** | `SELECT USING (true)` für `public` auf allen Kerntabellen |
| A3 | anon schreibt/überschreibt beliebige Antworten, legt Spieler an | `INSERT/UPDATE … (true)` auf `verfuegbarkeiten`, `INSERT (true)` auf `spieler` |
| A4 | MF nicht auf eigene Mannschaft begrenzt | `spieltermine`, `alternativtermine`, `verfuegbarkeiten`: nur `auth.uid() IS NOT NULL` |
| A5 | Zu breite Grants | anon/authenticated haben ALLE Rechte inkl. `TRUNCATE` (umgeht RLS) |
| A6 | Token ist keine Berechtigungsgrenze | Seite filtert nur per `.eq('abfrage_token', …)` (Token landet zudem in GET-URLs/Logs) |
| A7 | Stored XSS im Leitstand | anonym anlegbare Spielernamen/Anmerkungen werden per `innerHTML` ungefiltert gerendert → Code läuft in MF-/Admin-Sitzung |
| A8 | Tokens im Browser per `Math.random()` erzeugt | Verschiebung ohne Stimmübernahme |

Wichtig: In derselben Datenbank liegen die Tabellen der SR-Anwendung (`sr_*`).
Keine Migration ändert sie, und es gibt keine pauschalen Änderungen wie
`ALL TABLES IN SCHEMA` oder `ALTER DEFAULT PRIVILEGES`. Ein statischer Test
prüft das.

## 2. Zielmodell

### Rollen
* **anon** (Spieler, Helfer): nach Migration 09 **kein** Tabellenzugriff. Es
  bleibt nur `EXECUTE` auf `abfrage_laden`, `abfrage_antworten`,
  `abfrage_nachmelden`, `helfer_eintragen` und `oeffentlicher_spielplan`.
* **authenticated / MF**: liest und ändert nur Mannschaften aus
  `nutzer_rollen`. Am Spieltermin darf er nur den Verschiebungsstatus umschalten
  (Trigger). Er kann keine Termine anlegen oder löschen und keine Rollen vergeben.
* **authenticated / Admin** (`rolle='admin'`): verwaltet alles, auch Rollen. Der
  letzte Admin ist gegen versehentliches Löschen geschützt.
* Berechtigungsfunktionen: `private.ist_admin()`, `private.darf_mannschaft()`,
  `private.darf_termin()`. Sie sind SECURITY DEFINER mit festem `search_path` und
  über die API nicht erreichbar.

### Spielerlinks ohne Login
* Token-Prüfung **serverseitig** in `private.link_aufloesen(token)`:
  1. **Neue Links** (`private.abfrage_links`): Gespeichert wird nur der
     SHA-256-Hash. Jeder Link ist an Termin bzw. Alternativtermin gebunden,
     optional an einen Spieler (persönlicher Link). Er hat ein Ablaufdatum
     (`gueltig_bis`, Standard: 2 Tage nach dem Spieltag) und kann widerrufen
     werden (`widerrufen_am`).
  2. **Bisherige Links** (`spieltermine.abfrage_token`,
     `alternativtermine.abfrage_token`) bleiben gültig, solange die Einstellung
     `legacy_links_erlaubt = true` gilt. Sie lassen sich gezielt per
     `abfrage_token_erneuern()` widerrufen.
* `abfrage_laden` liefert nur Termin, Mannschaftsname/-liga und die Namen der
  aktiven Spieler. Persönliche Links liefern nur den eigenen Namen und die eigene
  Antwort. Nicht enthalten sind TTR, E-Mail, Tokens und fremde Antworten.
* `abfrage_antworten` prüft Token, die Zugehörigkeit des Spielers zur Mannschaft
  des Termins, aktiv/inaktiv, Wertebereich und Anmerkungslänge. Bei persönlichen
  Links ist nur der eigene Spieler erlaubt. Gespeichert wird per Upsert auf
  `verfuegbarkeiten_unique` (`NULLS NOT DISTINCT`), also ohne Dubletten.
* `abfrage_nachmelden`: nur über gemeinsame Links. Erlaubt sind Namen aus
  Buchstaben (3–60 Zeichen), keine Doppelnamen, höchstens 5 Nachmeldungen je
  Mannschaft und 24 h. Die Zeile wird mit `nachgemeldet_am` markiert, damit der
  MF sie prüfen kann.
* Trigger auf `verfuegbarkeiten` (gilt auch für den Altpfad): Spieler und Termin
  müssen zur selben Mannschaft gehören, der Alternativtermin zum Spieltermin.
* Tokens erzeugt ausschließlich der Server (Trigger und Funktionen) aus
  2 × `gen_random_uuid()` = 244 Zufallsbits.

### Browser
* Datenwerte im HTML laufen immer durch `SPS.esc()`. In `onclick` stehen nur
  UUIDs, WhatsApp-Texte liegen in einer Map. Eingeschleuste HTML-Payloads prüfen
  die DOM-Tests.
* Spielerseite: keine Supabase-Session, kein Browser-Speicher, keine
  Konsolenausgabe. Das Token wird per POST (RPC) gesendet, nicht als
  URL-Parameter an die API.
* Alle Seiten setzen `<meta name="referrer" content="no-referrer">`. Externe
  Links haben `rel="noopener noreferrer"`. Analytics gibt es keine. Bibliotheken
  sind mit fester Version und SRI eingebunden.
* **Vorbereitet, nicht umsetzbar über GitHub Pages:** HTTP-Header (CSP,
  `Referrer-Policy`) lassen sich dort nicht setzen. Eine CSP per `<meta>` ist
  möglich, braucht aber vorher einen Umbau der Inline-Handler (`onclick=`).
  Das steht im Plan unter Phase 3.

## 3. Übergang (Parallelbetrieb)

| Schritt | DB-Zustand | Frontend | anon kann |
|---|---|---|---|
| heute | Baseline | alt | alles lesen/schreiben (A1–A6) |
| 1 | + Migration 01 | alt | wie heute, **aber keine Selbstvergabe von Adminrechten, kein TRUNCATE** |
| 2 | + 02, 03, 04 | alt **oder** neu | Altpfad eingeschränkt: Termine/Alternativtermine, Spielernamen, Antworten (für Upsert nötig). TTR, Spielertokens, E-Mails, Aufstellungen, Rollen, Vereine und Helferliste nicht mehr. MF begrenzt. |
| 3 | unverändert | **neu** ausgerollt | wie Schritt 2, neue Seite nutzt nur RPCs |
| 4 | + Migration 09 | neu | **nur RPCs** |

Bestehende WhatsApp-Links funktionieren in jedem Schritt weiter, weil die URLs
gleich bleiben. Rückfall von Schritt 4 auf 3: `supabase/rollback/R09_…`.

## 4. Offene fachliche Entscheidung: gemeinsamer oder persönlicher Link

| | Gemeinsamer Spieltagslink (heute) | Persönlicher Link je Spieler |
|---|---|---|
| Ablauf | 1 Link in die WhatsApp-Gruppe | jeder Spieler bekommt eigenen Link (z. B. pro Halbrunde) |
| Risiko | Wer den Link hat, kann für **jeden** Spieler der Mannschaft antworten (nur diese Mannschaft, nur dieser Termin) | nur eigene Antwort; Missbrauch nachvollziehbar |
| Aufwand | gering | Linkverteilung nötig |

Technisch ist beides umgesetzt und getestet. Bewusst **noch nicht** umgesetzt:
die Bedienoberfläche zum Erzeugen und Verteilen persönlicher Links und das
Abschalten des Altpfads. Beides wartet auf die Entscheidung. Eine mögliche
Zwischenlösung: gemeinsamer Link plus persönliche Links für Spieler, die das
wünschen.

## 5. Bekannte Restrisiken

* Bis Migration 09 kann anon über den Altpfad weiterhin Termine, Tokens,
  Spielernamen und Antworten lesen. Das verlangt die Rückwärtskompatibilität.
  Deshalb sollte Migration 09 bald nach dem Frontend-Rollout folgen.
* Gemeinsame Links erlauben Antworten im Namen anderer Spieler derselben
  Mannschaft (siehe Abschnitt 4).
* Ein Rate-Limit pro IP fehlt (in SQL nicht sinnvoll umsetzbar). Begrenzt sind
  Nachmeldungen und Helfer-Eintragungen. Weitere Option: Edge Function oder
  Captcha.
* `vereinsbefragung`: Der anonyme INSERT bleibt bestehen, weil die nutzende
  Seite nicht im Repository liegt. Die Spaltenliste ist unbekannt.
* Die Spaltenliste in der Baseline ist aus dem Code abgeleitet. Vor der
  Anwendung den Strukturabgleich ausführen (`docs/MIGRATIONSPLAN.md`).
