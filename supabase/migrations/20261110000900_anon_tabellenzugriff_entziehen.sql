-- ============================================================================
-- Migration 09 · Anonymen Direktzugriff auf Tabellen vollständig entziehen
-- Status: VORBEREITET, NICHT ANGEWENDET
-- ============================================================================
-- ERST ANWENDEN, WENN:
--   1. Migrationen 01–04 produktiv angewendet und geprüft sind,
--   2. das neue Frontend (spieler.html/helfer.html über RPC) über GitHub Pages
--      ausgeliefert ist und ein Pilot-Link erfolgreich beantwortet wurde,
--   3. ein aktuelles, verifiziertes Backup vorliegt.
--
-- Danach erreicht anon nur noch die RPCs abfrage_laden, abfrage_antworten,
-- abfrage_nachmelden, helfer_eintragen und oeffentlicher_spielplan.
-- Bestehende Links funktionieren weiter (über die RPCs, Altpfad-Einstellung).
--
-- Ausnahme vereinsbefragung: anonymer INSERT bleibt bestehen, weil die nutzende
-- Seite nicht in diesem Repository liegt (Entscheidung offen, siehe Übergabe).
-- Rückfall: supabase/rollback/R09_anon_altpfad_wiederherstellen.sql
-- ============================================================================

begin;

drop policy if exists mannschaften_anon_alt_select      on public.mannschaften;
drop policy if exists spieler_anon_alt_select           on public.spieler;
drop policy if exists spieler_anon_alt_insert           on public.spieler;
drop policy if exists spieltermine_anon_alt_select      on public.spieltermine;
drop policy if exists alternativtermine_anon_alt_select on public.alternativtermine;
drop policy if exists verfuegbarkeiten_anon_alt_select  on public.verfuegbarkeiten;
drop policy if exists verfuegbarkeiten_anon_alt_insert  on public.verfuegbarkeiten;
drop policy if exists verfuegbarkeiten_anon_alt_update  on public.verfuegbarkeiten;
drop policy if exists turnier_helfer_anon_alt_insert    on public.turnier_helfer;

revoke all on public.vereine, public.mannschaften, public.spieler, public.spieltermine,
              public.alternativtermine, public.verfuegbarkeiten, public.nutzer_rollen,
              public.aufstellungen, public.turnier_helfer
  from anon;

-- vereinsbefragung: nur INSERT (siehe Kopfkommentar)
revoke all on public.vereinsbefragung from anon;
grant insert on public.vereinsbefragung to anon;

commit;
