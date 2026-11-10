-- Nach Migration 09: kein anonymer Tabellenzugriff mehr, RPCs funktionieren
begin;
select plan(13);

:als_anon
select throws_ok($$select id from public.spieltermine$$,      '42501', null, 'anon: kein Zugriff auf spieltermine');
select throws_ok($$select id from public.alternativtermine$$, '42501', null, 'anon: kein Zugriff auf alternativtermine');
select throws_ok($$select id from public.spieler$$,           '42501', null, 'anon: kein Zugriff auf spieler');
select throws_ok($$select id from public.mannschaften$$,      '42501', null, 'anon: kein Zugriff auf mannschaften');
select throws_ok($$select id from public.vereine$$,           '42501', null, 'anon: kein Zugriff auf vereine');
select throws_ok($$select id from public.verfuegbarkeiten$$,  '42501', null, 'anon: kein Zugriff auf verfuegbarkeiten');
select throws_ok($$select id from public.aufstellungen$$,     '42501', null, 'anon: kein Zugriff auf aufstellungen');
select throws_ok($$select id from public.nutzer_rollen$$,     '42501', null, 'anon: kein Zugriff auf nutzer_rollen');
select throws_ok(format($$insert into public.verfuegbarkeiten (spieltermin_id, spieler_id, antwort) values (%L, %L, 'Ja')$$, :t1, :s12),
  '42501', null, 'anon: kein direktes Schreiben von Antworten');
select throws_ok($$select * from private.abfrage_links$$, '42501', null, 'anon: kein Zugriff auf private Linktabelle');

select is((public.abfrage_laden(:tok_t1))->'termin'->>'gegner', 'TSV Testhausen', 'Bisheriger Link funktioniert über RPC');
select lives_ok(format($$select public.abfrage_antworten(%L, %L, 'Ja', null)$$, :tok_t1, :s12),
  'Antwort über RPC funktioniert');
select ok((select count(*) from public.oeffentlicher_spielplan()) >= 3, 'Öffentlicher Spielplan ohne Login lesbar');

:als_postgres
select * from finish();
rollback;
