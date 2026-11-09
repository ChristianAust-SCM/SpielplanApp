-- Rollen: keine Selbstvergabe von Adminrechten, nur Admins verwalten Rollen
begin;
select plan(11);

:als_ohne
select throws_ok(
  $$insert into public.nutzer_rollen (user_id, mannschaft_id, rolle)
    values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-c000-000000000002', 'admin')$$,
  '42501', null, 'Nutzer ohne Rolle kann sich nicht selbst zum Admin machen');
select throws_ok(
  $$insert into public.nutzer_rollen (user_id, mannschaft_id, rolle)
    values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-c000-000000000002', 'mf')$$,
  '42501', null, 'Nutzer ohne Rolle kann sich nicht selbst zum MF machen');
select is((select count(*)::int from public.nutzer_rollen), 0, 'Nutzer ohne Rolle sieht keine Rollen');

:als_mf1
select is((select count(*)::int from public.nutzer_rollen), 1, 'MF sieht nur eigene Rolle');
update public.nutzer_rollen set rolle = 'admin' where user_id = '00000000-0000-4000-a000-0000000000b1';
:als_postgres
select is((select rolle from public.nutzer_rollen where user_id = '00000000-0000-4000-a000-0000000000b1'), 'mf',
  'MF kann eigene Rolle nicht auf admin ändern');

:als_mf1
select throws_ok(
  $$insert into public.nutzer_rollen (user_id, mannschaft_id, rolle)
    values ('00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-c000-000000000002', 'mf')$$,
  '42501', null, 'MF kann sich keine weitere Mannschaft zuweisen');
delete from public.nutzer_rollen where user_id = '00000000-0000-4000-a000-0000000000a1';
:als_postgres
select is((select count(*)::int from public.nutzer_rollen where rolle = 'admin'), 1, 'MF kann Admin-Rolle nicht löschen');

:als_anon
select throws_ok($$select * from public.nutzer_rollen$$, '42501', null, 'anon hat keinen Zugriff auf nutzer_rollen');

:als_admin
select lives_ok(
  $$insert into public.nutzer_rollen (user_id, mannschaft_id, rolle)
    values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-c000-000000000003', 'mf')$$,
  'Admin kann Rollen vergeben');
select is((select count(*)::int from public.nutzer_rollen), 4, 'Admin sieht alle Rollen');
select throws_ok(
  $$delete from public.nutzer_rollen where rolle = 'admin'$$,
  'P0001', 'Der letzte Administrator kann nicht entfernt werden.', 'Letzter Admin ist geschützt');

:als_postgres
select * from finish();
rollback;
