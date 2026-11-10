# Produktive Umsetzung Migration 01 · 10.11.2026

**Ergebnis: angewendet und nachgeprüft, bestanden.** Rückfall R01 ist bereit und wurde nicht angewendet.

| | |
|---|---|
| Freigabe | Christian, 10.11.2026, ausschließlich Migration 01 nach `FREIGABE_MIGRATION01_2026-11-10.md` §6 |
| Ausführung | Gibbs (Hermes-Kanban `t_f8c1cde9`), 06:52–07:02 |
| Angewendet | 07:00:19–07:00:20, `20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql`, SHA-256 `e0b8f017…1d3d`, Exit 0, COMMIT |
| Protokoll und Rohdaten | `~/backups/spielplan-app/migration01_2026-11-10_065854/` (Modus 700/600) |
| Weitere Migrationen, Frontend, GitHub `main` | **keine** |

## Backup unmittelbar vorher

* **Backup-ID `2026-11-10_065854`.** Archiv erstellt 06:58:54. Es ist ein echter
  Neulauf: Prüfsumme und TOC-Zeitstempel unterscheiden sich vom Backup des Vortags
  (geprüft von Claude).
* Vollständiger Custom-Dump (age-verschlüsselt) und Rollenexport ohne Passwörter.
* Verifiziert:
  * SHA256SUMS OK
  * TOC lesbar (800 Einträge)
  * Zählabgleich Archiv gegen Quelle: **19/19 ohne Abweichung**, nämlich 10 Spielplan-Tabellen (302 Zeilen),
    8 SR-Tabellen (2.657 Zeilen) und `auth.users` (5)
* Klartext nur flüchtig in tmpfs, danach entfernt.

## Vorabprüfung (lesend)

Gegenüber dem Referenzlauf von 06:15 gab es keine Abweichung. Neu ist nur Abschnitt 8.
Alle Pflichtwerte sind bestanden: Policies wie im Audit, Owner/BYPASSRLS, kein Schema
`private`, 2 Admin- und 3 MF-Konten, keine neuen Rollen.

Nebenbefund: Die Mindeststärken stehen produktiv **bereits auf 6/6/4**. Migration 05
würde nichts ändern und kann entfallen oder bleibt als Absicherung.

## Nachprüfung (lesend, Rechte-Check je Konto, pseudonymisiert)

| Prüfung | vorher | nachher | Soll |
|---|---|---|---|
| Admin-Konten `1f0efc`, `45086f`: sichtbare Rollen / davon Admin | 3 / 3 | 9 / 6 | 9 / 6 ✓ |
| MF-Konten `8e934a`, `809c0a`, `71ddd5`: sichtbare Rollen | 1 | 1 | 1 ✓ |
| Je Konto: Termine / Aufstellungen / Verfügbarkeiten | 23 / 48·18·30·0 / 180 | identisch | identisch ✓ |
| anon: Termine / Verfügbarkeiten (Spielerlinks) | 23 / 180 | 23 / 180 | unverändert ✓ |
| anon liest `nutzer_rollen` | ja | **nein** | nein ✓ |
| TRUNCATE anon / authenticated | ja / ja | **nein / nein** | nein ✓ |
| authenticated INSERT `nutzer_rollen` (RLS: nur Admin); anon INSERT Verfügbarkeiten | ja; ja | ja; ja | ja; ja ✓ |
| Policies `nutzer_rollen` | 2 alte | `nutzer_rollen_delete/insert/select/update` | ✓ |
| Policies `public` gesamt / davon SR | 44 / 19 | 46 / 19 | +2 / unverändert ✓ |
| Trigger `nutzer_rollen_letzter_admin`, Schema `private` (7 Funktionen) | – | vorhanden | ✓ |

Damit gilt:
* Die Mannschaftsführer sehen dieselben Daten wie in der Vorrunde, auch ihre Aufstellungen.
* Die Admins sehen zusätzlich alle Rollen, wie vorgesehen.
* Spielerlinks und die SR-Anwendung sind unberührt.

Dass Selbstvergabe und Hochstufung tatsächlich abgelehnt werden, wurde nicht
produktiv geprüft. Das wäre ein Schreibversuch. Nachgewiesen ist es in pgTAP und im
Staging gegen den echten Stack (HTTP 403).

## Rückfallbereitschaft

* `supabase/rollback/R01_rollen_policies_wiederherstellen.sql` (SHA-256 `3410e713…33ac`)
  stellt den Zustand vor 01 exakt wieder her (lokal und im Staging nachgewiesen).
* Ausführung als `postgres` in einer Transaktion, danach Rechte-Check gegen `rechte_vorher.txt`.
* R01 bleibt nur gültig, solange Migration 02 nicht angewendet ist. Danach verweigert es sich.
* R01 öffnet die Lücke wieder. Es ist nur für den Fall gedacht, dass Anmeldung oder
  Leitstand gestört sind.
* Ein Daten-Restore ist nicht nötig. Für den Notfall liegt Backup `2026-11-10_065854` vor.

## Offen

* **Funktionsprobe durch Christian**: echter Login als MF und als Admin, eine Testantwort
  über einen bestehenden Spielerlink, SR-App aufrufen. Die Datenbankseite ist geprüft,
  der Browser-Login gegen Produktion nicht.
