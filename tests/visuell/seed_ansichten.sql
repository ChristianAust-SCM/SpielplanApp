-- ============================================================================
-- NUR LOKALE STAGING-UMGEBUNG – Daten für die Design-Ansichten (Premium-Design)
-- ----------------------------------------------------------------------------
-- Spieltermine: öffentlicher Vorrunden-Spielplan der 1. Mannschaft aus der
-- abgestimmten Design-Vorlage (Gegner, Datum, Uhrzeit, Heim/Auswärts, Ligen).
-- Spielernamen, TTR-Werte, Antworten und Anmerkungen sind SYNTHETISCH –
-- keine Produktivdaten. Wird nach Migration 01–05 und 09 eingespielt.
-- ============================================================================
begin;

update public.mannschaften set liga = 'Bezirksoberliga', min_spieler = 6 where id = '00000000-0000-4000-c000-000000000001';
update public.mannschaften set liga = 'Kreisliga B',     min_spieler = 6 where id = '00000000-0000-4000-c000-000000000002';
update public.mannschaften set liga = 'Kreisklasse',     min_spieler = 4 where id = '00000000-0000-4000-c000-000000000003';

-- Bisherige Testtermine der 1. Mannschaft entfernen (nur Staging)
delete from public.spieltermine where mannschaft_id = '00000000-0000-4000-c000-000000000001';

-- Kader 1. Mannschaft: 9 aktive Spieler (synthetisch)
update public.spieler set name = v.name, ttr = v.ttr, position = v.pos
  from (values
    ('00000000-0000-4000-d000-000000000011'::uuid, 'Huber, Markus',   1784, 1),
    ('00000000-0000-4000-d000-000000000012'::uuid, 'Wagner, Tobias',  1752, 2),
    ('00000000-0000-4000-d000-000000000013'::uuid, 'Schmid, Andreas', 1731, 3),
    ('00000000-0000-4000-d000-000000000014'::uuid, 'Maier, Florian',  1709, 4),
    ('00000000-0000-4000-d000-000000000015'::uuid, 'Weber, Daniel',   1688, 5),
    ('00000000-0000-4000-d000-000000000016'::uuid, 'Fischer, Stefan', 1671, 6)) v(id, name, ttr, pos)
 where public.spieler.id = v.id;
insert into public.spieler (id, mannschaft_id, name, ttr, aktiv, position) values
  ('00000000-0000-4000-d000-000000000018', '00000000-0000-4000-c000-000000000001', 'Keller, Jonas',  1655, true, 7),
  ('00000000-0000-4000-d000-000000000019', '00000000-0000-4000-c000-000000000001', 'Braun, Simon',   1640, true, 8),
  ('00000000-0000-4000-d000-00000000001a', '00000000-0000-4000-c000-000000000001', 'Hofmann, Lukas', 1622, true, 9);

-- Vorrunde 2026/27, 1. Mannschaft (laut Vorlage)
insert into public.spieltermine (id, mannschaft_id, spieltag_nr, datum, uhrzeit, heim, gegner, halbrunde, status) values
  ('00000000-0000-4000-e100-000000000001', '00000000-0000-4000-c000-000000000001', 1, '2026-09-27', '14:30', true,  'TSV Erbach',                'Vorrunde', 'Geplant'),
  ('00000000-0000-4000-e100-000000000002', '00000000-0000-4000-c000-000000000001', 2, '2026-10-03', '18:30', false, 'TT Steinheim-Zang (SG)',    'Vorrunde', 'Geplant'),
  ('00000000-0000-4000-e100-000000000003', '00000000-0000-4000-c000-000000000001', 3, '2026-10-10', '18:00', false, 'TT Griesingen-Rißtissen (SG)', 'Vorrunde', 'Geplant'),
  ('00000000-0000-4000-e100-000000000004', '00000000-0000-4000-c000-000000000001', 4, '2026-10-11', '14:30', true,  'SC Vöhringen',              'Vorrunde', 'Verschoben'),
  ('00000000-0000-4000-e100-000000000005', '00000000-0000-4000-c000-000000000001', 5, '2026-10-18', '14:30', true,  'SC Unterschneidheim',       'Vorrunde', 'Geplant'),
  ('00000000-0000-4000-e100-000000000006', '00000000-0000-4000-c000-000000000001', 6, '2026-10-24', '18:30', false, 'SC Berg',                   'Vorrunde', 'Geplant'),
  ('00000000-0000-4000-e100-000000000007', '00000000-0000-4000-c000-000000000001', 7, '2026-11-01', '14:30', true,  'TSV Holzheim',              'Vorrunde', 'Geplant'),
  ('00000000-0000-4000-e100-000000000008', '00000000-0000-4000-c000-000000000001', 8, '2026-11-28', '15:30', false, 'SSV Ulm 1846 III',          'Vorrunde', 'Geplant'),
  ('00000000-0000-4000-e100-000000000009', '00000000-0000-4000-c000-000000000001', 9, '2026-11-29', '14:30', true,  'TSV Altheim',               'Vorrunde', 'Geplant');

-- Antworten: je Termin 8 von 9 (Muster ja/vielleicht/nein in Kaderreihenfolge, letzter Spieler offen)
with kader(nr, sid) as (values
    (1, '00000000-0000-4000-d000-000000000011'::uuid), (2, '00000000-0000-4000-d000-000000000012'::uuid),
    (3, '00000000-0000-4000-d000-000000000013'::uuid), (4, '00000000-0000-4000-d000-000000000014'::uuid),
    (5, '00000000-0000-4000-d000-000000000015'::uuid), (6, '00000000-0000-4000-d000-000000000016'::uuid),
    (7, '00000000-0000-4000-d000-000000000018'::uuid), (8, '00000000-0000-4000-d000-000000000019'::uuid),
    (9, '00000000-0000-4000-d000-00000000001a'::uuid)),
muster(tnr, antworten) as (values
    (1, array['Ja','Ja','Ja','Nein','Ja','Ja','Ja','Ja']),
    (2, array['Ja','Ja','Nein','Ja','Ja','Ja','Nein','Ja']),
    (3, array['Nein','Ja','Nein','Nein','Vielleicht','Ja','Nein','Ja']),
    (4, array['Ja','Ja','Ja','Ja','Ja','Nein','Ja','Ja']),
    (5, array['Ja','Nein','Ja','Ja','Ja','Ja','Nein','Ja']),
    (6, array['Ja','Ja','Ja','Ja','Nein','Ja','Ja','Nein']),
    (7, array['Ja','Ja','Vielleicht','Ja','Ja','Nein','Ja','Ja']),
    (8, array['Ja','Ja','Ja','Vielleicht','Ja','Ja','Nein','Ja']),
    (9, array['Ja','Nein','Ja','Ja','Ja','Ja','Nein','Ja']))
insert into public.verfuegbarkeiten (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung)
select ('00000000-0000-4000-e100-00000000000' || m.tnr)::uuid, null, k.sid, m.antworten[k.nr], null
  from muster m join kader k on k.nr <= 8;

-- Anmerkungen beim kritischen Spiel (synthetisch)
update public.verfuegbarkeiten set anmerkung = 'Urlaub bis 12.10.'
 where spieltermin_id = '00000000-0000-4000-e100-000000000003' and spieler_id = '00000000-0000-4000-d000-000000000011';
update public.verfuegbarkeiten set anmerkung = 'Spätschicht, frühestens 19 Uhr in der Halle'
 where spieltermin_id = '00000000-0000-4000-e100-000000000003' and spieler_id = '00000000-0000-4000-d000-000000000014';
update public.verfuegbarkeiten set anmerkung = 'Nur wenn es nicht anders geht – Knie noch nicht ganz fit'
 where spieltermin_id = '00000000-0000-4000-e100-000000000003' and spieler_id = '00000000-0000-4000-d000-000000000015';
update public.verfuegbarkeiten set anmerkung = 'Dienstreise'
 where spieltermin_id = '00000000-0000-4000-e100-000000000003' and spieler_id = '00000000-0000-4000-d000-000000000013';
update public.verfuegbarkeiten set anmerkung = 'Familienfeier'
 where spieltermin_id = '00000000-0000-4000-e100-000000000003' and spieler_id = '00000000-0000-4000-d000-000000000018';

-- Aufstellungen (Spiele 1 und 5)
insert into public.aufstellungen (spieltermin_id, spieler_id)
select t.id, s.id
  from (values ('00000000-0000-4000-e100-000000000001'::uuid), ('00000000-0000-4000-e100-000000000005'::uuid)) t(id)
  cross join (values ('00000000-0000-4000-d000-000000000012'::uuid), ('00000000-0000-4000-d000-000000000013'::uuid),
                     ('00000000-0000-4000-d000-000000000016'::uuid), ('00000000-0000-4000-d000-000000000019'::uuid),
                     ('00000000-0000-4000-d000-000000000015'::uuid), ('00000000-0000-4000-d000-000000000011'::uuid)) s(id);

commit;
