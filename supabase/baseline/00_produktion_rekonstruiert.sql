-- ============================================================================
-- NUR FÜR DIE LOKALE TESTUMGEBUNG – NIEMALS AUF PRODUKTION ANWENDEN
-- ============================================================================
-- Rekonstruktion des produktiven Ausgangszustands (Projekt nwutgxjnverlvmkrpiep)
-- für die Tabellen der Spielplan-App.
--
-- Quellen:
--   * Read-only-Strukturaudit vom 09.11.2026 (Policies, Grants, Constraints,
--     Indizes, Trigger) – ausschließlich Katalogdaten, keine Inhalte.
--   * Spaltenliste aus dem Anwendungscode abgeleitet (das Audit enthielt keine
--     Spaltenliste). Abweichungen sind möglich, siehe docs/SICHERHEITSMODELL.md.
--
-- Bewusst NACHGEBILDET (damit Tests den Ist-Zustand als unsicher nachweisen):
--   * offene SELECT-Policies "using (true)" für die Rolle public
--   * "Admins verwalten Rollen" ALL using (auth.uid() = user_id) → Selbstvergabe
--   * Vollrechte (inkl. TRUNCATE) für anon und authenticated
--
-- Die SR-Tabellen (sr_*) liegen produktiv in derselben Datenbank. Sie werden
-- hier NICHT nachgebildet und von keiner Migration angefasst.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create table public.vereine (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kuerzel text not null unique,
  created_at timestamptz default now()
);

create table public.mannschaften (
  id uuid primary key default gen_random_uuid(),
  verein_id uuid references public.vereine(id) on delete cascade,
  name text not null,
  liga text not null,
  mf_name text,
  mf_email text,
  created_at timestamptz default now()
);

create table public.spieler (
  id uuid primary key default gen_random_uuid(),
  mannschaft_id uuid references public.mannschaften(id) on delete cascade,
  name text not null,
  ttr integer,
  aktiv boolean default true,
  position integer,
  spieler_token text unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

create table public.spieltermine (
  id uuid primary key default gen_random_uuid(),
  mannschaft_id uuid references public.mannschaften(id) on delete cascade,
  spieltag_nr integer,
  datum date not null,
  uhrzeit time,
  heim boolean default true,
  gegner text not null,
  ort text,
  halbrunde text default 'Vorrunde'
    constraint spieltermine_halbrunde_check check (halbrunde = any (array['Vorrunde','Rückrunde'])),
  status text default 'Geplant'
    constraint spieltermine_status_check check (status = any (array['Geplant','Bestätigt','Gespielt','Verschoben','Abgesagt','Verschiebung nötig'])),
  abfrage_token text unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

create table public.alternativtermine (
  id uuid primary key default gen_random_uuid(),
  spieltermin_id uuid references public.spieltermine(id) on delete cascade,
  datum date not null,
  uhrzeit time,
  status text default 'Offen'
    constraint alternativtermine_status_check check (status = any (array['Offen','Bestätigt','Abgelehnt'])),
  abfrage_token text unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

create table public.verfuegbarkeiten (
  id uuid primary key default gen_random_uuid(),
  spieltermin_id uuid references public.spieltermine(id) on delete cascade,
  spieler_id uuid references public.spieler(id) on delete cascade,
  alternativtermin_id uuid references public.alternativtermine(id) on delete cascade,
  antwort text not null
    constraint verfuegbarkeiten_antwort_check check (antwort = any (array['Ja','Nein','Vielleicht'])),
  anmerkung text,
  created_at timestamptz default now(),
  constraint verfuegbarkeiten_unique unique nulls not distinct (spieltermin_id, alternativtermin_id, spieler_id)
);

create table public.nutzer_rollen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  mannschaft_id uuid references public.mannschaften(id) on delete cascade,
  rolle text constraint nutzer_rollen_rolle_check check (rolle = any (array['admin','mf'])),
  created_at timestamptz default now(),
  unique (user_id, mannschaft_id)
);

create table public.aufstellungen (
  id uuid primary key default gen_random_uuid(),
  spieltermin_id uuid references public.spieltermine(id) on delete cascade,
  spieler_id uuid references public.spieler(id) on delete cascade,
  ersatz_mannschaft_id uuid references public.mannschaften(id),
  created_at timestamptz default now(),
  constraint aufstellungen_spieler_oder_ersatz_chk check (
    (spieler_id is not null and ersatz_mannschaft_id is null) or
    (spieler_id is null and ersatz_mannschaft_id is not null)),
  unique (spieltermin_id, spieler_id)
);
create index idx_aufstellungen_spieltermin on public.aufstellungen (spieltermin_id);

create table public.turnier_helfer (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  einsatz text constraint turnier_helfer_einsatz_check check (einsatz = any (array['aufbau','turnier','beides'])),
  anmerkung text,
  created_at timestamptz default now()
);

-- Spalten produktiv unbekannt (Tabelle wird im Repository-Code nicht genutzt)
create table public.vereinsbefragung (
  id uuid primary key default gen_random_uuid(),
  daten jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- RLS + Policies exakt wie im Audit
-- ---------------------------------------------------------------------------
alter table public.vereine           enable row level security;
alter table public.mannschaften      enable row level security;
alter table public.spieler           enable row level security;
alter table public.spieltermine      enable row level security;
alter table public.alternativtermine enable row level security;
alter table public.verfuegbarkeiten  enable row level security;
alter table public.nutzer_rollen     enable row level security;
alter table public.aufstellungen     enable row level security;
alter table public.turnier_helfer    enable row level security;
alter table public.vereinsbefragung  enable row level security;

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

create policy "Admins verwalten Rollen" on public.nutzer_rollen for all using (auth.uid() = user_id);
create policy "Eigene Rollen lesen"     on public.nutzer_rollen for select using (auth.uid() = user_id);

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

-- ---------------------------------------------------------------------------
-- Grants wie im Audit: Vollrechte für anon und authenticated
-- ---------------------------------------------------------------------------
grant all on public.vereine, public.mannschaften, public.spieler, public.spieltermine,
             public.alternativtermine, public.verfuegbarkeiten, public.nutzer_rollen,
             public.aufstellungen, public.turnier_helfer, public.vereinsbefragung
  to anon, authenticated, service_role;
