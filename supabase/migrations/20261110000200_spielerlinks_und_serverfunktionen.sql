-- ============================================================================
-- Migration 02 · Serverseitige Spielerlinks, RPC-Funktionen, Integritätsregeln
-- Status: VORBEREITET, NICHT ANGEWENDET (Freigabe durch Christian erforderlich)
-- Voraussetzung: Migration 01
-- ============================================================================
-- Rein ADDITIV und kompatibel zum bisherigen Frontend:
--   * neue Spalten (min_spieler, saison, nachgemeldet_am) – nur falls fehlend
--   * private Tabellen für Einstellungen und neue Spielerlinks
--   * Token-geprüfte RPCs für spieler.html / helfer.html (ohne Login)
--   * transaktionale RPCs für Verschiebung und Aufstellung
--   * Trigger: Tokens nur serverseitig, MF-Statusänderungen begrenzt,
--     Verfügbarkeiten nur innerhalb der eigenen Mannschaft/des eigenen Termins
--
-- Bestehende Links (spieler.html?token=… / ?alt=…) bleiben gültig, solange die
-- Einstellung legacy_links_erlaubt = true ist (Standard).
-- Rohtokens neuer Links werden nur als SHA-256-Hash gespeichert.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Zusätzliche Spalten (nur wenn produktiv noch nicht vorhanden)
-- ---------------------------------------------------------------------------
alter table public.mannschaften add column if not exists min_spieler integer not null default 6;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mannschaften_min_spieler_check') then
    alter table public.mannschaften
      add constraint mannschaften_min_spieler_check check (min_spieler between 1 and 12);
  end if;
end $$;

-- Saison wird aus dem Datum abgeleitet (Saisonwechsel zum 1. Juli).
-- Generierte Spalte: keine Datenpflege, keine Änderung bestehender Werte.
alter table public.spieltermine add column if not exists saison text
  generated always as (
    ((extract(year from datum))::int - case when extract(month from datum) < 7 then 1 else 0 end)::text
    || '/' ||
    lpad((((extract(year from datum))::int - case when extract(month from datum) < 7 then 1 else 0 end + 1) % 100)::text, 2, '0')
  ) stored;

alter table public.spieler add column if not exists nachgemeldet_am timestamptz;

create index if not exists idx_spieltermine_mannschaft_saison on public.spieltermine (mannschaft_id, saison, halbrunde, datum);
create index if not exists idx_verfuegbarkeiten_spieltermin on public.verfuegbarkeiten (spieltermin_id);
create index if not exists idx_alternativtermine_spieltermin on public.alternativtermine (spieltermin_id);

-- Keine doppelten Alternativtermine (gleicher Spieltermin, Datum, Uhrzeit).
-- Schlägt fehl (und rollt die ganze Migration zurück), falls produktiv bereits
-- Dubletten existieren → Vorabprüfung: docs/MIGRATIONSPLAN.md, Abschnitt 3.
create unique index if not exists alternativtermine_eindeutig
  on public.alternativtermine (spieltermin_id, datum, uhrzeit) nulls not distinct;

-- ---------------------------------------------------------------------------
-- 2. Einstellungen (privat, nur über Funktionen erreichbar)
-- ---------------------------------------------------------------------------
create table if not exists private.einstellungen (
  schluessel   text primary key,
  wert         jsonb not null,
  beschreibung text,
  geaendert_am timestamptz not null default now()
);
insert into private.einstellungen (schluessel, wert, beschreibung) values
  ('legacy_links_erlaubt',  'true', 'Bisherige gemeinsame Spieltagslinks (abfrage_token) akzeptieren'),
  ('nachmeldung_erlaubt',   'true', '"Ich stehe nicht in der Liste" über gemeinsame Links erlauben'),
  ('nachmeldungen_pro_tag', '5',    'Max. Nachmeldungen je Mannschaft und 24 h'),
  ('anmerkung_max_laenge',  '500',  'Max. Zeichen einer Anmerkung'),
  ('helfer_pro_stunde',     '30',   'Max. Helfer-Eintragungen je Stunde (gesamt)'),
  ('link_gueltig_tage',     '2',    'Neue Links gelten bis n Tage nach dem Spieltag')
on conflict (schluessel) do nothing;

create or replace function private.einstellung(p_schluessel text, p_standard jsonb)
returns jsonb
language sql stable security definer
set search_path = ''
as $$ select coalesce((select wert from private.einstellungen where schluessel = p_schluessel), p_standard) $$;

-- ---------------------------------------------------------------------------
-- 3. Neue Spielerlinks (persönlich oder gemeinsam) – nur Hash gespeichert
-- ---------------------------------------------------------------------------
create table if not exists private.abfrage_links (
  id                  uuid primary key default gen_random_uuid(),
  token_hash          bytea not null unique,
  spieltermin_id      uuid not null references public.spieltermine(id) on delete cascade,
  alternativtermin_id uuid references public.alternativtermine(id) on delete cascade,
  spieler_id          uuid references public.spieler(id) on delete cascade,  -- null = gemeinsamer Link
  gueltig_bis         timestamptz not null,
  widerrufen_am       timestamptz,
  erstellt_von        uuid,
  erstellt_am         timestamptz not null default now(),
  zuletzt_genutzt_am  timestamptz
);
create index if not exists idx_abfrage_links_termin on private.abfrage_links (spieltermin_id);

-- Kryptografisch zufälliges Token aus Kernfunktionen (portabel, ohne pgcrypto):
-- zwei UUIDv4 = 244 Zufallsbits, 64 Hex-Zeichen.
create or replace function private.neues_token()
returns text
language sql volatile
set search_path = ''
as $$ select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') $$;

create or replace function private.token_hash(p_token text)
returns bytea
language sql immutable
set search_path = ''
as $$ select sha256(convert_to(p_token, 'UTF8')) $$;

-- Löst ein Token auf. Liefert keine Zeile bei ungültigem, abgelaufenem,
-- widerrufenem oder (bei deaktiviertem Altpfad) altem Token.
create or replace function private.link_aufloesen(p_token text)
returns table (spieltermin_id uuid, alternativtermin_id uuid, spieler_id uuid, link_id uuid)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  l private.abfrage_links%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    return;
  end if;

  select * into l from private.abfrage_links where token_hash = private.token_hash(p_token);
  if found then
    if l.widerrufen_am is null and l.gueltig_bis > now() then
      return query select l.spieltermin_id, l.alternativtermin_id, l.spieler_id, l.id;
    end if;
    return;
  end if;

  if (private.einstellung('legacy_links_erlaubt', 'true'))::boolean then
    return query
      select a.spieltermin_id, a.id, null::uuid, null::uuid
        from public.alternativtermine a
       where a.abfrage_token = p_token and coalesce(a.status, 'Offen') <> 'Abgelehnt';
    if found then return; end if;
    return query
      select st.id, null::uuid, null::uuid, null::uuid
        from public.spieltermine st where st.abfrage_token = p_token;
  end if;
end $$;

create or replace function private.fehler(p_text text)
returns void
language plpgsql
set search_path = ''
as $$ begin raise exception using message = p_text, errcode = 'P0001'; end $$;

create or replace function private.anmerkung_bereinigen(p_text text)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v text := nullif(btrim(regexp_replace(coalesce(p_text, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  maxlen int := (private.einstellung('anmerkung_max_laenge', '500'))::int;
begin
  if v is not null and char_length(v) > maxlen then
    perform private.fehler(format('Die Anmerkung ist zu lang (max. %s Zeichen).', maxlen));
  end if;
  return v;
end $$;

-- Gemeinsame Schreiblogik für alle Antwortpfade
create or replace function private.antwort_speichern(
  p_spieltermin_id uuid, p_alternativtermin_id uuid, p_spieler_id uuid,
  p_antwort text, p_anmerkung text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_antwort is null or p_antwort not in ('Ja', 'Nein', 'Vielleicht') then
    perform private.fehler('Ungültige Antwort.');
  end if;
  insert into public.verfuegbarkeiten (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung)
  values (p_spieltermin_id, p_alternativtermin_id, p_spieler_id, p_antwort, private.anmerkung_bereinigen(p_anmerkung))
  on conflict on constraint verfuegbarkeiten_unique
  do update set antwort = excluded.antwort, anmerkung = excluded.anmerkung;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Öffentliche RPCs ohne Login (anon)
-- ---------------------------------------------------------------------------
create or replace function public.abfrage_laden(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  l record;
  st public.spieltermine%rowtype;
  alt public.alternativtermine%rowtype;
  m public.mannschaften%rowtype;
  ergebnis jsonb;
begin
  select * into l from private.link_aufloesen(p_token) limit 1;
  if l.spieltermin_id is null then
    perform private.fehler('Dieser Link ist ungültig oder abgelaufen. Bitte beim Mannschaftsführer einen neuen Link anfordern.');
  end if;

  select * into st from public.spieltermine where id = l.spieltermin_id;
  select * into m  from public.mannschaften where id = st.mannschaft_id;
  if l.alternativtermin_id is not null then
    select * into alt from public.alternativtermine where id = l.alternativtermin_id;
  end if;

  ergebnis := jsonb_build_object(
    'persoenlich', l.spieler_id is not null,
    'termin', jsonb_build_object(
      'datum', st.datum, 'uhrzeit', st.uhrzeit, 'heim', st.heim, 'gegner', st.gegner,
      'ort', st.ort, 'status', st.status, 'halbrunde', st.halbrunde),
    'alternativtermin', case when alt.id is null then null
      else jsonb_build_object('datum', alt.datum, 'uhrzeit', alt.uhrzeit) end,
    'mannschaft', jsonb_build_object('name', m.name, 'liga', m.liga),
    'nachmeldung_erlaubt', l.spieler_id is null
      and (private.einstellung('nachmeldung_erlaubt', 'true'))::boolean,
    'spieler', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
        from public.spieler s
       where s.mannschaft_id = st.mannschaft_id and s.aktiv
         and (l.spieler_id is null or s.id = l.spieler_id)), '[]'::jsonb)
  );

  if l.spieler_id is not null then
    ergebnis := ergebnis || jsonb_build_object('eigene_antwort', (
      select jsonb_build_object('antwort', v.antwort, 'anmerkung', v.anmerkung)
        from public.verfuegbarkeiten v
       where v.spieltermin_id = l.spieltermin_id and v.spieler_id = l.spieler_id
         and v.alternativtermin_id is not distinct from l.alternativtermin_id));
  end if;
  return ergebnis;
end $$;

create or replace function public.abfrage_antworten(
  p_token text, p_spieler_id uuid, p_antwort text, p_anmerkung text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  l record;
  v_mannschaft uuid;
begin
  select * into l from private.link_aufloesen(p_token) limit 1;
  if l.spieltermin_id is null then
    perform private.fehler('Dieser Link ist ungültig oder abgelaufen. Bitte beim Mannschaftsführer einen neuen Link anfordern.');
  end if;
  if l.spieler_id is not null and p_spieler_id is distinct from l.spieler_id then
    perform private.fehler('Mit diesem persönlichen Link kann nur die eigene Antwort geändert werden.');
  end if;

  select mannschaft_id into v_mannschaft from public.spieltermine where id = l.spieltermin_id;
  if not exists (select 1 from public.spieler s
                  where s.id = p_spieler_id and s.mannschaft_id = v_mannschaft and s.aktiv) then
    perform private.fehler('Dieser Spieler gehört nicht zur Mannschaft dieses Spieltags.');
  end if;

  perform private.antwort_speichern(l.spieltermin_id, l.alternativtermin_id, p_spieler_id, p_antwort, p_anmerkung);

  if l.link_id is not null then
    update private.abfrage_links set zuletzt_genutzt_am = now() where id = l.link_id;
  end if;
  return jsonb_build_object('ok', true, 'antwort', p_antwort);
end $$;

create or replace function public.abfrage_nachmelden(
  p_token text, p_name text, p_antwort text, p_anmerkung text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  l record;
  v_mannschaft uuid;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_limit int := (private.einstellung('nachmeldungen_pro_tag', '5'))::int;
  v_id uuid;
begin
  select * into l from private.link_aufloesen(p_token) limit 1;
  if l.spieltermin_id is null then
    perform private.fehler('Dieser Link ist ungültig oder abgelaufen. Bitte beim Mannschaftsführer einen neuen Link anfordern.');
  end if;
  if l.spieler_id is not null or not (private.einstellung('nachmeldung_erlaubt', 'true'))::boolean then
    perform private.fehler('Nachmeldungen sind über diesen Link nicht möglich. Bitte an den Mannschaftsführer wenden.');
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 60
     or v_name !~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ][A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ .,''-]*$' then
    perform private.fehler('Bitte einen gültigen Namen eingeben (3–60 Zeichen, nur Buchstaben).');
  end if;
  if p_antwort is null or p_antwort not in ('Ja', 'Nein', 'Vielleicht') then
    perform private.fehler('Ungültige Antwort.');
  end if;

  select mannschaft_id into v_mannschaft from public.spieltermine where id = l.spieltermin_id;

  if exists (select 1 from public.spieler s
              where s.mannschaft_id = v_mannschaft and s.aktiv and lower(s.name) = lower(v_name)) then
    perform private.fehler('Dieser Name steht bereits in der Liste. Bitte dort auswählen.');
  end if;
  if (select count(*) from public.spieler s
       where s.mannschaft_id = v_mannschaft and s.nachgemeldet_am > now() - interval '24 hours') >= v_limit then
    perform private.fehler('Zu viele Nachmeldungen. Bitte direkt an den Mannschaftsführer wenden.');
  end if;

  insert into public.spieler (mannschaft_id, name, aktiv, nachgemeldet_am)
  values (v_mannschaft, v_name, true, now())
  returning id into v_id;

  perform private.antwort_speichern(l.spieltermin_id, l.alternativtermin_id, v_id, p_antwort, p_anmerkung);
  return jsonb_build_object('ok', true, 'antwort', p_antwort, 'spieler_id', v_id);
end $$;

create or replace function public.helfer_eintragen(p_name text, p_einsatz text, p_anmerkung text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    perform private.fehler('Bitte einen Namen mit 2–80 Zeichen eingeben.');
  end if;
  if p_einsatz is null or p_einsatz not in ('aufbau', 'turnier', 'beides') then
    perform private.fehler('Bitte einen Einsatzbereich auswählen.');
  end if;
  if (select count(*) from public.turnier_helfer where created_at > now() - interval '1 hour')
       >= (private.einstellung('helfer_pro_stunde', '30'))::int then
    perform private.fehler('Gerade sind zu viele Eintragungen eingegangen. Bitte später erneut versuchen.');
  end if;
  insert into public.turnier_helfer (name, einsatz, anmerkung)
  values (v_name, p_einsatz, private.anmerkung_bereinigen(p_anmerkung));
  return jsonb_build_object('ok', true);
end $$;

-- Öffentliche Spielplandaten: ohne Spieler, Antworten, Tokens, E-Mails, IDs
create or replace function public.oeffentlicher_spielplan(p_saison text default null, p_halbrunde text default null)
returns table (mannschaft text, liga text, spieltag_nr integer, datum date, uhrzeit time,
               heim boolean, gegner text, ort text, halbrunde text, status text, saison text)
language sql stable security definer
set search_path = ''
as $$
  select m.name, m.liga, st.spieltag_nr, st.datum, st.uhrzeit, st.heim, st.gegner, st.ort,
         st.halbrunde, st.status, st.saison
    from public.spieltermine st
    join public.mannschaften m on m.id = st.mannschaft_id
   where (p_saison is null or st.saison = p_saison)
     and (p_halbrunde is null or st.halbrunde = p_halbrunde)
   order by m.name, st.datum, st.uhrzeit;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPCs für angemeldete MF/Admins
-- ---------------------------------------------------------------------------
create or replace function public.abfrage_link_erzeugen(
  p_spieltermin_id uuid, p_alternativtermin_id uuid default null,
  p_spieler_id uuid default null, p_gueltig_bis timestamptz default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  st public.spieltermine%rowtype;
  v_datum date;
  v_bis timestamptz;
  v_token text := private.neues_token();
  v_id uuid;
begin
  if not private.darf_termin(p_spieltermin_id) then
    perform private.fehler('Keine Berechtigung für diesen Spieltermin.');
  end if;
  select * into st from public.spieltermine where id = p_spieltermin_id;
  v_datum := st.datum;
  if p_alternativtermin_id is not null then
    select a.datum into v_datum from public.alternativtermine a
     where a.id = p_alternativtermin_id and a.spieltermin_id = p_spieltermin_id;
    if not found then perform private.fehler('Alternativtermin gehört nicht zu diesem Spieltermin.'); end if;
  end if;
  if p_spieler_id is not null and not exists (
       select 1 from public.spieler s where s.id = p_spieler_id and s.mannschaft_id = st.mannschaft_id and s.aktiv) then
    perform private.fehler('Spieler gehört nicht zur Mannschaft.');
  end if;

  v_bis := coalesce(p_gueltig_bis,
    ((v_datum + (private.einstellung('link_gueltig_tage', '2'))::int)::timestamp + time '23:59:59')
      at time zone 'Europe/Berlin');
  if v_bis <= now() or v_bis > now() + interval '400 days' then
    perform private.fehler('Ungültiges Ablaufdatum für den Link.');
  end if;

  insert into private.abfrage_links (token_hash, spieltermin_id, alternativtermin_id, spieler_id, gueltig_bis, erstellt_von)
  values (private.token_hash(v_token), p_spieltermin_id, p_alternativtermin_id, p_spieler_id, v_bis, private.aktueller_nutzer())
  returning id into v_id;

  -- Das Rohtoken wird nur dieses eine Mal zurückgegeben.
  return jsonb_build_object('link_id', v_id, 'token', v_token, 'gueltig_bis', v_bis);
end $$;

create or replace function public.abfrage_link_widerrufen(p_link_id uuid)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare v_termin uuid;
begin
  select spieltermin_id into v_termin from private.abfrage_links where id = p_link_id;
  if v_termin is null or not private.darf_termin(v_termin) then
    perform private.fehler('Link nicht gefunden oder keine Berechtigung.');
  end if;
  update private.abfrage_links set widerrufen_am = now() where id = p_link_id and widerrufen_am is null;
  return true;
end $$;

create or replace function public.abfrage_links_liste(p_spieltermin_id uuid)
returns table (id uuid, alternativtermin_id uuid, spieler_id uuid, gueltig_bis timestamptz,
               widerrufen_am timestamptz, erstellt_am timestamptz, zuletzt_genutzt_am timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.darf_termin(p_spieltermin_id) then
    perform private.fehler('Keine Berechtigung für diesen Spieltermin.');
  end if;
  return query
    select l.id, l.alternativtermin_id, l.spieler_id, l.gueltig_bis, l.widerrufen_am, l.erstellt_am, l.zuletzt_genutzt_am
      from private.abfrage_links l where l.spieltermin_id = p_spieltermin_id
     order by l.erstellt_am;
end $$;

-- Widerruf eines bisherigen gemeinsamen Links durch Token-Erneuerung
create or replace function public.abfrage_token_erneuern(p_spieltermin_id uuid, p_alternativtermin_id uuid default null)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare v_token text := private.neues_token();
begin
  if not private.darf_termin(p_spieltermin_id) then
    perform private.fehler('Keine Berechtigung für diesen Spieltermin.');
  end if;
  if p_alternativtermin_id is null then
    update public.spieltermine set abfrage_token = v_token where id = p_spieltermin_id
    returning abfrage_token into v_token;
  else
    update public.alternativtermine set abfrage_token = v_token
     where id = p_alternativtermin_id and spieltermin_id = p_spieltermin_id
    returning abfrage_token into v_token;
    if not found then perform private.fehler('Alternativtermin gehört nicht zu diesem Spieltermin.'); end if;
  end if;
  return v_token;
end $$;

-- Verschiebung in EINER Transaktion abschließen (ersetzt 5 Einzelaufrufe)
create or replace function public.verschiebung_abschliessen(
  p_spieltermin_id uuid, p_datum date, p_uhrzeit time default null, p_alternativtermin_id uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not private.ist_admin() then
    perform private.fehler('Nur Administratoren können Verschiebungen bestätigen.');
  end if;
  if p_datum is null then perform private.fehler('Bitte ein Datum angeben.'); end if;
  perform 1 from public.spieltermine where id = p_spieltermin_id for update;
  if not found then perform private.fehler('Spieltermin nicht gefunden.'); end if;
  if p_alternativtermin_id is not null and not exists (
       select 1 from public.alternativtermine where id = p_alternativtermin_id and spieltermin_id = p_spieltermin_id) then
    perform private.fehler('Alternativtermin gehört nicht zu diesem Spieltermin.');
  end if;

  update public.spieltermine
     set datum = p_datum, uhrzeit = p_uhrzeit, status = 'Verschoben',
         abfrage_token = case when p_alternativtermin_id is null then private.neues_token() else abfrage_token end
   where id = p_spieltermin_id;

  delete from public.verfuegbarkeiten where spieltermin_id = p_spieltermin_id and alternativtermin_id is null;
  if p_alternativtermin_id is not null then
    update public.verfuegbarkeiten set alternativtermin_id = null where alternativtermin_id = p_alternativtermin_id;
  end if;
  -- löscht per FK-Kaskade auch die übrigen Alternativtermin-Stimmen
  delete from public.alternativtermine where spieltermin_id = p_spieltermin_id;

  return jsonb_build_object('ok', true, 'stimmen_uebernommen', p_alternativtermin_id is not null);
end $$;

-- Aufstellung in EINER Transaktion speichern (ersetzt delete + insert)
create or replace function public.aufstellung_speichern(
  p_spieltermin_id uuid, p_spieler_ids uuid[], p_ersatz_mannschaft_id uuid default null, p_ersatz_anzahl integer default 0)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  st public.spieltermine%rowtype;
  v_min int;
  v_ids uuid[] := array(select distinct unnest(coalesce(p_spieler_ids, '{}'::uuid[])));
  v_ersatz int := coalesce(p_ersatz_anzahl, 0);
begin
  if not private.darf_termin(p_spieltermin_id) then
    perform private.fehler('Keine Berechtigung für diesen Spieltermin.');
  end if;
  select * into st from public.spieltermine where id = p_spieltermin_id for update;
  select coalesce(min_spieler, 6) into v_min from public.mannschaften where id = st.mannschaft_id;

  if v_ersatz < 0 then perform private.fehler('Ungültige Ersatzanzahl.'); end if;
  if cardinality(v_ids) + v_ersatz <> v_min then
    perform private.fehler(format('Bitte genau %s Spieler/Ersatz auswählen.', v_min));
  end if;
  if exists (select 1 from unnest(v_ids) x(id)
              where not exists (select 1 from public.spieler s
                                 where s.id = x.id and s.mannschaft_id = st.mannschaft_id and s.aktiv)) then
    perform private.fehler('Mindestens ein Spieler gehört nicht zur Mannschaft.');
  end if;
  if v_ersatz > 0 and not exists (
       select 1 from public.mannschaften e join public.mannschaften eigene on eigene.id = st.mannschaft_id
        where e.id = p_ersatz_mannschaft_id and e.id <> eigene.id
          and e.verein_id is not distinct from eigene.verein_id) then
    perform private.fehler('Ungültige Ersatzmannschaft.');
  end if;

  delete from public.aufstellungen where spieltermin_id = p_spieltermin_id;
  insert into public.aufstellungen (spieltermin_id, spieler_id)
    select p_spieltermin_id, id from unnest(v_ids) x(id);
  insert into public.aufstellungen (spieltermin_id, spieler_id, ersatz_mannschaft_id)
    select p_spieltermin_id, null, p_ersatz_mannschaft_id from generate_series(1, v_ersatz);

  return jsonb_build_object('ok', true, 'anzahl', cardinality(v_ids) + v_ersatz);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Trigger: serverseitige Integrität (gilt auch für den bisherigen Altpfad)
-- ---------------------------------------------------------------------------

-- Abfrage-Tokens werden für API-Rollen immer serverseitig erzeugt.
create or replace function private.tg_token_serverseitig()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.api_rolle() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.abfrage_token := private.neues_token();
    elsif new.abfrage_token is distinct from old.abfrage_token then
      new.abfrage_token := private.neues_token();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists spieltermine_token_serverseitig on public.spieltermine;
create trigger spieltermine_token_serverseitig
  before insert or update of abfrage_token on public.spieltermine
  for each row execute function private.tg_token_serverseitig();

drop trigger if exists alternativtermine_token_serverseitig on public.alternativtermine;
create trigger alternativtermine_token_serverseitig
  before insert or update of abfrage_token on public.alternativtermine
  for each row execute function private.tg_token_serverseitig();

-- Nicht-Admins dürfen an Spielterminen nur den Verschiebungsstatus umschalten.
create or replace function private.tg_spieltermin_aenderung_pruefen()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.api_rolle() in ('anon', 'authenticated') and not private.ist_admin() then
    -- abfrage_token darf sich ändern: der Token-Trigger ersetzt ihn stets durch einen Zufallswert.
    -- saison ist generiert und in BEFORE-Triggern im NEW-Datensatz noch NULL.
    if (to_jsonb(new) - array['status', 'abfrage_token', 'saison'])
       is distinct from (to_jsonb(old) - array['status', 'abfrage_token', 'saison']) then
      perform private.fehler('Mannschaftsführer dürfen nur den Verschiebungsstatus ändern.');
    end if;
    if new.status is distinct from old.status
       and not (new.status = 'Verschiebung nötig'
                or (old.status = 'Verschiebung nötig' and new.status = 'Geplant')) then
      perform private.fehler('Diese Statusänderung ist nur für Administratoren erlaubt.');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists spieltermine_aenderung_pruefen on public.spieltermine;
create trigger spieltermine_aenderung_pruefen
  before update on public.spieltermine
  for each row execute function private.tg_spieltermin_aenderung_pruefen();

-- Verfügbarkeiten: Spieler muss zur Mannschaft des Termins gehören,
-- Alternativtermin zum Spieltermin.
create or replace function private.tg_verfuegbarkeit_pruefen()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pruefen boolean;
begin
  if new.alternativtermin_id is not null and not exists (
       select 1 from public.alternativtermine a
        where a.id = new.alternativtermin_id and a.spieltermin_id = new.spieltermin_id) then
    perform private.fehler('Alternativtermin gehört nicht zum Spieltermin.');
  end if;
  if tg_op = 'INSERT' then
    v_pruefen := true;
  else
    v_pruefen := new.spieler_id is distinct from old.spieler_id
              or new.spieltermin_id is distinct from old.spieltermin_id;
  end if;
  if v_pruefen then
    if not exists (select 1 from public.spieler s join public.spieltermine st on st.mannschaft_id = s.mannschaft_id
                    where s.id = new.spieler_id and st.id = new.spieltermin_id) then
      perform private.fehler('Spieler gehört nicht zur Mannschaft dieses Spieltags.');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists verfuegbarkeiten_pruefen on public.verfuegbarkeiten;
create trigger verfuegbarkeiten_pruefen
  before insert or update on public.verfuegbarkeiten
  for each row execute function private.tg_verfuegbarkeit_pruefen();

-- ---------------------------------------------------------------------------
-- 7. Ausführungsrechte (Postgres/Supabase vergeben EXECUTE sonst an alle)
-- ---------------------------------------------------------------------------
revoke all on function
  private.einstellung(text, jsonb), private.neues_token(), private.token_hash(text),
  private.link_aufloesen(text), private.fehler(text), private.anmerkung_bereinigen(text),
  private.antwort_speichern(uuid, uuid, uuid, text, text),
  private.tg_token_serverseitig(), private.tg_spieltermin_aenderung_pruefen(), private.tg_verfuegbarkeit_pruefen()
  from public;
revoke all on table private.einstellungen, private.abfrage_links from public, anon, authenticated;

revoke all on function
  public.abfrage_laden(text), public.abfrage_antworten(text, uuid, text, text),
  public.abfrage_nachmelden(text, text, text, text), public.helfer_eintragen(text, text, text),
  public.oeffentlicher_spielplan(text, text),
  public.abfrage_link_erzeugen(uuid, uuid, uuid, timestamptz), public.abfrage_link_widerrufen(uuid),
  public.abfrage_links_liste(uuid), public.abfrage_token_erneuern(uuid, uuid),
  public.verschiebung_abschliessen(uuid, date, time, uuid),
  public.aufstellung_speichern(uuid, uuid[], uuid, integer)
  from public, anon, authenticated;

grant execute on function
  public.abfrage_laden(text), public.abfrage_antworten(text, uuid, text, text),
  public.abfrage_nachmelden(text, text, text, text), public.helfer_eintragen(text, text, text),
  public.oeffentlicher_spielplan(text, text)
  to anon, authenticated;

grant execute on function
  public.abfrage_link_erzeugen(uuid, uuid, uuid, timestamptz), public.abfrage_link_widerrufen(uuid),
  public.abfrage_links_liste(uuid), public.abfrage_token_erneuern(uuid, uuid),
  public.verschiebung_abschliessen(uuid, date, time, uuid),
  public.aufstellung_speichern(uuid, uuid[], uuid, integer)
  to authenticated;

commit;
