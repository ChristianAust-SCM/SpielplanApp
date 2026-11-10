-- ============================================================================
-- Rückfall R01 · Migration 01 vollständig zurücknehmen
-- Status: VORBEREITET, NICHT ANGEWENDET (nur im Notfall, eigene Freigabe)
-- ============================================================================
-- Stellt den Zustand VOR Migration 01 exakt wieder her (Policies, Grants,
-- Schema private). ACHTUNG: Damit ist die Selbstvergabe von Adminrechten
-- wieder möglich. Nur verwenden, wenn Migration 01 Anmeldung oder Leitstand
-- blockiert und der Fehler nicht kurzfristig per Folgemigration behebbar ist.
--
-- Nur gültig, solange Migration 02 ff. NICHT angewendet ist. Das Skript bricht
-- sonst ab (Schema private enthält dann weitere Objekte → drop schema schlägt
-- fehl, Transaktion wird zurückgerollt).
--
-- Betrifft ausschließlich Tabellen der Spielplan-App, keine sr_*-Tabellen.
-- Daten werden nicht verändert.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('private.abfrage_links') is not null
     or to_regclass('private.einstellungen') is not null then
    raise exception 'R01 abgebrochen: Migration 02 ist bereits angewendet.';
  end if;
end $$;

-- Trigger und Funktionen aus Migration 01 entfernen
drop trigger if exists nutzer_rollen_letzter_admin on public.nutzer_rollen;

drop policy if exists nutzer_rollen_select on public.nutzer_rollen;
drop policy if exists nutzer_rollen_insert on public.nutzer_rollen;
drop policy if exists nutzer_rollen_update on public.nutzer_rollen;
drop policy if exists nutzer_rollen_delete on public.nutzer_rollen;

-- Ursprüngliche Policies (Stand Audit 09.11.2026)
drop policy if exists "Admins verwalten Rollen" on public.nutzer_rollen;
drop policy if exists "Eigene Rollen lesen"     on public.nutzer_rollen;
create policy "Admins verwalten Rollen" on public.nutzer_rollen for all using (auth.uid() = user_id);
create policy "Eigene Rollen lesen"     on public.nutzer_rollen for select using (auth.uid() = user_id);

drop function if exists private.tg_letzten_admin_schuetzen();
drop function if exists private.darf_termin(uuid);
drop function if exists private.darf_mannschaft(uuid);
drop function if exists private.hat_mannschaft(uuid);
drop function if exists private.ist_admin();
drop function if exists private.api_rolle();
drop function if exists private.aktueller_nutzer();
drop schema if exists private;   -- RESTRICT: bricht ab, falls weitere Objekte existieren

-- Ursprüngliche Grants (Stand Audit: Vollrechte für anon und authenticated)
grant all on public.nutzer_rollen to anon, authenticated;
grant truncate, trigger, references on
  public.vereine, public.mannschaften, public.spieler, public.spieltermine,
  public.alternativtermine, public.verfuegbarkeiten, public.nutzer_rollen,
  public.aufstellungen, public.turnier_helfer, public.vereinsbefragung
  to anon, authenticated;

commit;
