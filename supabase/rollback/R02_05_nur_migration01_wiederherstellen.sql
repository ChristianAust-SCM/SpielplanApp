-- ============================================================================
-- Rückfall R02–05 · Zustand „nur Migration 01“ wiederherstellen
-- Status: VORBEREITET, NICHT ANGEWENDET (nur im Notfall, eigene Freigabe)
-- ============================================================================
-- Wofür: Falls nach Migration 02–05 das bisherige Frontend oder der Leitstand
-- gestört ist. Danach gilt wieder exakt der Rechtezustand nach Migration 01
-- (im Test per Katalogvergleich nachgewiesen): Rollenschutz aus 01 bleibt,
-- Mannschaftsgrenzen (03) und Serverfunktionen (02/04) werden entfernt.
--
-- Bleibt bewusst erhalten (additiv, harmlos, enthält ggf. Daten):
--   Spalten saison/nachgemeldet_am/min_spieler, Indizes, Tabellen
--   private.einstellungen und private.abfrage_links (persönliche Links).
-- Daten in den Spielplan-Tabellen werden nicht verändert.
--
-- Voraussetzung: Migration 09 ist NICHT angewendet (sonst zuerst R09).
-- Betrifft keine sr_*-Tabellen und keine nutzer_rollen-Regeln.
-- ============================================================================

begin;

do $$
begin
  if not has_table_privilege('anon', 'public.spieltermine', 'SELECT') then
    raise exception 'R02–05 abgebrochen: Migration 09 ist angewendet – zuerst R09.';
  end if;
end $$;

-- 1. Policies der 9 Tabellen auf den Stand vor 03 (= Stand nach 01)
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('vereine', 'mannschaften', 'spieler', 'spieltermine', 'alternativtermine',
                         'verfuegbarkeiten', 'aufstellungen', 'turnier_helfer', 'vereinsbefragung')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "Löschen erlaubt"       on public.alternativtermine for delete using (auth.uid() is not null);
create policy "Eintragen erlaubt"     on public.alternativtermine for insert with check (auth.uid() is not null);
create policy "Lesen erlaubt"         on public.alternativtermine for select using (true);
create policy "Aktualisieren erlaubt" on public.alternativtermine for update using (auth.uid() is not null);
create policy aufstellung_delete on public.aufstellungen for delete to authenticated using (
  exists (select 1 from public.spieltermine st join public.nutzer_rollen nr on nr.mannschaft_id = st.mannschaft_id
          where st.id = aufstellungen.spieltermin_id and nr.user_id = auth.uid())
  or exists (select 1 from public.nutzer_rollen nr where nr.user_id = auth.uid() and nr.rolle = 'admin'));
create policy aufstellung_insert on public.aufstellungen for insert to authenticated with check (
  exists (select 1 from public.spieltermine st join public.nutzer_rollen nr on nr.mannschaft_id = st.mannschaft_id
          where st.id = aufstellungen.spieltermin_id and nr.user_id = auth.uid())
  or exists (select 1 from public.nutzer_rollen nr where nr.user_id = auth.uid() and nr.rolle = 'admin'));
create policy aufstellung_select on public.aufstellungen for select to authenticated using (
  exists (select 1 from public.spieltermine st join public.nutzer_rollen nr on nr.mannschaft_id = st.mannschaft_id
          where st.id = aufstellungen.spieltermin_id and nr.user_id = auth.uid())
  or exists (select 1 from public.nutzer_rollen nr where nr.user_id = auth.uid() and nr.rolle = 'admin'));
create policy "Lesen erlaubt" on public.mannschaften for select using (true);
create policy "Spieler eintragen" on public.spieler for insert with check (true);
create policy "Lesen erlaubt"     on public.spieler for select using (true);
create policy "Admin verwaltet Termine" on public.spieltermine for insert with check (auth.uid() is not null);
create policy "Lesen erlaubt"           on public.spieltermine for select using (true);
create policy "Status aktualisieren"    on public.spieltermine for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Helfer eintragen" on public.turnier_helfer for insert with check (true);
create policy "Nur Auth lesen"   on public.turnier_helfer for select to authenticated using (true);
create policy "Lesen erlaubt" on public.vereine for select using (true);
create policy "Befragung eintragen" on public.vereinsbefragung for insert with check (true);
create policy "Admins lesen"        on public.vereinsbefragung for select using (auth.uid() is not null);
create policy "Nur Auth lesen"      on public.vereinsbefragung for select to authenticated using (true);
create policy "Verfügbarkeiten löschen"     on public.verfuegbarkeiten for delete using (auth.uid() is not null);
create policy "Verfügbarkeit eintragen"     on public.verfuegbarkeiten for insert with check (true);
create policy "Lesen erlaubt"               on public.verfuegbarkeiten for select using (true);
create policy "Verfügbarkeit aktualisieren" on public.verfuegbarkeiten for update using (true);

-- 2. Tabellenrechte wie nach 01 (Vollrechte ohne TRUNCATE/TRIGGER/REFERENCES)
revoke all on public.vereine, public.mannschaften, public.spieler, public.spieltermine,
  public.alternativtermine, public.verfuegbarkeiten, public.aufstellungen,
  public.turnier_helfer, public.vereinsbefragung
  from anon, authenticated;
grant all on public.vereine, public.mannschaften, public.spieler, public.spieltermine,
  public.alternativtermine, public.verfuegbarkeiten, public.aufstellungen,
  public.turnier_helfer, public.vereinsbefragung
  to anon, authenticated;
revoke truncate, trigger, references on public.vereine, public.mannschaften, public.spieler, public.spieltermine,
  public.alternativtermine, public.verfuegbarkeiten, public.aufstellungen,
  public.turnier_helfer, public.vereinsbefragung
  from anon, authenticated;

-- 3. Trigger aus 02 entfernen
drop trigger if exists spieltermine_token_serverseitig     on public.spieltermine;
drop trigger if exists alternativtermine_token_serverseitig on public.alternativtermine;
drop trigger if exists spieltermine_aenderung_pruefen      on public.spieltermine;
drop trigger if exists verfuegbarkeiten_pruefen            on public.verfuegbarkeiten;

-- 4. Serverfunktionen aus 02/04 entfernen (Signaturen unabhängig)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'public' and p.proname in ('abfrage_laden','abfrage_antworten','abfrage_nachmelden',
              'helfer_eintragen','oeffentlicher_spielplan','abfrage_link_erzeugen','abfrage_link_widerrufen',
              'abfrage_links_liste','abfrage_token_erneuern','verschiebung_abschliessen',
              'aufstellung_speichern','termine_importieren'))
        or (n.nspname = 'private' and p.proname in ('einstellung','neues_token','token_hash','link_aufloesen',
              'fehler','anmerkung_bereinigen','antwort_speichern','tg_token_serverseitig',
              'tg_spieltermin_aenderung_pruefen','tg_verfuegbarkeit_pruefen'))
  loop
    execute format('drop function %s', f.sig);
  end loop;
end $$;

commit;
