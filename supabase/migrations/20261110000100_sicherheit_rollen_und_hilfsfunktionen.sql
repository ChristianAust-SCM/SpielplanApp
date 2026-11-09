-- ============================================================================
-- Migration 01 · Sofortmaßnahme Rollen + serverseitige Berechtigungsfunktionen
-- Status: VORBEREITET, NICHT ANGEWENDET (Freigabe durch Christian erforderlich)
-- ============================================================================
-- Behebt:
--   * Selbstvergabe von Adminrechten: Policy "Admins verwalten Rollen" erlaubte
--     jedem angemeldeten Nutzer INSERT/UPDATE eigener Zeilen inkl. rolle='admin'.
--   * TRUNCATE/TRIGGER/REFERENCES für anon/authenticated (TRUNCATE umgeht RLS).
--
-- Kompatibilität: Der bestehende Frontend-Code liest nur eigene Rollen
-- (nutzer_rollen.user_id = auth.uid()) → keine Funktionsänderung.
-- Betrifft ausschließlich Tabellen der Spielplan-App, keine sr_*-Tabellen.
--
-- Portabilität (Titan_Ghost): nur Standard-PostgreSQL. Supabase-spezifisch ist
-- allein auth.uid(); es wird ausschließlich in private.aktueller_nutzer()
-- verwendet und kann dort zentral ersetzt werden.
-- ============================================================================

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Zentrale Identitätsfunktion (einzige Stelle mit auth.uid())
-- ---------------------------------------------------------------------------
create or replace function private.aktueller_nutzer()
returns uuid
language sql stable
set search_path = ''
as $$ select auth.uid() $$;

-- API-Rolle des aktuellen Requests (PostgREST setzt "role" per SET ROLE).
-- Bleibt auch innerhalb von SECURITY-DEFINER-Funktionen erhalten.
create or replace function private.api_rolle()
returns text
language sql stable
set search_path = ''
as $$ select nullif(current_setting('role', true), 'none') $$;

create or replace function private.ist_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nutzer_rollen
    where user_id = private.aktueller_nutzer() and rolle = 'admin');
$$;

-- Hat der Nutzer irgendeine Rolle (mf oder admin) für diese Mannschaft?
create or replace function private.hat_mannschaft(p_mannschaft_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nutzer_rollen
    where user_id = private.aktueller_nutzer() and mannschaft_id = p_mannschaft_id);
$$;

create or replace function private.darf_mannschaft(p_mannschaft_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.ist_admin() or private.hat_mannschaft(p_mannschaft_id) $$;

create or replace function private.darf_termin(p_spieltermin_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select private.darf_mannschaft(st.mannschaft_id)
       from public.spieltermine st where st.id = p_spieltermin_id),
    false);
$$;

revoke all on function private.aktueller_nutzer(), private.api_rolle(), private.ist_admin(),
  private.hat_mannschaft(uuid), private.darf_mannschaft(uuid), private.darf_termin(uuid)
  from public;
grant execute on function private.aktueller_nutzer(), private.api_rolle(), private.ist_admin(),
  private.hat_mannschaft(uuid), private.darf_mannschaft(uuid), private.darf_termin(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- nutzer_rollen: nur Admins verwalten, jeder liest nur eigene Rollen
-- ---------------------------------------------------------------------------
drop policy if exists "Admins verwalten Rollen" on public.nutzer_rollen;
drop policy if exists "Eigene Rollen lesen"     on public.nutzer_rollen;
drop policy if exists nutzer_rollen_select      on public.nutzer_rollen;
drop policy if exists nutzer_rollen_insert      on public.nutzer_rollen;
drop policy if exists nutzer_rollen_update      on public.nutzer_rollen;
drop policy if exists nutzer_rollen_delete      on public.nutzer_rollen;

create policy nutzer_rollen_select on public.nutzer_rollen
  for select to authenticated
  using (user_id = private.aktueller_nutzer() or private.ist_admin());
create policy nutzer_rollen_insert on public.nutzer_rollen
  for insert to authenticated with check (private.ist_admin());
create policy nutzer_rollen_update on public.nutzer_rollen
  for update to authenticated using (private.ist_admin()) with check (private.ist_admin());
create policy nutzer_rollen_delete on public.nutzer_rollen
  for delete to authenticated using (private.ist_admin());

revoke all on public.nutzer_rollen from anon;
revoke all on public.nutzer_rollen from authenticated;
grant select, insert, update, delete on public.nutzer_rollen to authenticated;

-- Schutz vor Aussperren: der letzte Admin kann sich nicht selbst entfernen.
create or replace function private.tg_letzten_admin_schuetzen()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.rolle = 'admin'
     and (tg_op = 'DELETE' or new.rolle is distinct from 'admin' or new.user_id is distinct from old.user_id)
     and not exists (select 1 from public.nutzer_rollen
                     where rolle = 'admin' and id <> old.id) then
    raise exception 'Der letzte Administrator kann nicht entfernt werden.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function private.tg_letzten_admin_schuetzen() from public;

drop trigger if exists nutzer_rollen_letzter_admin on public.nutzer_rollen;
create trigger nutzer_rollen_letzter_admin
  before update or delete on public.nutzer_rollen
  for each row execute function private.tg_letzten_admin_schuetzen();

-- ---------------------------------------------------------------------------
-- Gefährliche Tabellenrechte entziehen (TRUNCATE umgeht RLS)
-- ---------------------------------------------------------------------------
revoke truncate, trigger, references on
  public.vereine, public.mannschaften, public.spieler, public.spieltermine,
  public.alternativtermine, public.verfuegbarkeiten, public.nutzer_rollen,
  public.aufstellungen, public.turnier_helfer, public.vereinsbefragung
  from anon, authenticated;

commit;
