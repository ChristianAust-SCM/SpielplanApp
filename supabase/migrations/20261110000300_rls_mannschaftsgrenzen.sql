-- ============================================================================
-- Migration 03 · RLS neu: Mannschaftsführer auf eigene Mannschaft begrenzt,
--                anonymer Altpfad auf das Nötigste reduziert
-- Status: VORBEREITET, NICHT ANGEWENDET (Freigabe durch Christian erforderlich)
-- Voraussetzung: Migrationen 01 und 02
-- ============================================================================
-- authenticated (MF/Admin):
--   * MF sehen und ändern nur Daten der Mannschaften aus nutzer_rollen
--   * Admins (rolle = 'admin') verwalten alles
-- anon (ÜBERGANGSPHASE – wird mit Migration 09 vollständig entzogen):
--   * nur noch die Spalten/Operationen, die das bisherige spieler.html und
--     helfer.html benötigen; kein Zugriff mehr auf TTR, Spielertokens,
--     MF-E-Mails, Aufstellungen, Rollen, Vereine, Helferliste.
--     Restlücke bis Migration 09: Antworten/Anmerkungen (für Upsert nötig).
--
-- Kompatibilität: bisheriges Frontend funktioniert weiter (Tests in
-- supabase/tests/20_altpfad_kompatibel.sql). Keine sr_*-Tabellen betroffen.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Alle bisherigen Policies der Spielplan-Tabellen entfernen (Namen produktiv
-- teils mit Umlauten/Leerzeichen – daher dynamisch, streng auf die Liste begrenzt)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Grants neu setzen
-- ---------------------------------------------------------------------------
revoke all on public.vereine, public.mannschaften, public.spieler, public.spieltermine,
              public.alternativtermine, public.verfuegbarkeiten, public.aufstellungen,
              public.turnier_helfer, public.vereinsbefragung
  from anon, authenticated;

grant select, insert, update, delete on public.vereine, public.mannschaften, public.spieler,
  public.spieltermine, public.alternativtermine, public.verfuegbarkeiten, public.aufstellungen,
  public.turnier_helfer, public.vereinsbefragung
  to authenticated;

-- Übergang: anon nur, was das bisherige spieler.html/helfer.html braucht
grant select on public.spieltermine, public.alternativtermine to anon;            -- Altseite liest select('*')
grant select (id, name, liga) on public.mannschaften to anon;
grant select (id, name, mannschaft_id, aktiv) on public.spieler to anon;
grant insert (mannschaft_id, name, aktiv) on public.spieler to anon;
-- Upsert (ON CONFLICT DO UPDATE ... = EXCLUDED.x) verlangt SELECT auf alle gesetzten Spalten.
-- Deshalb bleiben Antworten/Anmerkungen für anon bis Migration 09 lesbar (bekannte Restlücke).
grant select (id, spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung) on public.verfuegbarkeiten to anon;
grant insert (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung),
      update (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung)
  on public.verfuegbarkeiten to anon;
grant insert (name, einsatz, anmerkung) on public.turnier_helfer to anon;
grant insert on public.vereinsbefragung to anon;

-- ---------------------------------------------------------------------------
-- vereine
-- ---------------------------------------------------------------------------
create policy vereine_select on public.vereine for select to authenticated using (true);
create policy vereine_admin_insert on public.vereine for insert to authenticated with check (private.ist_admin());
create policy vereine_admin_update on public.vereine for update to authenticated using (private.ist_admin()) with check (private.ist_admin());
create policy vereine_admin_delete on public.vereine for delete to authenticated using (private.ist_admin());

-- ---------------------------------------------------------------------------
-- mannschaften
-- ---------------------------------------------------------------------------
create policy mannschaften_select on public.mannschaften for select to authenticated
  using (private.darf_mannschaft(id));
create policy mannschaften_admin_insert on public.mannschaften for insert to authenticated with check (private.ist_admin());
create policy mannschaften_admin_update on public.mannschaften for update to authenticated using (private.ist_admin()) with check (private.ist_admin());
create policy mannschaften_admin_delete on public.mannschaften for delete to authenticated using (private.ist_admin());
create policy mannschaften_anon_alt_select on public.mannschaften for select to anon using (true);

-- ---------------------------------------------------------------------------
-- spieler
-- ---------------------------------------------------------------------------
create policy spieler_select on public.spieler for select to authenticated
  using (private.darf_mannschaft(mannschaft_id));
create policy spieler_insert on public.spieler for insert to authenticated
  with check (private.darf_mannschaft(mannschaft_id));
create policy spieler_update on public.spieler for update to authenticated
  using (private.darf_mannschaft(mannschaft_id)) with check (private.darf_mannschaft(mannschaft_id));
create policy spieler_admin_delete on public.spieler for delete to authenticated using (private.ist_admin());

create policy spieler_anon_alt_select on public.spieler for select to anon using (aktiv);
create policy spieler_anon_alt_insert on public.spieler for insert to anon
  with check (aktiv and mannschaft_id is not null and char_length(btrim(name)) between 3 and 60);

-- ---------------------------------------------------------------------------
-- spieltermine (Spaltenbegrenzung für MF zusätzlich per Trigger aus Migration 02)
-- ---------------------------------------------------------------------------
create policy spieltermine_select on public.spieltermine for select to authenticated
  using (private.darf_mannschaft(mannschaft_id));
create policy spieltermine_admin_insert on public.spieltermine for insert to authenticated with check (private.ist_admin());
create policy spieltermine_update on public.spieltermine for update to authenticated
  using (private.darf_mannschaft(mannschaft_id)) with check (private.darf_mannschaft(mannschaft_id));
create policy spieltermine_admin_delete on public.spieltermine for delete to authenticated using (private.ist_admin());

create policy spieltermine_anon_alt_select on public.spieltermine for select to anon using (true);

-- ---------------------------------------------------------------------------
-- alternativtermine
-- ---------------------------------------------------------------------------
create policy alternativtermine_select on public.alternativtermine for select to authenticated
  using (private.darf_termin(spieltermin_id));
create policy alternativtermine_insert on public.alternativtermine for insert to authenticated
  with check (private.darf_termin(spieltermin_id));
create policy alternativtermine_admin_update on public.alternativtermine for update to authenticated
  using (private.ist_admin()) with check (private.ist_admin());
create policy alternativtermine_delete on public.alternativtermine for delete to authenticated
  using (private.darf_termin(spieltermin_id));

create policy alternativtermine_anon_alt_select on public.alternativtermine for select to anon using (true);

-- ---------------------------------------------------------------------------
-- verfuegbarkeiten
-- ---------------------------------------------------------------------------
create policy verfuegbarkeiten_select on public.verfuegbarkeiten for select to authenticated
  using (private.darf_termin(spieltermin_id));
create policy verfuegbarkeiten_insert on public.verfuegbarkeiten for insert to authenticated
  with check (private.darf_termin(spieltermin_id));
create policy verfuegbarkeiten_update on public.verfuegbarkeiten for update to authenticated
  using (private.darf_termin(spieltermin_id)) with check (private.darf_termin(spieltermin_id));
create policy verfuegbarkeiten_delete on public.verfuegbarkeiten for delete to authenticated
  using (private.darf_termin(spieltermin_id));

create policy verfuegbarkeiten_anon_alt_select on public.verfuegbarkeiten for select to anon using (true);
create policy verfuegbarkeiten_anon_alt_insert on public.verfuegbarkeiten for insert to anon
  with check (char_length(coalesce(anmerkung, '')) <= 500);
create policy verfuegbarkeiten_anon_alt_update on public.verfuegbarkeiten for update to anon
  using (true) with check (char_length(coalesce(anmerkung, '')) <= 500);

-- ---------------------------------------------------------------------------
-- aufstellungen
-- ---------------------------------------------------------------------------
create policy aufstellungen_select on public.aufstellungen for select to authenticated using (private.darf_termin(spieltermin_id));
create policy aufstellungen_insert on public.aufstellungen for insert to authenticated with check (private.darf_termin(spieltermin_id));
create policy aufstellungen_update on public.aufstellungen for update to authenticated
  using (private.darf_termin(spieltermin_id)) with check (private.darf_termin(spieltermin_id));
create policy aufstellungen_delete on public.aufstellungen for delete to authenticated using (private.darf_termin(spieltermin_id));

-- ---------------------------------------------------------------------------
-- turnier_helfer
-- ---------------------------------------------------------------------------
create policy turnier_helfer_admin_select on public.turnier_helfer for select to authenticated using (private.ist_admin());
create policy turnier_helfer_admin_delete on public.turnier_helfer for delete to authenticated using (private.ist_admin());
create policy turnier_helfer_anon_alt_insert on public.turnier_helfer for insert to anon
  with check (char_length(btrim(name)) between 2 and 80 and char_length(coalesce(anmerkung, '')) <= 500);

-- ---------------------------------------------------------------------------
-- vereinsbefragung (Spalten produktiv nicht im Repository dokumentiert)
-- ---------------------------------------------------------------------------
create policy vereinsbefragung_insert on public.vereinsbefragung for insert to anon, authenticated with check (true);
create policy vereinsbefragung_admin_select on public.vereinsbefragung for select to authenticated using (private.ist_admin());

commit;
