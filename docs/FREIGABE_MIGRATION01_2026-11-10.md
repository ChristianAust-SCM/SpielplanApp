# Freigabebericht Migration 01 · 10.11.2026

Migration: `supabase/migrations/20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql`
Branch: `develop/spielplan-app-2.0` · **nicht angewendet, nicht gepusht, kein Deployment**

**Gesamturteil: freigabefähig unter Vorbehalt.** Alle lokal prüfbaren Punkte sind BESTANDEN.
Die lesende Vorabprüfung gegen Produktion ist **UNGEPRÜFT**. Ich durfte sie nicht selbst
ausführen: Der Aufruf des Read-only-Zugangs wurde von der Sicherheitsfreigabe der Sitzung
blockiert. Sie muss vor der Anwendung laufen (siehe §4).

## 1. Ergebnis je Prüfpunkt

| # | Prüfpunkt | Ergebnis | Nachweis |
|---|---|---|---|
| 1 | Schutz vor Selbstvergabe von Adminrechten | **BESTANDEN** | Test `20_rollen` (11) und `90_migration01_allein` (19): Nutzer ohne Rolle und MF können sich weder Admin- noch MF-Rechte geben und keine Rolle oder Mannschaft ändern oder löschen. anon hat keinen Zugriff. |
| 2 | Bestehende Anmeldungen und Rollen | **BESTANDEN** (lokal) / **UNGEPRÜFT** (Produktion) | Die Login-Abfrage von `main:app.js` (eigene Rollen samt Embed `mannschaften`) liefert für MF und Admin dasselbe Ergebnis wie vorher. Bestehende Rollenzeilen ändert die Migration nicht. Wie viele Admin-Konten es produktiv gibt und ob seit dem Audit Rollen dazugekommen sind, zeigt erst die Vorabprüfung (10f, 10g). |
| 3 | Auswirkungen auf Mannschaftsführer | **BESTANDEN** | Status setzen und Aufstellung für die eigene Mannschaft funktionieren wie bisher, für fremde Mannschaften sind sie wie bisher gesperrt. Die Aufstellungs-Policies lesen `nutzer_rollen` weiterhin richtig. Einzige Verhaltensänderung: TRUNCATE ist gesperrt (vom Frontend nie genutzt). |
| 4 | Keine Beeinträchtigung der SR-Anwendung | **BESTANDEN** (Test + Audit) / **UNGEPRÜFT** (Drift seit Audit) | Katalogvergleich vor und nach 01 (Rechte, RLS, Policies, Trigger, `public`-Funktionen außerhalb der Spielplan-Tabellen) ohne Unterschied, mit SR-Platzhaltern nach produktivem Muster. Laut Audit und Archiv-TOC referenziert keine SR-Policy `nutzer_rollen`; neues Schema `private` existiert produktiv nicht. Die Migration ändert nur `nutzer_rollen` und entzieht TRUNCATE/TRIGGER/REFERENCES auf den zehn Spielplan-Tabellen. |
| 5 | Aktueller Backup- und Restore-Nachweis | **BESTANDEN** mit Einschränkung | Backup `2026-11-09_120246` (verschlüsselt, Prüfsummen OK). Isolierter Restore am 09.11. (Netz `none`, Exit 0, 0 Fehler, 18/18 Tabellen und 2.959 Datensätze stimmen). Einschränkungen: Rollen-Memberships nicht bitgenau; Supabase-Dienste außerhalb Postgres nicht getestet. **Vor der Anwendung ist ein frisches Backup nötig** (der Stand ist von gestern 12:02). |
| 6 | Vorhandene Tests und Ergebnisse | **BESTANDEN** | `scripts/db-test.sh`: alle Stufen grün, 255 pgTAP-Prüfungen plus 4 Skriptprüfungen. `node --test`: 51/51. Ausgeführt am 10.11.2026 lokal im flüchtigen Container, danach entfernt. |
| 7 | Konkreter Rückfallplan | **BESTANDEN** | Neues Skript `supabase/rollback/R01_rollen_policies_wiederherstellen.sql`. Im Test stellt es den Katalog exakt wieder her (Diff leer), danach weist Test `10` den Ausgangszustand nach. Es verweigert sich, sobald 02 angewendet ist. |
| 8 | Lesende Vorabprüfung gegen Produktion | **UNGEPRÜFT** | Blockiert, siehe oben. Skript lokal gegen den Ist-Zustand validiert (läuft fehlerfrei, read-only-Transaktion). |
| 9 | Echter Supabase-Stack (PostgREST) und Browser | **UNGEPRÜFT** | Lücken T1/T2 der Teststrategie. Für 01 ist das Risiko gering: PostgREST setzt dieselben Rollen wie die Tests. |
| – | FEHLGESCHLAGEN | **keine** | – |

## 2. Restrisiken

1. **Eine bereits erfolgte Selbstvergabe bleibt bestehen.** Migration 01 verhindert nur
   neue. Laut Audit gibt es 9 Rollenzeilen bei 5 Konten. Vor oder direkt nach der Anwendung
   sollte Christian im Dashboard selbst prüfen, ob jede Admin- und MF-Zeile legitim ist.
   Die Vorabprüfung gibt dazu nur Zahlen aus, keine Namen.
2. **Policy-Drift seit dem Audit** (09.11. 11:56): Falls inzwischen weitere Policies auf
   `nutzer_rollen` angelegt wurden, bleiben sie bestehen und könnten den Schutz aushebeln.
   Das zeigt die Vorabprüfung 10a. Bei Abweichung **nicht** anwenden.
3. **Supabase-Eigentümerrolle:** `private.ist_admin()` liest `nutzer_rollen` als
   Eigentümer an RLS vorbei. Das setzt voraus, dass die Migration als `postgres`
   (Tabelleneigentümer) läuft. Das ist laut Audit und TOC so; bestätigt wird es durch 10b/10c.

## 3. Git-Stand

* Branch `develop/spielplan-app-2.0`, Basis `main` @ `65ceb9f` (unverändert, kein Push).
* Commits seit Beginn der Nacht (09.11.2026):

| Commit | Zeit | Inhalt |
|---|---|---|
| `d865916` | 23:26 | Projektregeln (`CLAUDE.md`) und Bestandsanalyse |
| `956d802` | 23:26 | DB-Sicherheitsmigrationen 01–04/09 mit pgTAP-Tests |
| `eae430d` | 23:39 | Frontend: Serverfunktionen, XSS-Schutz, Rückrunde, CSV-Import |
| `ac446e7` | 23:41 | Doku: README, Sicherheitsmodell, Runbook, Teststrategie, Vorabprüfung |
| `ecb1bb5` | 23:43 | Übergabe Nachtarbeit |
| *dieser Commit* | 10.11. | Freigabeprüfung 01: Einzeltest, SR-Katalogvergleich, Rückfall R01, Vorabprüfung erweitert, dieser Bericht |

## 4. Ablauf bis zur Anwendung (jeder Schritt mit eigener Freigabe)

1. **Vorabprüfung lesend ausführen** (Christian, über den eigenen Read-only-Zugang):
   `supabase/pruefung/vorabpruefung_readonly.sql`, Ausgabe in eine Datei.
   Sollwerte für Migration 01:
   * 10a: genau „Admins verwalten Rollen“ (ALL) und „Eigene Rollen lesen“ (SELECT)
   * 10b: Owner `postgres`, RLS `t`, FORCE `f`
   * 10d: nur `aufstellung_*`, Rolle `{authenticated}`
   * 10e: keine Zeilen
   * 10f: `admin_konten` ≥ 1
   * 10g: keine neuen Rollen oder nur bekannte
   * 2: kein Schema `private`
2. Rollenzeilen im Dashboard auf Legitimität prüfen (Restrisiko 1).
3. Frisches Backup und Prüfsummen (wie Backup `2026-11-09_120246`).
4. Migration 01 als `postgres` anwenden (eine Transaktion, bricht bei Fehler vollständig ab).
5. Kontrolle direkt danach: MF-Login und Admin-Login im Leitstand, eine Spielerantwort
   über einen bestehenden Link, SR-App aufrufen; Katalogabfrage 10a zeigt die vier
   neuen Policies `nutzer_rollen_*`.
6. **Rückfall**, falls Login oder Leitstand gestört sind: `R01_…` als `postgres`
   anwenden. Das öffnet die Lücke wieder und ist daher nur als Überbrückung bis
   zur korrigierten Migration gedacht. Ein Daten-Restore ist nicht nötig, weil 01
   keine Daten ändert.
