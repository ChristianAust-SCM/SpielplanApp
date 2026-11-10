-- ============================================================================
-- Rückfall zu Migration 09 · NUR IM NOTFALL, BEFRISTET
-- ============================================================================
-- Stellt den eingeschränkten anonymen Altpfad aus Migration 03 wieder her
-- (NICHT den unsicheren Ursprungszustand). Nur nutzen, wenn das neue
-- spieler.html produktiv nicht funktioniert und auf das alte Frontend
-- zurückgerollt wurde. Verantwortlichen und Ablaufdatum dokumentieren.
-- ============================================================================

begin;

grant select on public.spieltermine, public.alternativtermine to anon;
grant select (id, name, liga) on public.mannschaften to anon;
grant select (id, name, mannschaft_id, aktiv) on public.spieler to anon;
grant insert (mannschaft_id, name, aktiv) on public.spieler to anon;
grant select (id, spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung) on public.verfuegbarkeiten to anon;
grant insert (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung),
      update (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung)
  on public.verfuegbarkeiten to anon;
grant insert (name, einsatz, anmerkung) on public.turnier_helfer to anon;

create policy mannschaften_anon_alt_select on public.mannschaften for select to anon using (true);
create policy spieler_anon_alt_select on public.spieler for select to anon using (aktiv);
create policy spieler_anon_alt_insert on public.spieler for insert to anon
  with check (aktiv and mannschaft_id is not null and char_length(btrim(name)) between 3 and 60);
create policy spieltermine_anon_alt_select on public.spieltermine for select to anon using (true);
create policy alternativtermine_anon_alt_select on public.alternativtermine for select to anon using (true);
create policy verfuegbarkeiten_anon_alt_select on public.verfuegbarkeiten for select to anon using (true);
create policy verfuegbarkeiten_anon_alt_insert on public.verfuegbarkeiten for insert to anon
  with check (char_length(coalesce(anmerkung, '')) <= 500);
create policy verfuegbarkeiten_anon_alt_update on public.verfuegbarkeiten for update to anon
  using (true) with check (char_length(coalesce(anmerkung, '')) <= 500);
create policy turnier_helfer_anon_alt_insert on public.turnier_helfer for insert to anon
  with check (char_length(btrim(name)) between 2 and 80 and char_length(coalesce(anmerkung, '')) <= 500);

commit;
