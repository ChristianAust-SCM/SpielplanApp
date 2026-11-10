-- ============================================================================
-- Migration 05 · Mindeststärken je Mannschaft (fachliche Festlegung 10.11.2026)
-- Status: VORBEREITET, NICHT ANGEWENDET (Freigabe durch Christian erforderlich)
-- ============================================================================
-- 1. Mannschaft: 6 · 2. Mannschaft: 6 · 3. Mannschaft: 4
-- Voraussetzung: Migration 02 (Check-Constraint 1–12). Reine Datenänderung an
-- drei Zeilen von public.mannschaften, keine sr_*-Tabellen.
-- Bricht ab (alles oder nichts), wenn nicht genau diese drei Mannschaften
-- gefunden werden. Wiederholbar (setzt immer dieselben Werte).
-- Rückfall: Werte per UPDATE zurücksetzen (vorherige Werte stehen im Backup).
-- ============================================================================
begin;

do $$
declare n int;
begin
  select count(*) into n from public.mannschaften
   where name in ('1. Mannschaft', '2. Mannschaft', '3. Mannschaft');
  if n <> 3 then
    raise exception 'Migration 05 abgebrochen: % statt 3 Mannschaften gefunden', n;
  end if;
end $$;

update public.mannschaften
   set min_spieler = case name when '1. Mannschaft' then 6
                               when '2. Mannschaft' then 6
                               when '3. Mannschaft' then 4 end
 where name in ('1. Mannschaft', '2. Mannschaft', '3. Mannschaft');

commit;
