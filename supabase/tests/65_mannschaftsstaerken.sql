-- Mindeststärken nach Migration 05 und ihre Wirkung auf die Aufstellung
begin;
select plan(5);

select is((select min_spieler from public.mannschaften where id = :m1), 6, '1. Mannschaft: Mindeststärke 6');
select is((select min_spieler from public.mannschaften where id = :m2), 6, '2. Mannschaft: Mindeststärke 6');
select is((select min_spieler from public.mannschaften where id = :m3), 4, '3. Mannschaft: Mindeststärke 4');
select throws_ok($$update public.mannschaften set min_spieler = 0 where id = '00000000-0000-4000-c000-000000000003'$$,
  '23514', null, 'Mindeststärke außerhalb 1–12 wird abgelehnt');

:als_mf1
select is((select min_spieler from public.mannschaften where id = :m1), 6, 'MF liest die Mindeststärke der eigenen Mannschaft');

:als_postgres
select * from finish();
rollback;
