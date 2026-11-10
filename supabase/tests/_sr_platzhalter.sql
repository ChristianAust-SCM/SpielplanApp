-- NUR TESTUMGEBUNG: synthetische Platzhalter für die SR-Anwendung.
-- Produktiv liegen sr_*-Tabellen in derselben Datenbank. Diese Platzhalter
-- bilden deren Rechte-Muster nach (Vollrechte, offene Policies, eine
-- öffentliche Funktion), damit ein Katalogvergleich vor/nach einer Migration
-- nachweisen kann, dass nichts außerhalb der Spielplan-Tabellen verändert wird.
create table if not exists public.sr_platzhalter (
  id uuid primary key default gen_random_uuid(),
  wert text
);
alter table public.sr_platzhalter enable row level security;
drop policy if exists sr_platzhalter_lesen on public.sr_platzhalter;
create policy sr_platzhalter_lesen on public.sr_platzhalter for select using (true);
drop policy if exists sr_platzhalter_schreiben on public.sr_platzhalter;
create policy sr_platzhalter_schreiben on public.sr_platzhalter for insert to anon with check (true);
grant all on public.sr_platzhalter to anon, authenticated;

create or replace function public.sr_platzhalter_funktion(p uuid)
returns void language sql security definer set search_path = '' as $$ select $$;
grant execute on function public.sr_platzhalter_funktion(uuid) to anon, authenticated;
