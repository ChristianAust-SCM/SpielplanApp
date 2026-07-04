-- ============================================================
-- Spielplan-App · Datenbankschema v1
-- FC Strass / Tisch 7 · Saison 2026/27
-- ============================================================

-- Vereine (spätere Mandantenfähigkeit)
create table vereine (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kuerzel text not null unique,
  created_at timestamptz default now()
);

-- Mannschaften je Verein
create table mannschaften (
  id uuid primary key default gen_random_uuid(),
  verein_id uuid references vereine(id) on delete cascade,
  name text not null,
  liga text not null,
  mf_name text,
  mf_email text,
  created_at timestamptz default now()
);

-- Spieler je Mannschaft
create table spieler (
  id uuid primary key default gen_random_uuid(),
  mannschaft_id uuid references mannschaften(id) on delete cascade,
  name text not null,
  ttr integer,
  aktiv boolean default true,
  created_at timestamptz default now()
);

-- Spieltermine je Mannschaft
create table spieltermine (
  id uuid primary key default gen_random_uuid(),
  mannschaft_id uuid references mannschaften(id) on delete cascade,
  spieltag_nr integer,
  datum date not null,
  uhrzeit time,
  heim boolean default true,
  gegner text not null,
  ort text,
  halbrunde text check (halbrunde in ('Vorrunde','Rückrunde')) default 'Vorrunde',
  status text check (status in ('Geplant','Bestätigt','Gespielt','Verschoben','Abgesagt')) default 'Geplant',
  abfrage_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

-- Verfügbarkeiten je Spieler je Termin
create table verfuegbarkeiten (
  id uuid primary key default gen_random_uuid(),
  spieltermin_id uuid references spieltermine(id) on delete cascade,
  spieler_id uuid references spieler(id) on delete cascade,
  antwort text check (antwort in ('Ja','Nein','Bedingt')) not null,
  anmerkung text,
  created_at timestamptz default now(),
  unique(spieltermin_id, spieler_id)
);

-- ============================================================
-- Row Level Security (RLS) – öffentlich lesbar, schreibbar
-- für MVP ohne Auth (Spieler-Abfrageseite ohne Login)
-- ============================================================
alter table vereine enable row level security;
alter table mannschaften enable row level security;
alter table spieler enable row level security;
alter table spieltermine enable row level security;
alter table verfuegbarkeiten enable row level security;

-- Lesezugriff für alle (anon key reicht)
create policy "Lesen erlaubt" on vereine for select using (true);
create policy "Lesen erlaubt" on mannschaften for select using (true);
create policy "Lesen erlaubt" on spieler for select using (true);
create policy "Lesen erlaubt" on spieltermine for select using (true);
create policy "Lesen erlaubt" on verfuegbarkeiten for select using (true);

-- Schreiben nur für Verfügbarkeiten (Spieler-Abfrageseite)
create policy "Verfügbarkeit eintragen" on verfuegbarkeiten
  for insert with check (true);
create policy "Verfügbarkeit aktualisieren" on verfuegbarkeiten
  for update using (true);

-- ============================================================
-- Beispieldaten FC Strass
-- ============================================================
insert into vereine (id, name, kuerzel) values
  ('00000000-0000-0000-0000-000000000001', 'FC Strass e.V.', 'fcstrass');

insert into mannschaften (id, verein_id, name, liga, mf_name, mf_email) values
  ('10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '1. Mannschaft', 'Bezirksoberliga',
   'Thomas Höfle', 'thomas.hoefle@fcstrass.de'),
  ('10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '2. Mannschaft', 'Kreisliga B',
   'Florian Seitz', 'florian.seitz@fcstrass.de'),
  ('10000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   '3. Mannschaft', 'Kreisklasse A',
   'Günter Herbrich', 'guenter.herbrich@fcstrass.de');

-- Spieler 1. Mannschaft (Beispiel)
insert into spieler (mannschaft_id, name, ttr) values
  ('10000000-0000-0000-0000-000000000001', 'Höfle Thomas', 1680),
  ('10000000-0000-0000-0000-000000000001', 'Müller Andreas', 1620),
  ('10000000-0000-0000-0000-000000000001', 'Schmidt Klaus', 1580),
  ('10000000-0000-0000-0000-000000000001', 'Wagner Stefan', 1540),
  ('10000000-0000-0000-0000-000000000001', 'Bauer Michael', 1510),
  ('10000000-0000-0000-0000-000000000001', 'Fischer David', 1490),
  ('10000000-0000-0000-0000-000000000002', 'Seitz Florian', 1420),
  ('10000000-0000-0000-0000-000000000002', 'Braun Markus', 1380),
  ('10000000-0000-0000-0000-000000000002', 'Koch Jürgen', 1350),
  ('10000000-0000-0000-0000-000000000002', 'Hartmann Peter', 1320),
  ('10000000-0000-0000-0000-000000000002', 'Zimmermann Lars', 1290),
  ('10000000-0000-0000-0000-000000000003', 'Herbrich Günter', 1180),
  ('10000000-0000-0000-0000-000000000003', 'Schäfer Bernd', 1140),
  ('10000000-0000-0000-0000-000000000003', 'Krause Hans', 1110),
  ('10000000-0000-0000-0000-000000000003', 'Lehmann Frank', 1080);

-- Spieltermine Vorrunde 2026/27 – 1. Mannschaft (BOL)
insert into spieltermine (mannschaft_id, spieltag_nr, datum, uhrzeit, heim, gegner, halbrunde) values
  ('10000000-0000-0000-0000-000000000001', 1,  '2026-09-20', '14:30', true,  'SC Vöhringen', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 2,  '2026-09-27', '14:30', true,  'TSV Erbach', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 3,  '2026-10-03', '18:30', false, 'TT Steinheim-Zang (SG)', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 4,  '2026-10-10', '18:00', false, 'TT Griesingen-Rißtissen (SG)', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 5,  '2026-10-18', '14:30', true,  'SC Unterschneidheim', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 6,  '2026-10-24', '18:30', false, 'SC Berg', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 7,  '2026-11-01', '14:30', true,  'TSV Holzheim', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 8,  '2026-11-28', '15:30', false, 'SSV Ulm 1846 III', 'Vorrunde'),
  ('10000000-0000-0000-0000-000000000001', 9,  '2026-11-29', '14:30', true,  'TSV Altheim', 'Vorrunde');
