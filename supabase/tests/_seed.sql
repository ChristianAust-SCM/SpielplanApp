-- ============================================================================
-- SYNTHETISCHE Testdaten – frei erfunden, keine Produktivdaten
-- Feste IDs, damit Tests sie direkt ansprechen können.
-- Termine relativ zum aktuellen Datum, damit Gültigkeitstests stabil bleiben.
-- ============================================================================

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000a1', 'admin@test.invalid'),
  ('00000000-0000-4000-a000-0000000000b1', 'mf1@test.invalid'),
  ('00000000-0000-4000-a000-0000000000b2', 'mf2@test.invalid'),
  ('00000000-0000-4000-a000-0000000000c1', 'ohnerolle@test.invalid');

insert into public.vereine (id, name, kuerzel) values
  ('00000000-0000-4000-b000-000000000001', 'Testverein e.V.', 'testverein');

insert into public.mannschaften (id, verein_id, name, liga, mf_name, mf_email) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '1. Mannschaft', 'Testliga A', 'Erika Muster', 'mf1@test.invalid'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '2. Mannschaft', 'Testliga B', 'Max Muster',   'mf2@test.invalid'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '3. Mannschaft', 'Testliga C', 'Ida Muster',   'mf3@test.invalid');

insert into public.nutzer_rollen (user_id, mannschaft_id, rolle) values
  ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-c000-000000000001', 'admin'),
  ('00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-c000-000000000001', 'mf'),
  ('00000000-0000-4000-a000-0000000000b2', '00000000-0000-4000-c000-000000000002', 'mf');

insert into public.spieler (id, mannschaft_id, name, ttr, aktiv, position, spieler_token) values
  ('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-c000-000000000001', 'Alpha, Anna',   1500, true,  1, 'spielertoken-geheim-11'),
  ('00000000-0000-4000-d000-000000000012', '00000000-0000-4000-c000-000000000001', 'Beta, Ben',     1490, true,  2, 'spielertoken-geheim-12'),
  ('00000000-0000-4000-d000-000000000013', '00000000-0000-4000-c000-000000000001', 'Gamma, Gina',   1480, true,  3, 'spielertoken-geheim-13'),
  ('00000000-0000-4000-d000-000000000014', '00000000-0000-4000-c000-000000000001', 'Delta, Dirk',   1470, true,  4, 'spielertoken-geheim-14'),
  ('00000000-0000-4000-d000-000000000015', '00000000-0000-4000-c000-000000000001', 'Epsilon, Eva',  1460, true,  5, 'spielertoken-geheim-15'),
  ('00000000-0000-4000-d000-000000000016', '00000000-0000-4000-c000-000000000001', 'Zeta, Zoe',     1450, true,  6, 'spielertoken-geheim-16'),
  ('00000000-0000-4000-d000-000000000017', '00000000-0000-4000-c000-000000000001', 'Inaktiv, Ina',  1440, false, 7, 'spielertoken-geheim-17'),
  ('00000000-0000-4000-d000-000000000021', '00000000-0000-4000-c000-000000000002', 'Omega, Olaf',   1300, true,  1, 'spielertoken-geheim-21'),
  ('00000000-0000-4000-d000-000000000022', '00000000-0000-4000-c000-000000000002', 'Psi, Paula',    1290, true,  2, 'spielertoken-geheim-22'),
  ('00000000-0000-4000-d000-000000000031', '00000000-0000-4000-c000-000000000003', 'Tau, Tom',      1100, true,  1, 'spielertoken-geheim-31');

insert into public.spieltermine (id, mannschaft_id, spieltag_nr, datum, uhrzeit, heim, gegner, halbrunde, status, abfrage_token) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-c000-000000000001', 1, current_date + 10, '14:30', true,  'TSV Testhausen', 'Vorrunde', 'Geplant', 'altlink-termin1-aaaaaaaaaaaaaaaa'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-c000-000000000002', 1, current_date + 11, '18:30', false, 'SC Probedorf',   'Vorrunde', 'Geplant', 'altlink-termin2-bbbbbbbbbbbbbbbb'),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-c000-000000000001', 2, current_date - 30, '14:30', false, 'FC Vergangen',   'Vorrunde', 'Gespielt', 'altlink-termin3-cccccccccccccccc');

insert into public.alternativtermine (id, spieltermin_id, datum, uhrzeit, abfrage_token) values
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-e000-000000000001', current_date + 17, '14:30', 'altlink-alternativ1-dddddddddddd');

insert into public.verfuegbarkeiten (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung) values
  ('00000000-0000-4000-e000-000000000001', null, '00000000-0000-4000-d000-000000000011', 'Ja',   'vertrauliche Anmerkung Anna'),
  ('00000000-0000-4000-e000-000000000001', null, '00000000-0000-4000-d000-000000000012', 'Nein', null),
  ('00000000-0000-4000-e000-000000000002', null, '00000000-0000-4000-d000-000000000021', 'Ja',   'vertrauliche Anmerkung Olaf'),
  ('00000000-0000-4000-e000-000000000003', null, '00000000-0000-4000-d000-000000000011', 'Ja',   null);

insert into public.turnier_helfer (name, einsatz, anmerkung) values ('Test Helfer', 'aufbau', null);
