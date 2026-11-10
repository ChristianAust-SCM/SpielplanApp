-- Spielerlinks ohne Login: serverseitig geprüfte Token-RPCs
-- (läuft vor UND nach Migration 09 – muss in beiden Zuständen gelten)
begin;
select plan(39);

-- ---------------------------------------------------------------- Laden
:als_anon
select is((public.abfrage_laden(:tok_t1))->'termin'->>'gegner', 'TSV Testhausen', 'Alter Spieltagslink lädt Termin');
select is(jsonb_array_length((public.abfrage_laden(:tok_t1))->'spieler'), 6, 'Nur aktive Spieler der eigenen Mannschaft');
select ok((public.abfrage_laden(:tok_t1))::text !~* '(spielertoken|ttr|vertrauliche|@test\.invalid|abfrage_token|Omega)',
  'Antwort enthält keine Tokens, TTR, E-Mails, Anmerkungen oder fremden Spieler');
select is((public.abfrage_laden(:tok_t1))->>'persoenlich', 'false', 'Alter Link ist ein gemeinsamer Link');
select throws_like($$select public.abfrage_laden('gibtesnicht-0000000000000000')$$,
  '%ungültig oder abgelaufen%', 'Unbekanntes Token wird abgelehnt');
select throws_like($$select public.abfrage_laden($t$' or 1=1 --$t$)$$,
  '%ungültig oder abgelaufen%', 'Manipuliertes Token wird abgelehnt');
select throws_like($$select public.abfrage_laden(null)$$, '%ungültig oder abgelaufen%', 'Leeres Token wird abgelehnt');
select isnt((public.abfrage_laden(:tok_a1))->'alternativtermin', 'null'::jsonb, 'Alternativtermin-Link lädt Ausweichtermin');

-- ---------------------------------------------------------------- Antworten
select lives_ok(format($$select public.abfrage_antworten(%L, %L, 'Ja', 'erst ab 15 Uhr')$$, :tok_t1, :s13),
  'Berechtigte Antwort über gemeinsamen Link');
select lives_ok(format($$select public.abfrage_antworten(%L, %L, 'Nein', null)$$, :tok_t1, :s13),
  'Antwort kann geändert werden');
select lives_ok(format($$select public.abfrage_antworten(%L, %L, 'Vielleicht', null)$$, :tok_a1, :s13),
  'Antwort für Alternativtermin');
select throws_like(format($$select public.abfrage_antworten(%L, %L, 'Ja', null)$$, :tok_t1, :s21),
  '%gehört nicht zur Mannschaft%', 'Spieler einer anderen Mannschaft wird abgelehnt');
select throws_like(format($$select public.abfrage_antworten(%L, %L, 'Ja', null)$$, :tok_t1, :s17),
  '%gehört nicht zur Mannschaft%', 'Inaktiver Spieler wird abgelehnt');
select throws_like(format($$select public.abfrage_antworten(%L, %L, 'Bedingt', null)$$, :tok_t1, :s13),
  'Ungültige Antwort.', 'Ungültiger Antwortwert wird abgelehnt');
select throws_like(format($$select public.abfrage_antworten(%L, %L, 'Ja', repeat('x', 501))$$, :tok_t1, :s13),
  '%zu lang%', 'Zu lange Anmerkung wird abgelehnt');
select throws_like(format($$select public.abfrage_antworten(%L, %L, 'Ja', null)$$, :tok_t2, :s13),
  '%gehört nicht zur Mannschaft%', 'Token eines anderen Termins erlaubt keine Antwort für diese Mannschaft');

:als_postgres
select is((select count(*)::int from public.verfuegbarkeiten
            where spieler_id = :s13 and spieltermin_id = :t1 and alternativtermin_id is null), 1,
  'Keine Dublette bei wiederholter Antwort (alternativtermin_id NULL)');
select is((select antwort from public.verfuegbarkeiten
            where spieler_id = :s13 and spieltermin_id = :t1 and alternativtermin_id is null), 'Nein',
  'Letzte Antwort gilt');
select is((select count(*)::int from public.verfuegbarkeiten where spieler_id = :s13 and spieltermin_id = :t1), 2,
  'Haupt- und Alternativtermin-Antwort getrennt gespeichert');
select is((select antwort from public.verfuegbarkeiten where spieler_id = :s21), 'Ja', 'Fremde Antwort unverändert');

-- ---------------------------------------------------------------- Persönliche Links
:als_mf1
select l->>'token' as ptok from (select public.abfrage_link_erzeugen(:t1, null, :s14) l) x \gset
select l->>'token' as ptok15, l->>'link_id' as plink15 from (select public.abfrage_link_erzeugen(:t1, null, :s15) l) x \gset
select (public.abfrage_link_erzeugen(:t1))->>'token' as gtok \gset
select is(length(:'ptok'), 64, 'Neues Token hat 64 Zeichen (244 Zufallsbits)');
select throws_like(format($$select public.abfrage_link_erzeugen(%L, null, %L)$$, :t1, :s21),
  '%gehört nicht zur Mannschaft%', 'Persönlicher Link nur für eigene Spieler');

:als_anon
select is(jsonb_array_length((public.abfrage_laden(:'ptok'))->'spieler'), 1, 'Persönlicher Link zeigt nur eigenen Spieler');
select throws_like(format($$select public.abfrage_antworten(%L, %L, 'Ja', null)$$, :'ptok', :s15),
  '%nur die eigene Antwort%', 'Persönlicher Link kann keine fremde Antwort ändern');
select lives_ok(format($$select public.abfrage_antworten(%L, %L, 'Ja', 'gern')$$, :'ptok', :s14),
  'Persönlicher Link: eigene Antwort');
select is((public.abfrage_laden(:'ptok'))->'eigene_antwort'->>'antwort', 'Ja', 'Persönlicher Link zeigt eigene Antwort');
select throws_like(format($$select public.abfrage_nachmelden(%L, 'Neu, Nina', 'Ja')$$, :'ptok'),
  '%Nachmeldungen sind über diesen Link nicht möglich%', 'Keine Nachmeldung über persönlichen Link');

-- Widerruf
:als_mf1
select ok(public.abfrage_link_widerrufen(:'plink15'::uuid), 'MF widerruft Link');
:als_anon
select throws_like(format($$select public.abfrage_laden(%L)$$, :'ptok15'),
  '%ungültig oder abgelaufen%', 'Widerrufener Link wird abgelehnt');

-- Ablauf
:als_postgres
update private.abfrage_links set gueltig_bis = now() - interval '1 minute'
 where token_hash = private.token_hash(:'ptok');
:als_anon
select throws_like(format($$select public.abfrage_laden(%L)$$, :'ptok'),
  '%ungültig oder abgelaufen%', 'Abgelaufener Link wird abgelehnt');

-- Altpfad abschalten: alter Link abgelehnt, neuer gemeinsamer Link funktioniert
:als_postgres
update private.einstellungen set wert = 'false' where schluessel = 'legacy_links_erlaubt';
:als_anon
select throws_like(format($$select public.abfrage_laden(%L)$$, :tok_t1),
  '%ungültig oder abgelaufen%', 'Alter Link wird nach Abschaltung des Altpfads abgelehnt');
select is((public.abfrage_laden(:'gtok'))->'termin'->>'gegner', 'TSV Testhausen', 'Neuer gemeinsamer Link funktioniert');
:als_postgres
update private.einstellungen set wert = 'true' where schluessel = 'legacy_links_erlaubt';

-- ---------------------------------------------------------------- Nachmeldung
:als_anon
select lives_ok(format($$select public.abfrage_nachmelden(%L, 'Neu, Nina', 'Ja', null)$$, :tok_t1),
  'Nachmeldung über gemeinsamen Link');
select throws_like(format($$select public.abfrage_nachmelden(%L, 'alpha, anna', 'Ja', null)$$, :tok_t1),
  '%steht bereits in der Liste%', 'Nachmeldung mit vorhandenem Namen abgelehnt');
select throws_like(format($$select public.abfrage_nachmelden(%L, '<img src=x onerror=alert(1)>', 'Ja', null)$$, :tok_t1),
  '%gültigen Namen%', 'HTML im Namen wird abgelehnt');

-- ---------------------------------------------------------------- Rechte
select throws_ok(format($$select public.abfrage_link_erzeugen(%L)$$, :t1), '42501', null,
  'anon darf keine Links erzeugen');
select throws_ok(format($$select public.verschiebung_abschliessen(%L, current_date)$$, :t1), '42501', null,
  'anon darf keine Verschiebung abschließen');
select lives_ok($$select public.helfer_eintragen('Hanna Hilfreich', 'turnier', null)$$, 'Helfer-Eintragung');
select throws_like($$select public.helfer_eintragen('Hanna Hilfreich', 'alles', null)$$,
  '%Einsatzbereich%', 'Ungültiger Einsatzbereich abgelehnt');

:als_postgres
select * from finish();
rollback;
