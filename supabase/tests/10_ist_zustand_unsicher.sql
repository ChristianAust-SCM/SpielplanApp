-- ============================================================================
-- Nachweis des unsicheren IST-Zustands (Baseline, vor den Migrationen).
-- Diese Tests BESTÄTIGEN die Audit-Befunde; sie müssen nach den Migrationen
-- nicht mehr gelten (Gegenproben in 20_* bis 80_*).
-- ============================================================================
begin;
select plan(6);

:als_anon
select ok((select count(*) from public.verfuegbarkeiten where anmerkung is not null) > 0,
  'IST: anon liest fremde Anmerkungen');
select ok((select count(*) from public.spieltermine where abfrage_token is not null) >= 3,
  'IST: anon liest alle Abfrage-Tokens');
select lives_ok(
  $$update public.verfuegbarkeiten set antwort = 'Nein'
     where spieler_id = '00000000-0000-4000-d000-000000000021'$$,
  'IST: anon ändert fremde Spielerantwort');
select ok((select count(*) from public.spieler where ttr is not null) > 0,
  'IST: anon liest TTR-Werte');

:als_ohne
select lives_ok(
  $$insert into public.nutzer_rollen (user_id, mannschaft_id, rolle)
    values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-c000-000000000002', 'admin')$$,
  'IST: Nutzer ohne Rolle vergibt sich selbst Adminrechte');

:als_mf2
select lives_ok(
  $$update public.spieltermine set gegner = 'manipuliert' where id = '00000000-0000-4000-e000-000000000001'$$,
  'IST: MF der 2. Mannschaft ändert Termin der 1. Mannschaft');

:als_postgres
select * from finish();
rollback;
