-- Verschiebung und Aufstellung als atomare Serverfunktionen
begin;
select plan(16);

-- ---------------------------------------------------------------- Verschiebung
:als_postgres
insert into public.verfuegbarkeiten (spieltermin_id, alternativtermin_id, spieler_id, antwort)
values (:t1, :a1, :s13, 'Ja'), (:t1, :a1, :s14, 'Ja');
insert into public.alternativtermine (spieltermin_id, datum) values (:t1, current_date + 30);
select abfrage_token as alter_token from public.spieltermine where id = :t1 \gset

:als_mf1
select throws_like(format($$select public.verschiebung_abschliessen(%L, current_date + 17, '14:30', %L)$$, :t1, :a1),
  '%Nur Administratoren%', 'MF kann Verschiebung nicht bestätigen');

:als_admin
select throws_like(format($$select public.verschiebung_abschliessen(%L, current_date + 17, '14:30', %L)$$, :t2, :a1),
  '%gehört nicht zu diesem Spieltermin%', 'Fremder Alternativtermin wird abgelehnt');
select lives_ok(format($$select public.verschiebung_abschliessen(%L, current_date + 17, '14:30', %L)$$, :t1, :a1),
  'Admin bestätigt Alternativtermin');

:als_postgres
select is((select status from public.spieltermine where id = :t1), 'Verschoben', 'Status Verschoben');
select is((select datum from public.spieltermine where id = :t1), current_date + 17, 'Neues Datum gesetzt');
select is((select abfrage_token from public.spieltermine where id = :t1), :'alter_token',
  'Mit Stimmenübernahme bleibt der Link gültig');
select is((select count(*)::int from public.verfuegbarkeiten where spieltermin_id = :t1 and alternativtermin_id is null), 2,
  'Alternativtermin-Stimmen übernommen, alte Stimmen ersetzt');
select is((select count(*)::int from public.alternativtermine where spieltermin_id = :t1), 0, 'Alternativtermine entfernt');
select is((select count(*)::int from public.verfuegbarkeiten where alternativtermin_id is not null and spieltermin_id = :t1), 0,
  'Keine verwaisten Alternativtermin-Stimmen');

:als_admin
select lives_ok(format($$select public.verschiebung_abschliessen(%L, current_date + 21, null, null)$$, :t1),
  'Admin setzt eigenen Termin ohne Übernahme');
:als_postgres
select isnt((select abfrage_token from public.spieltermine where id = :t1), :'alter_token',
  'Ohne Übernahme wird ein neuer Link erzeugt');

-- ---------------------------------------------------------------- Aufstellung
:als_mf1
select throws_like(format($$select public.aufstellung_speichern(%L, array[%L,%L]::uuid[])$$, :t1, :s11, :s12),
  '%genau 6%', 'Falsche Anzahl wird abgelehnt');
select throws_like(format($$select public.aufstellung_speichern(%L, array[%L,%L,%L,%L,%L,%L]::uuid[])$$,
  :t1, :s11, :s12, :s13, :s14, :s15, :s21),
  '%gehört nicht zur Mannschaft%', 'Fremder Spieler in Aufstellung wird abgelehnt');
select lives_ok(format($$select public.aufstellung_speichern(%L, array[%L,%L,%L,%L,%L]::uuid[], %L, 1)$$,
  :t1, :s11, :s12, :s13, :s14, :s15, :m3),
  'Aufstellung mit 5 Spielern + 1 Ersatz');
select lives_ok(format($$select public.aufstellung_speichern(%L, array[%L,%L,%L,%L,%L,%L]::uuid[])$$,
  :t1, :s11, :s12, :s13, :s14, :s15, :s16),
  'Aufstellung kann ersetzt werden');
:als_postgres
select is((select count(*)::int from public.aufstellungen where spieltermin_id = :t1), 6, 'Genau 6 Einträge nach Ersetzen');

select * from finish();
rollback;
