-- Rückrunde: geprüfter Terminimport, Vorschau ohne Speicherung, Dubletten
begin;
select plan(15);

\set zeilen_ok '''[{"mannschaft_id":"00000000-0000-4000-c000-000000000001","datum":"2027-01-16","uhrzeit":"18:30","heim":true,"gegner":"SV Synthetisch","halbrunde":"Rückrunde","spieltag_nr":"10"},{"mannschaft_id":"00000000-0000-4000-c000-000000000002","datum":"2027-01-17","uhrzeit":"","heim":false,"gegner":"TTC Erfunden","halbrunde":"Rückrunde"}]'''
\set zeilen_fehler '''[{"mannschaft_id":"00000000-0000-4000-c000-000000000001","datum":"2027-02-30","heim":true,"gegner":"A"},{"mannschaft_id":"00000000-0000-4000-c000-0000000000ff","datum":"2027-01-20","heim":true,"gegner":"SV Unbekannt"},{"mannschaft_id":"00000000-0000-4000-c000-000000000001","datum":"2027-01-23","uhrzeit":"25:00","gegner":"SV Ohne Heim"}]'''

select count(*)::int as vorher from public.spieltermine \gset

:als_mf1
select throws_like(format($$select public.termine_importieren(%L::jsonb, false)$$, :zeilen_ok),
  '%Nur Administratoren%', 'MF darf nicht importieren');

:als_admin
select is((public.termine_importieren(:zeilen_ok::jsonb, false))->>'ok', 'true', 'Vorschau gültiger Zeilen ok');
select is((select count(*)::int from public.spieltermine), :vorher, 'Vorschau speichert nichts');

select is(jsonb_array_length((public.termine_importieren(:zeilen_fehler::jsonb, false))->'fehler'), 3,
  'Alle drei fehlerhaften Zeilen erkannt');
select ok((public.termine_importieren(:zeilen_fehler::jsonb, false))->'fehler'->0->'fehler' ? 'Ungültiges Datum (erwartet JJJJ-MM-TT)',
  'Ungültiges Datum (30.02.) erkannt');
select ok((public.termine_importieren(:zeilen_fehler::jsonb, false))->'fehler'->1->'fehler' ? 'Unbekannte Mannschaft',
  'Unbekannte Mannschaft erkannt');
select ok((public.termine_importieren(:zeilen_fehler::jsonb, false))->'fehler'->2->'fehler' ? 'Heim/Auswärts fehlt',
  'Fehlende Heim/Auswärts-Angabe erkannt');
select ok((public.termine_importieren(:zeilen_fehler::jsonb, false))->'fehler'->2->'fehler' ? 'Ungültige Uhrzeit (erwartet HH:MM)',
  'Ungültige Uhrzeit erkannt');
select is((public.termine_importieren(:zeilen_fehler::jsonb, true))->>'gespeichert', '0',
  'Fehlerhafter Import speichert nichts (alles oder nichts)');

select is((public.termine_importieren((:zeilen_ok::jsonb) || (:zeilen_ok::jsonb), false))->'fehler'->0->'zeile', '3'::jsonb,
  'Doppelte Zeile innerhalb der Datei erkannt');

select is((public.termine_importieren(:zeilen_ok::jsonb, true))->>'gespeichert', '2', 'Gültiger Import speichert 2 Termine');
select is((select halbrunde || ' ' || saison from public.spieltermine where gegner = 'SV Synthetisch'), 'Rückrunde 2026/27',
  'Halbrunde und Saison korrekt');
select ok((public.termine_importieren(:zeilen_ok::jsonb, false))->'fehler'->0->'fehler' ? 'Termin existiert bereits (Dublette)',
  'Erneuter Import wird als Dublette erkannt');

:als_postgres
select is((select count(*)::int from public.spieltermine where halbrunde = 'Vorrunde'), 3, 'Vorrundentermine unverändert');
select is((select saison from public.spieltermine where id = :t1),
  case when extract(month from current_date + 10) >= 7
       then extract(year from current_date + 10)::int::text || '/' || lpad(((extract(year from current_date + 10)::int + 1) % 100)::text, 2, '0')
       else (extract(year from current_date + 10)::int - 1)::text || '/' || lpad((extract(year from current_date + 10)::int % 100)::text, 2, '0') end,
  'Saison wird aus dem Datum abgeleitet');

select * from finish();
rollback;
