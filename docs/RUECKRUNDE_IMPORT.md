# Rückrundentermine einspielen

Der Import ist fertig, eine erneute Programmierung ist nicht nötig. Er läuft
im Leitstand und braucht Admin-Rechte. Voraussetzung: Migrationen 02–04 und das
neue Frontend sind produktiv (siehe `ROLLOUT_RUECKRUNDE.md`).

## 1. Datei füllen (ca. 10 Minuten)

Vorlage: `vorlagen/rueckrunde_2026-27.csv`. Sie enthält nur die Kopfzeile und
lässt sich mit Excel oder LibreOffice öffnen; als CSV speichern, Trenner `;` oder `,`.

| Spalte | Pflicht | Format | Beispiel |
|---|---|---|---|
| Mannschaft | ja | `1. Mannschaft`, `2. Mannschaft`, `3. Mannschaft` (auch `1`, `2`, `3`) | `2. Mannschaft` |
| Datum | ja | `TT.MM.JJJJ` (auch `JJJJ-MM-TT`) | `16.01.2027` |
| Uhrzeit | nein | `HH:MM` | `18:30` |
| Heim/Auswärts | ja | `H` oder `A` (auch `Heim`/`Auswärts`) | `H` |
| Gegner | ja | 2–80 Zeichen, wie im Spielplan | |
| Ort | nein | bis 120 Zeichen | |
| Spieltag | nein | 1–40 | `12` |

Eine Zeile pro Begegnung und Mannschaft. Die Daten kommen ausschließlich aus dem
offiziellen Spielplan; die App erfindet nichts und ergänzt nichts.

## 2. Prüfen (nichts wird gespeichert)

1. Als Admin anmelden → Umschalter „Rückrunde“ → **„⬆ Termine importieren“**.
2. Datei wählen, Halbrunde „Rückrunde“ lassen → **„Prüfen & Vorschau“**.
3. Die Vorschau zeigt je Zeile ✓, eine Warnung oder einen Fehler. Geprüft wird:
   * unbekannte Mannschaft, ungültiges Datum, ungültige Uhrzeit, ungültiges H/A, fehlender Gegner
   * doppelte Zeilen in der Datei
   * **Dubletten gegen bereits vorhandene Termine**, datenbankweit und
     serverseitig: gleiche Mannschaft, gleiches Datum, gleicher Gegner
   * Warnung „Mannschaft hat an diesem Tag bereits einen anderen Termin“
   * Warnung „Datum liegt in der Vergangenheit“
4. Solange auch nur ein Fehler vorhanden ist, gibt es keinen Speichern-Knopf.
   Dann die Datei korrigieren und erneut prüfen.

## 3. Speichern

**„N Termine jetzt importieren“** → bestätigen.

* Es wird alles oder nichts gespeichert, in einer Transaktion.
* Jeder neue Termin bekommt serverseitig sofort einen eigenen Abfragelink.
* Der Status ist „Geplant“, die Saison wird aus dem Datum abgeleitet (2026/27).
* Vorrundentermine, Antworten, Aufstellungen und bestehende Links bleiben unverändert.

## 4. Danach wie gewohnt

Die Mannschaftsführer wählen „Rückrunde“ und verschicken je Termin den
WhatsApp-Link (grüner Knopf). Erinnerungen, Alternativtermine, Aufstellung und
Exporte funktionieren wie in der Vorrunde.

**Falsch importiert?** Ein Löschen von Spielterminen gibt es in der App nicht,
weder in der Vorrunde noch jetzt. Termine mit falschem Datum lassen sich über
„Verschiebung bestätigen“ korrigieren. Falsche Zeilen löscht Gibbs nach Freigabe
gezielt per SQL; neu importierte Termine haben noch keine Antworten. Empfehlung:
Gibbs vor dem ersten Import ein Backup ziehen lassen.

Getestet: Staging-Abnahme `Rückrunde: CSV-Import …` (Vorschau, Speichern,
erneuter Import wird als Dublette abgewiesen, neuer Termin hat Link und nimmt
Antworten an), dazu pgTAP `60_terminimport`.
