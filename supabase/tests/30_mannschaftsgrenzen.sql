-- Mannschaftsführer sind serverseitig auf die eigene Mannschaft begrenzt
begin;
select plan(24);

:als_mf1
select is((select count(*)::int from public.mannschaften), 1, 'MF1 sieht nur eigene Mannschaft');
select is((select count(*)::int from public.spieler where mannschaft_id <> '00000000-0000-4000-c000-000000000001'), 0,
  'MF1 sieht keine fremden Spieler');
select is((select count(*)::int from public.spieltermine where mannschaft_id <> '00000000-0000-4000-c000-000000000001'), 0,
  'MF1 sieht keine fremden Termine');
select is((select count(*)::int from public.verfuegbarkeiten where spieltermin_id = '00000000-0000-4000-e000-000000000002'), 0,
  'MF1 sieht keine fremden Verfügbarkeiten');
select is((select count(*)::int from public.turnier_helfer), 0, 'MF sieht Helferliste nicht');

-- Schreibversuche auf fremde Mannschaft: RLS filtert (0 Zeilen) bzw. verweigert
update public.spieltermine set status = 'Verschiebung nötig' where id = '00000000-0000-4000-e000-000000000002';
delete from public.verfuegbarkeiten where spieltermin_id = '00000000-0000-4000-e000-000000000002';
update public.spieler set name = 'manipuliert' where id = '00000000-0000-4000-d000-000000000021';
select throws_ok(
  $$insert into public.alternativtermine (spieltermin_id, datum) values ('00000000-0000-4000-e000-000000000002', current_date + 20)$$,
  '42501', null, 'MF1 kann keinen Alternativtermin für fremde Mannschaft anlegen');
select throws_ok(
  $$insert into public.aufstellungen (spieltermin_id, spieler_id) values ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000021')$$,
  '42501', null, 'MF1 kann keine Aufstellung für fremde Mannschaft anlegen');
select throws_ok(
  $$insert into public.verfuegbarkeiten (spieltermin_id, spieler_id, antwort) values ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000021', 'Nein')$$,
  '42501', null, 'MF1 kann keine Antwort für fremde Mannschaft eintragen');
select throws_ok(
  $$select public.aufstellung_speichern('00000000-0000-4000-e000-000000000002', array['00000000-0000-4000-d000-000000000021']::uuid[])$$,
  'P0001', 'Keine Berechtigung für diesen Spieltermin.', 'MF1 kann fremde Aufstellung nicht per RPC speichern');
select throws_ok(
  $$select public.abfrage_link_erzeugen('00000000-0000-4000-e000-000000000002')$$,
  'P0001', 'Keine Berechtigung für diesen Spieltermin.', 'MF1 kann keinen Link für fremden Termin erzeugen');
select throws_ok(
  $$insert into public.spieltermine (mannschaft_id, datum, gegner) values ('00000000-0000-4000-c000-000000000001', current_date + 40, 'X')$$,
  '42501', null, 'MF kann keine Spieltermine anlegen (nur Admin)');
select throws_ok(
  $$update public.spieltermine set datum = datum + 1 where id = '00000000-0000-4000-e000-000000000001'$$,
  'P0001', 'Mannschaftsführer dürfen nur den Verschiebungsstatus ändern.', 'MF kann Datum des eigenen Termins nicht ändern');
select throws_ok(
  $$update public.spieltermine set status = 'Gespielt' where id = '00000000-0000-4000-e000-000000000001'$$,
  'P0001', 'Diese Statusänderung ist nur für Administratoren erlaubt.', 'MF kann nur Verschiebungsstatus setzen');
select lives_ok(
  $$update public.spieltermine set status = 'Verschiebung nötig' where id = '00000000-0000-4000-e000-000000000001'$$,
  'MF kann Verschiebungsbedarf für eigenen Termin melden');
select lives_ok(
  $$insert into public.alternativtermine (spieltermin_id, datum, uhrzeit) values ('00000000-0000-4000-e000-000000000001', current_date + 24, '18:00')$$,
  'MF kann Alternativtermin für eigene Mannschaft anlegen');
select throws_ok(
  $$insert into public.alternativtermine (spieltermin_id, datum, uhrzeit) values ('00000000-0000-4000-e000-000000000001', current_date + 24, '18:00')$$,
  '23505', null, 'Doppelter Alternativtermin wird abgelehnt');
select isnt((select abfrage_token from public.alternativtermine where datum = current_date + 24), null,
  'Token für Alternativtermin wird serverseitig erzeugt');
select throws_ok(
  $$insert into public.verfuegbarkeiten (spieltermin_id, spieler_id, antwort) values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000021', 'Ja')$$,
  'P0001', 'Spieler gehört nicht zur Mannschaft dieses Spieltags.', 'Fremder Spieler kann nicht in eigenen Termin eingetragen werden');

:als_postgres
select is((select status from public.spieltermine where id = '00000000-0000-4000-e000-000000000002'), 'Geplant',
  'Fremder Termin unverändert');
select is((select count(*)::int from public.verfuegbarkeiten where spieltermin_id = '00000000-0000-4000-e000-000000000002'), 1,
  'Fremde Verfügbarkeiten nicht gelöscht');
select is((select name from public.spieler where id = '00000000-0000-4000-d000-000000000021'), 'Omega, Olaf',
  'Fremder Spieler unverändert');

-- Token-Manipulation durch MF wird serverseitig neutralisiert
:als_mf1
update public.spieltermine set abfrage_token = 'selbstgewaehlt-0000000000000000' where id = '00000000-0000-4000-e000-000000000001';
:als_postgres
select isnt((select abfrage_token from public.spieltermine where id = '00000000-0000-4000-e000-000000000001'),
  'selbstgewaehlt-0000000000000000', 'Selbstgewählte Tokens werden durch Zufallstoken ersetzt');

:als_admin
select is((select count(*)::int from public.mannschaften), 3, 'Admin sieht alle Mannschaften');
select lives_ok(
  $$update public.spieltermine set gegner = 'TSV Testhausen II' where id = '00000000-0000-4000-e000-000000000002'$$,
  'Admin kann jeden Termin bearbeiten');

:als_postgres
select * from finish();
rollback;
