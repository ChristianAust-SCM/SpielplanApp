-- Zustand NUR mit Migration 01 (02 ff. nicht angewendet), altes Frontend (main):
-- Anmeldung, Leitstand, Aufstellung und Spielerlink funktionieren weiter;
-- Selbstvergabe und TRUNCATE sind gesperrt.
begin;
select plan(19);

select ok(to_regclass('private.abfrage_links') is null, 'Vorbedingung: Migration 02 ist nicht angewendet');

-- Anmeldung (app.js: nutzer_rollen + Embed mannschaften, nur eigene Zeilen)
:als_mf1
select is((select count(*)::int from public.nutzer_rollen nr join public.mannschaften m on m.id = nr.mannschaft_id
            where nr.user_id = :mf1), 1, 'MF-Anmeldung: eigene Rolle samt Mannschaft lesbar');
select is((select rolle from public.nutzer_rollen where user_id = :mf1), 'mf', 'MF-Anmeldung: Rolle mf erkannt');
select is((select count(*)::int from public.nutzer_rollen), 1, 'MF sieht nur die eigene Rolle');
:als_mf2
select is((select count(*)::int from public.nutzer_rollen where user_id = :mf2), 1, 'Zweiter MF: Anmeldung unverändert');
:als_admin
select is((select rolle from public.nutzer_rollen where user_id = :admin), 'admin', 'Admin-Anmeldung: Rolle admin erkannt');
select is((select count(*)::int from public.nutzer_rollen), 3, 'Admin sieht alle Rollen');

-- Leitstand MF: bisherige Rechte bleiben (Status, Aufstellung über bestehende Policies)
:als_mf1
select lives_ok($$update public.spieltermine set status = 'Verschiebung nötig' where id = '00000000-0000-4000-e000-000000000001'$$,
  'MF setzt Terminstatus wie bisher');
select lives_ok($$insert into public.aufstellungen (spieltermin_id, spieler_id)
                  values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000011')$$,
  'MF speichert Aufstellung der eigenen Mannschaft');
select is((select count(*)::int from public.aufstellungen where spieltermin_id = :t1), 1, 'MF liest eigene Aufstellung');
:als_mf2
select throws_ok($$insert into public.aufstellungen (spieltermin_id, spieler_id)
                   values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000012')$$,
  '42501', null, 'MF der 2. Mannschaft: keine Aufstellung für die 1. (wie bisher)');
:als_admin
select lives_ok($$insert into public.aufstellungen (spieltermin_id, spieler_id)
                  values ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000021')$$,
  'Admin speichert Aufstellung jeder Mannschaft');

-- Spielerlink (spieler.html auf main, anon): unverändert
:als_anon
select is((select count(*)::int from public.spieltermine where abfrage_token = :tok_t1), 1, 'anon: Termin per Altlink lesbar');
select lives_ok($$insert into public.verfuegbarkeiten (spieltermin_id, alternativtermin_id, spieler_id, antwort)
                  values ('00000000-0000-4000-e000-000000000001', null, '00000000-0000-4000-d000-000000000013', 'Ja')
                  on conflict on constraint verfuegbarkeiten_unique do update set antwort = excluded.antwort$$,
  'anon: Antwort per Upsert wie bisher');

-- Sicherheitsgewinn
:als_ohne
select throws_ok($$insert into public.nutzer_rollen (user_id, mannschaft_id, rolle)
                   values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-c000-000000000001', 'admin')$$,
  '42501', null, 'Selbstvergabe Admin gesperrt');
:als_mf1
update public.nutzer_rollen set rolle = 'admin', mannschaft_id = :m2 where user_id = :mf1;
:als_postgres
select is((select rolle || '/' || mannschaft_id from public.nutzer_rollen where user_id = :mf1),
  'mf/00000000-0000-4000-c000-000000000001', 'MF kann eigene Rolle/Mannschaft nicht ändern');
:als_anon
select throws_ok($$truncate public.verfuegbarkeiten$$, '42501', null, 'anon: TRUNCATE gesperrt');
:als_mf1
select throws_ok($$truncate public.spieltermine$$, '42501', null, 'authenticated: TRUNCATE gesperrt');
:als_admin
select throws_ok($$delete from public.nutzer_rollen where user_id = '00000000-0000-4000-a000-0000000000a1'$$,
  'P0001', 'Der letzte Administrator kann nicht entfernt werden.', 'Letzter Admin geschützt');

:als_postgres
select * from finish();
rollback;
