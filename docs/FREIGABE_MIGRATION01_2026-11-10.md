# Freigabebericht Migration 01 · 10.11.2026 (Stand 06:20)

Migration: `supabase/migrations/20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql`
Branch: `develop/spielplan-app-2.0` · **produktiv angewendet am 10.11.2026 07:00 (Backup `2026-11-10_065854`), Ergebnis: `PRODUKTIV_MIGRATION01_2026-11-10.md`**

**Gesamturteil: Migration 01 ist inhaltlich vollständig freigabefähig.** Vor der Anwendung
fehlt nur noch ein Nachweis: ein frisches, verifiziertes Backup (§5). Bei einer
Abweichung bei den MF-Konten (§2.2) entscheidest du, ob sie vorher geklärt wird.
Sie blockiert 01 nicht.

## 1. Produktive Vorabprüfung (lesend, über Gibbs)

* Durchgeführt von Gibbs (Hermes-Kanban-Task `t_929f0b34`) über den bestehenden
  Read-only-Zugang, 10.11.2026 06:15:27–06:15:28, Exit-Code 0, Rolle `postgres`, in einer
  `read only`-Transaktion, die mit `rollback` endet.
* Skript-SHA-256 `5f2fa735…a336`, vor dem Lauf geprüft. Ausgabe:
  `~/backups/spielplan-app/audit/vorabpruefung_2026-11-10_061527.txt` (Modus 600,
  ausschließlich Struktur, Zahlen, Mannschaftsnamen, Pseudonyme).
* Claude hat keine Secrets und keinen Produktionszugang geöffnet.

| Sollwert für 01 | Produktion | Ergebnis |
|---|---|---|
| Policies auf `nutzer_rollen` = Stand Audit | genau „Admins verwalten Rollen“ (ALL) + „Eigene Rollen lesen“ (SELECT) | **BESTANDEN**, keine Drift |
| Owner `postgres`, RLS an, nicht FORCE | `postgres` / `t` / `f` | **BESTANDEN** |
| Migration läuft als Eigentümer mit BYPASSRLS | `postgres`, `rolbypassrls = t` | **BESTANDEN** (`ist_admin()` ohne Rekursion) |
| Kein Schema `private`, keine Namenskonflikte | keine | **BESTANDEN** |
| Fremde Policies auf `nutzer_rollen` nur für authenticated | nur `aufstellung_*`, `{authenticated}` | **BESTANDEN** (anon verliert nichts, was es nutzt) |
| Keine Funktion oder View, die `nutzer_rollen` an RLS vorbei schreibt | keine | **BESTANDEN** |
| Keine Trigger auf den betroffenen Tabellen | keine | **BESTANDEN** |
| Mindestens ein Admin-Konto | 2 | **BESTANDEN** |
| Keine Rollen seit dem Audit | 0 neue | **BESTANDEN** |

## 2. Plausibilität der neun Rollenzuordnungen (pseudonymisiert)

| Befund | Bewertung |
|---|---|
| 5 Konten = 2 Admin-Konten + 3 MF-Konten; kein Konto ohne Rolle, keine Rolle ohne Konto | plausibel |
| Jedes Admin-Konto hat je eine Admin-Zeile für alle 3 Mannschaften (2 × 3 = 6 Zeilen) | plausibel, einheitliches Muster |
| Jede Mannschaft hat genau ein MF-Konto, jedes MF-Konto genau eine Mannschaft | plausibel |
| Alle 9 Zeilen am Einrichtungstag 04.07.2026 angelegt, keine später | spricht gegen eine nachträgliche Selbstvergabe |
| Alle Konten haben eine bestätigte E-Mail und waren zwischen Juli und Oktober 2026 angemeldet | plausibel, keine verwaisten Konten |

**Abweichungen (nicht blockierend für 01):**

1. **Zwei Admin-Konten.** Ob beide Personen Admin sein sollen, kann ich ohne
   Personendaten nicht beurteilen. Bitte im Dashboard bestätigen (Pseudonyme `1f0efc`, `45086f`).
2. **MF-Login und MF-Kontaktadresse stimmen nicht überein.** Bei allen drei MF-Konten
   unterscheidet sich die Login-E-Mail von `mannschaften.mf_email`. Möglich sind
   getrennte Adressen für Login und Kontakt oder veraltete Kontaktdaten. Das betrifft
   nur die Anzeige und Exporte, nicht die Rechte. Bitte prüfen.
3. Nebenbefund für Migration 02: **1 Verfügbarkeit** stammt von einem Spieler einer
   anderen Mannschaft als der des Termins. Sie bleibt erhalten. Nach 02 laufen neue
   Antworten nur noch mannschaftsgenau, Ersatz läuft über die Aufstellung.
   Das entspricht der Festlegung „keine zusätzliche Ersatzlogik“.

## 3. Wirkung von Migration 01

* **Schließt nur die vorgesehene Lücke: BESTANDEN.** Geändert werden
  1. die Policies auf `nutzer_rollen` (lesen: eigene Zeilen oder Admin; schreiben: nur Admin),
  2. der Schutz des letzten Admins,
  3. der Entzug von TRUNCATE/TRIGGER/REFERENCES auf den 10 Spielplan-Tabellen,
  4. neue Hilfsfunktionen im Schema `private`, das über die API nicht erreichbar ist.

  Daten und Spalten ändert sie nicht.
* **Mannschaftsführer-Funktionen erhalten: BESTANDEN.** Die Login-Abfrage des
  produktiven Frontends (`main:app.js`) liest nur eigene Zeilen. Das ist für MF
  identisch mit vorher, Admins sehen zusätzlich alle Rollen. Status setzen,
  Aufstellung (eigene Mannschaft) und Spielerlinks funktionieren unverändert
  (Test `90_migration01_allein`, 19 Prüfungen).
* **SR-Anwendung: BESTANDEN.**
  * Produktiv nutzt keine SR-Policy `nutzer_rollen`.
  * Die einzige `public`-Funktion ist die SR-Funktion `sr_abrechnung_markieren`; sie ist unberührt.
  * Im Test sind Rechte, RLS, Policies, Trigger und Funktionen außerhalb der
    Spielplan-Tabellen vor und nach 01 identisch.
  * Die Rechteänderungen sind tabellengenau, nichts auf Schema-Ebene.

## 4. Tests (ergänzt, nicht wiederholt)

* **Neu:** Die Baseline ist mit den produktiven Spalten abgeglichen. Abweichungen
  waren `aufstellungen.erstellt_am`, NOT-NULL-Felder, `mannschaften.min_spieler`
  existiert bereits, `vereinsbefragung`-Spalten. Danach einmal der volle Lauf:
  alle Stufen grün, 260 pgTAP-Prüfungen plus 5 Skriptprüfungen (Vorabprüfung
  lauffähig, SR-Katalogvergleich, R01-Katalogvergleich, R01-Sperre nach 02).
  JS: 51/51.
* **Neu:** Migration 05 `mannschaftsstaerken` mit 6/6/4 und Test `65`
  (nicht Teil von 01, erst nach 02).

## 5. Sicherungsstand

* **Letztes verifiziertes Backup:** `2026-11-09_120246`.
  * verschlüsselt, Prüfsummen OK
  * isolierter Restore am 09.11. (Exit 0, 0 Fehler, 18/18 Tabellen, 2.959 Datensätze)
* Seitdem gab es keine Rollenänderungen. Spielbetrieb, also neue Antworten, ist möglich.
* **OFFEN:** Das Backup ist etwa 18 Stunden alt. Vorgabe ist ein frisches,
  verifiziertes Backup unmittelbar vor der Anwendung (Lauf wie `2026-11-09_120246`
  plus Prüfsummen und Zählabgleich). Es ist nicht vorab erstellt, weil es sonst bis
  zur Anwendung wieder veraltet. Für Migration 01 selbst ist kein Daten-Restore nötig,
  weil sie keine Daten ändert.

## 6. Exakter Ablauf Migration 01

| Schritt | Wer | Inhalt | Abbruchkriterium |
|---|---|---|---|
| 0 | Christian | Freigabe dieses Berichts, Zeitfenster außerhalb von Spieltagen | – |
| 1 | Gibbs | frisches Backup wie `2026-11-09_120246`: Dump, Verschlüsselung, SHA-256, Zählabgleich gegen die Quelle | Fehler oder Zählabweichung |
| 2 | Gibbs | Vorabprüfung erneut (Skript mit neuer Prüfsumme, s. u.), Abschnitt 10 gegen §1 vergleichen | jede Abweichung |
| 3 | Gibbs | Migration 01 einmalig als `postgres` mit `psql -v ON_ERROR_STOP=1 -1 -f …` | jeder Fehler → Transaktion bricht vollständig ab, nichts geändert |
| 4 | Gibbs | Kontrollabfragen lesend: 4 Policies `nutzer_rollen_*`, Trigger `nutzer_rollen_letzter_admin`, `has_table_privilege('anon','public.verfuegbarkeiten','TRUNCATE') = false`, SR-Policies unverändert (Anzahl 44 − 2 + 4 = 46) | Abweichung → Schritt R |
| 5 | Christian | Funktionsprobe: Login als MF und als Admin, eine Testantwort über einen bestehenden Link, SR-App aufrufen | Störung → Schritt R |
| R | Gibbs | Rückfall: `supabase/rollback/R01_rollen_policies_wiederherstellen.sql` als `postgres` (eine Transaktion), dann Schritt 4 mit Sollwert „Zustand vor 01“ | – |

**Rückfallweg R01 (getestet):** Er stellt Policies, Grants und Schema exakt her
(Katalogvergleich im Test ohne Unterschied) und weist danach den Ausgangszustand
nach. Er verweigert sich, sobald Migration 02 angewendet ist. Er öffnet die Lücke
wieder und ist deshalb nur als Überbrückung gedacht. Ein Daten-Restore ist
nicht erforderlich.

Hinweis: Die Vorabprüfung wurde nach dem Lauf um Abschnitt 8
(Mindeststärken) ergänzt. Für Schritt 2 gilt die neue Prüfsumme der Datei im
freigegebenen Commit.

## 7. Staging (echter Stack + Browser)

Ausgeführt am 10.11.2026 (Variante A freigegeben), **bestanden**. Ergebnis siehe §9.

## 8. Git

| Commit | Inhalt |
|---|---|
| `d865916` · `956d802` · `eae430d` · `ac446e7` · `ecb1bb5` | Nacht 09.11. (Regeln, Migrationen, Frontend, Doku, Übergabe) |
| `3c75156` | Freigabeprüfung 01: Einzeltest, SR-Katalogvergleich, R01 |
| `777908a` | Vorabprüfung: pseudonymisierte Rollenplausibilität |
| *dieser Commit* | Abgleich Baseline mit Produktion, Migration 05 (6/6/4), Staging-Vorbereitung, dieser Bericht |

`main` unverändert @ `65ceb9f`, kein Push.

## 9. Staging-Lauf 01 (10.11.2026, Austicore, lokal)

* Umgebung:
  * Supabase-CLI 3.0.0, offizielle Images: Postgres 17.11, PostgREST 16.5,
    GoTrue 2.197, Kong 2.8.1. Produktion läuft auf Postgres 17.6, kleiner Versionsunterschied.
  * Browser: Chromium Desktop und WebKit iPhone 13 im Image
    `mcr.microsoft.com/playwright:v1.49.1-noble`.
  * Ressourcen: 4 CPU, 22 GiB RAM, 290 GB frei.
* Daten: nur Baseline, synthetischer Seed und SR-Platzhalter. Das Frontend lief als
  Kopie von `main`, auf den lokalen Stack umgeschrieben (Abbruch, falls die
  produktive URL verbleibt). Jede Browser-Anfrage an Produktion wird blockiert und
  lässt den Test fehlschlagen. Es gab keine.

| Stufe | Ergebnis |
|---|---|
| Ist-Zustand | 8/8: Login MF/Admin, Spielerlink, SR-Platzhalter; Selbstvergabe per REST **gelingt** (HTTP 201, Lücke real nachgewiesen) |
| nach Migration 01 | 9/9: gleiche Funktionen in beiden Browsern; Selbstvergabe → **HTTP 403**; MF-Hochstufung ändert 0 Zeilen; SR-Platzhalter lesen/schreiben wie vorher; Katalog außerhalb der Spielplan-Tabellen **unverändert** |
| nach Rückfall R01 | 8/8: Ausgangszustand wieder da; Katalog **exakt** wie vorher |
| Migration 01 erneut | 9/9 |

**Fehler und Korrekturen:**

1. Die Host-Browser starteten nicht, weil Systembibliotheken fehlen. Eine `apt`-Installation
   wäre systemweit gewesen; stattdessen läuft Playwright im offiziellen Image.
2. `lauf01` lief durch, kehrte aber nicht zurück: Der Webserver hielt die Ausgabe offen.
   Behoben mit `setsid`, `</dev/null` und `--directory`; der Stack wird am Ende
   automatisch beendet.
3. Ergänzt wurden Prüfungen gegen Produktionszugriffe, Katalogvergleiche gegen den
   echten Stack und der SR-Platzhalter-Test.

Danach Neustart von `lauf01`: Exit 0, 34/34 bestanden. Staging-Container und
-Volumes sind entfernt; die bestehenden Container (freelab, n8n, portainer) liefen
durchgehend unverändert.

