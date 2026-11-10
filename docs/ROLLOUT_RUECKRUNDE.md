# Rollout Spielplan-App 2.0 bis zur Rückrunde

Stand 10.11.2026. Migration 01 ist produktiv (07:00, Backup `2026-11-10_065854`).
**Stufe A (02–05) ist produktiv** (08:50, Gibbs-Task `t_a6675f04`, Backup `2026-11-10_084621`,
Nachprüfung 24/24 PASS, Daten 302 Zeilen und SR-Policies 19 unverändert, R02_05 bereit).
Offen: Funktionsprobe A7 durch Christian.
Alles Weitere ist in Staging mit echtem Stack geprüft (`docs/STAGING.md`, 38/38).

Jede Stufe hat eine eigene Freigabe. Ausführung der Datenbankschritte durch Gibbs
nach dem Muster von Migration 01: Prüfsummen, frisches Backup, Vorabprüfung,
Anwendung, Nachprüfung, STOPP bei Abweichung.

## Stufe A – Datenbank 02–05 (kompatibel mit dem jetzigen Frontend)

| Schritt | Inhalt | STOPP wenn |
|---|---|---|
| A1 | Frisches verschlüsseltes Backup (wie `2026-11-10_065854`), 19/19 Zählabgleich | Fehler/Abweichung |
| A2 | `vorabpruefung_readonly.sql`: Abschnitt 3 = 0, Abschnitt 7 = 0/0, Abschnitt 8 Werte 1–12, Abschnitt 2 nur Schema `private` mit 7 Funktionen, keine Konflikte bei den 12 Funktionsnamen | jede Abweichung |
| A3 | `nachpruefung_02_05_readonly.sql` + `rechtecheck_readonly.sql` → *vorher* | – |
| A4 | Migrationen 02, 03, 04, 05 einzeln mit `psql -X -v ON_ERROR_STOP=1 -f …` als `postgres`; jede Datei ist eine eigene Transaktion | Exit ≠ 0 → nicht weitermachen, Nachprüfung lesend, berichten |
| A5 | `nachpruefung_02_05_readonly.sql` *nachher*: 12 Funktionen (5 mit anon), `private.einstellungen`/`abfrage_links`, `spieltermine.saison` generiert, Policies SR = 19, anon kein `ttr`/`spieler_token`/`mf_email`, Zeilenzahlen und Tokens wie vorher | Abweichung → Rückfall A-R |
| A6 | `rechtecheck_readonly.sql` *nachher*: MF sehen nur ihre Mannschaft (Termine/Aufstellungen/Verfügbarkeiten jetzt **auf die eigene Mannschaft begrenzt**, vorher alle 23/180), Admins alles | Abweichung → A-R |
| A7 | Christian: Login MF + Admin im **jetzigen** Frontend, eine Antwort über einen bestehenden Link | Störung → A-R |

Zu A6: Dass die Mannschaftsführer nach 03 nur noch ihre eigene Mannschaft sehen,
ist die beabsichtigte Behebung von Audit-Befund 5. Das jetzige Frontend zeigt
ohnehin nur die eigene Mannschaft (Staging `kompat` 9/9).

**Rückfall A-R (getestet):** `supabase/rollback/R02_05_nur_migration01_wiederherstellen.sql`
als `postgres`. Es stellt den Rechtezustand nach Migration 01 exakt her (Katalogvergleich
in `npm run test:db` ohne Unterschied); der Rollenschutz aus 01 bleibt bestehen.
Spalten, Indizes und `private.*`-Tabellen bleiben erhalten (additiv), Daten werden nicht
verändert. Danach lassen sich 02–05 erneut anwenden (getestet). Solange 09 angewendet ist,
verweigert sich das Skript; dann zuerst R09. R01 gilt nach 02 nicht mehr.

**Übergangsphase geprüft:** Das jetzige Frontend erzeugt bei Verlegungen noch Tokens im
Browser. Nach 02 ersetzt der Server sie; das alte Frontend lädt danach die Termine neu
und verschickt den Server-Token. Bestehende Links bleiben gültig (Staging `kompat`, pgTAP `70`).

## Stufe B – neues Frontend (GitHub Pages)

| Schritt | Inhalt |
|---|---|
| B1 | Merge `develop/spielplan-app-2.0` → `main`, Push. **Braucht Christians Freigabe**; vorher `npm run test:alle` und `scripts/staging.sh laufrollout` grün, Ergebnis in die PR-Beschreibung |
| B2 | GitHub Pages veröffentlicht automatisch aus `main` |
| B3 | Christian (5 min, Smartphone): MF-Login, Rückrunde-Umschalter sichtbar, ein bestehender Spielerlink antwortet, WhatsApp-Knopf öffnet WhatsApp mit Text, ein Export |
| B-R | Rückfall: `git revert` des Merge-Commits auf `main` und Push (Freigabe); die Datenbank bleibt auf 02–05, das alte Frontend ist damit kompatibel |

## Stufe C – Migration 09 (anonymer Tabellenzugriff entzogen)

Frühestens nach B3, sinnvollerweise wenige Tage nach B ohne Störung.

| Schritt | Inhalt |
|---|---|
| C1–C3 | Backup, `nachpruefung_02_05_readonly.sql` vorher, Migration 09 |
| C4 | Nachprüfung: anon nur noch `vereinsbefragung` INSERT, keine Spielplan-Tabellen; RPCs für anon weiter ausführbar |
| C5 | Christian: eine Antwort über einen bestehenden Link |
| C-R | `supabase/rollback/R09_anon_altpfad_wiederherstellen.sql` (getestet) |

## Danach: Rückrundentermine

`docs/RUECKRUNDE_IMPORT.md`. Geht ab Stufe B; Stufe C ist dafür nicht nötig.
