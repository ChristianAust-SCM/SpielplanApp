-- Übergangsphase (Migrationen 01–04, vor 09): das BISHERIGE spieler.html und
-- helfer.html funktionieren weiter, sehen aber deutlich weniger Daten.
-- Die Abfragen entsprechen den PostgREST-Aufrufen des alten Frontends.
begin;
select plan(12);

:als_anon
-- spieler.html: spieltermine select('*, mannschaften(id, name, liga)').eq('abfrage_token', token)
select is((select st.gegner from public.spieltermine st join public.mannschaften m on m.id = st.mannschaft_id
            where st.abfrage_token = :tok_t1), 'TSV Testhausen', 'Alt: Termin über Token lesbar');
select is((select m.name from public.mannschaften m where m.id = :m1), '1. Mannschaft', 'Alt: Mannschaftsname lesbar');
-- spieler select('id, name').eq('mannschaft_id').eq('aktiv', true)
select is((select count(*)::int from (select id, name from public.spieler where mannschaft_id = :m1 and aktiv) x), 6,
  'Alt: Spielerliste lesbar');
-- upsert in verfuegbarkeiten (wie PostgREST on_conflict)
select lives_ok(format($$insert into public.verfuegbarkeiten (spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung)
  values (%L, null, %L, 'Ja', 'alt') on conflict (spieltermin_id, alternativtermin_id, spieler_id)
  do update set spieltermin_id = excluded.spieltermin_id, alternativtermin_id = excluded.alternativtermin_id,
                spieler_id = excluded.spieler_id, antwort = excluded.antwort, anmerkung = excluded.anmerkung$$, :t1, :s12),
  'Alt: Upsert einer Antwort funktioniert');
select lives_ok(format($$insert into public.spieler (mannschaft_id, name, aktiv) values (%L, 'Alt Nachmeldung', true)$$, :m1),
  'Alt: Nachmeldung funktioniert');
select lives_ok($$insert into public.turnier_helfer (name, einsatz, anmerkung) values ('Alt Helfer', 'beides', null)$$,
  'Alt: Helfer-Eintragung funktioniert');

-- Neu verweigert
select throws_ok($$select ttr from public.spieler$$, '42501', null, 'anon liest keine TTR-Werte mehr');
select throws_ok($$select spieler_token from public.spieler$$, '42501', null, 'anon liest keine Spielertokens');
select throws_ok($$select mf_email from public.mannschaften$$, '42501', null, 'anon liest keine MF-E-Mails');
select throws_ok($$select * from public.aufstellungen$$, '42501', null, 'anon liest keine Aufstellungen');
select throws_ok($$select * from public.turnier_helfer$$, '42501', null, 'anon liest keine Helferliste');
select throws_like(format($$insert into public.verfuegbarkeiten (spieltermin_id, spieler_id, antwort) values (%L, %L, 'Ja')$$, :t1, :s21),
  '%gehört nicht zur Mannschaft%', 'Alt: Antwort für fremden Spieler wird serverseitig abgelehnt');

:als_postgres
select * from finish();
rollback;
