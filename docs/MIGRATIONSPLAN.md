# Migrationsplan / Runbook (Entwurf, nicht ausgeführt)

**Keiner dieser Schritte wurde produktiv ausgeführt.** Jeder Schritt braucht
eine eigene ausdrückliche Freigabe von Christian.

## 1. Übersicht der Migrationen

| Datei | Inhalt | Kompatibel mit altem Frontend | Rückfall |
|---|---|---|---|
| `20261110000100_sicherheit_rollen_und_hilfsfunktionen.sql` | Selbstvergabe von Adminrechten verhindert, TRUNCATE/TRIGGER/REFERENCES entzogen, Berechtigungsfunktionen, Schutz des letzten Admins | ja | Policies „Admins verwalten Rollen“/„Eigene Rollen lesen“ neu anlegen (nicht empfohlen) |
| `20261110000200_spielerlinks_und_serverfunktionen.sql` | Spalten `min_spieler`, `saison` (generiert), `nachgemeldet_am`; Unique-Index Alternativtermine; `private.einstellungen`, `private.abfrage_links`; RPCs; Integritäts-Trigger | ja | additiv; Funktionen/Trigger droppen |
| `20261110000300_rls_mannschaftsgrenzen.sql` | Policies neu: MF je Mannschaft, Admin global; anon-Altpfad spalten- und zeilenweise begrenzt | ja (getestet in `70_altpfad_kompatibel.sql`) | Gegenmigration mit Baseline-Policies (nur im Notfall) |
| `20261110000400_rueckrunde_terminimport.sql` | `termine_importieren` (Vorschau + transaktionaler Import) | ja | Funktion droppen |
| `20261110000900_anon_tabellenzugriff_entziehen.sql` | anon nur noch RPCs | **nein**, braucht das neue Frontend | `supabase/rollback/R09_anon_altpfad_wiederherstellen.sql` |

## 2. Reihenfolge

1. **Backup**: aktuellen, verifizierten Dump erstellen und isoliert
   wiederherstellen (siehe Sanierungsplan Phase 2).
2. **Vorabprüfung** (nur lesend, mit Freigabe):
   `supabase/pruefung/vorabpruefung_readonly.sql`
   * Spaltenliste mit `supabase/baseline/00_produktion_rekonstruiert.sql`
     vergleichen. Abweichungen zuerst in der Baseline nachziehen und
     `npm run test:db` erneut ausführen.
   * `doppelte_alternativtermine` muss 0 sein, sonst bricht Migration 02 ab.
     Die Bereinigung ist eine eigene Entscheidung.
   * `ungueltige_tokens` muss 0 sein, sonst funktionieren diese Altlinks über
     die RPCs nicht.
3. **Staging/Preview** (empfohlen): Supabase-Branch oder separates Projekt mit
   Schema-Dump ohne Daten, dazu synthetische Daten. Migrationen 01–04
   anwenden, dann neues Frontend lokal oder als Preview gegen Staging testen,
   einschließlich echter PostgREST-Aufrufe (siehe Teststrategie, Lücke T1).
4. **Produktion Migration 01** (sofort sinnvoll, unabhängig vom Frontend).
5. **Produktion Migrationen 02–04**, danach Smoke-Test mit dem alten Frontend:
   bestehender Link, Antwort ändern, MF-Login, Export.
6. **Frontend-Rollout** (Merge `develop/spielplan-app-2.0` → `main` nach
   Review, GitHub Pages). Pilot: ein Testtermin, Antwort über alten Link,
   Alternativtermin, Verschiebung, Aufstellung, Import-Vorschau.
7. **Migration 09** nach erfolgreichem Pilot (Empfehlung: innerhalb weniger Tage).
8. `min_spieler` je Mannschaft durch einen Admin setzen (Tabelle `mannschaften`),
   sobald die Mannschaftsstärken feststehen.
9. Später: Entscheidung persönliche Links, danach ggf.
   `legacy_links_erlaubt = false` (`private.einstellungen`).

Migrationen nur über die Supabase CLI (`supabase db push` gegen den
verknüpften Projektref) oder über `psql` mit `-v ON_ERROR_STOP=1` anwenden.
Nie per Copy & Paste ins Dashboard. Jede Datei läuft in einer eigenen
Transaktion und wird bei einem Fehler vollständig zurückgerollt.

## 3. Prüfung nach jeder Stufe

* `select * from pg_policies where schemaname='public' and tablename in (…)`:
  Es dürfen nur Policies mit den neuen Namen existieren.
* Grants: `information_schema.role_table_grants` für `anon` muss nach 09 leer
  sein (außer `vereinsbefragung` INSERT).
* Funktionen: `has_function_privilege('anon', 'public.abfrage_laden(text)', 'execute')` muss `true` ergeben,
  für `verschiebung_abschliessen` muss es `false` ergeben.

## 4. Rückfall

* Frontend: `git revert` auf den letzten verifizierten Pages-Commit.
* Datenbank nach 09: `R09_…` stellt den eingeschränkten Altpfad wieder her.
  Das ist ausdrücklich **nicht** der unsichere Ursprungszustand. Nur befristet
  einsetzen, mit festgelegtem Verantwortlichen und Ablaufdatum.
* Vor jedem Rückfall: Backup des aktuellen Stands.
