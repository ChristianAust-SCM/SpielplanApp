-- ============================================================================
-- Nachprüfung nach Migrationen 02–05 (bzw. 09) – AUSSCHLIESSLICH LESEND
-- ============================================================================
-- Nur Strukturdaten und Zählwerte. Vor und nach der Anwendung ausführen und
-- vergleichen. Sollwerte stehen jeweils im Kommentar.
-- ============================================================================
begin transaction read only;
set local statement_timeout = '15s';

-- 1. Serverfunktionen und ihre Ausführungsrechte
--    Soll: anon darf abfrage_laden/abfrage_antworten/abfrage_nachmelden/helfer_eintragen/
--    oeffentlicher_spielplan; alles andere nur authenticated
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '')            as config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('abfrage_laden','abfrage_antworten','abfrage_nachmelden','helfer_eintragen',
                     'oeffentlicher_spielplan','abfrage_link_erzeugen','abfrage_link_widerrufen',
                     'abfrage_links_liste','abfrage_token_erneuern','verschiebung_abschliessen',
                     'aufstellung_speichern','termine_importieren')
 order by 1;

-- 2. Neue Objekte (Soll: private.einstellungen, private.abfrage_links; Spalten saison, nachgemeldet_am)
select to_regclass('private.einstellungen') as einstellungen, to_regclass('private.abfrage_links') as abfrage_links;
select table_name, column_name, is_generated from information_schema.columns
 where table_schema = 'public' and column_name in ('saison','nachgemeldet_am','min_spieler') order by 1, 2;

-- 3. Policies je Tabelle (Soll: SR-Tabellen unverändert 19)
select tablename, count(*) as policies from pg_policies where schemaname = 'public'
 group by tablename order by 1;
select count(*) filter (where tablename like 'sr\_%') as policies_sr from pg_policies where schemaname = 'public';

-- 4. anon-Tabellenrechte der Spielplan-Tabellen (nach 03: nur Spalten des Altpfads; nach 09: keine
--    außer vereinsbefragung INSERT)
select c.relname, string_agg(distinct a.privilege_type, ',' order by a.privilege_type) as anon_rechte
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
 where n.nspname = 'public' and a.grantee = 'anon'::regrole
   and c.relname in ('vereine','mannschaften','spieler','spieltermine','alternativtermine',
                     'verfuegbarkeiten','nutzer_rollen','aufstellungen','turnier_helfer','vereinsbefragung')
 group by 1 order by 1;
select 'spieler.ttr' as spalte, has_column_privilege('anon', 'public.spieler', 'ttr', 'SELECT') as anon_lesbar
union all select 'spieler.spieler_token', has_column_privilege('anon', 'public.spieler', 'spieler_token', 'SELECT')
union all select 'mannschaften.mf_email', has_column_privilege('anon', 'public.mannschaften', 'mf_email', 'SELECT');

-- 5. Trigger auf Spielplan-Tabellen (Soll nach 02: Token-, MF-Änderungs- und Integritätstrigger)
select event_object_table, trigger_name, string_agg(event_manipulation, ',' order by event_manipulation) as ereignisse
  from information_schema.triggers where event_object_schema = 'public'
 group by 1, 2 order by 1, 2;

-- 6. Datenbestand unverändert (Soll: identisch zu vorher; Migrationen ändern keine Daten außer
--    Mindeststärken, die produktiv bereits 6/6/4 sind)
select 'spielplan' as bereich, sum(n) as zeilen from (
  select count(*) n from public.vereine union all select count(*) from public.mannschaften
  union all select count(*) from public.spieler union all select count(*) from public.spieltermine
  union all select count(*) from public.alternativtermine union all select count(*) from public.verfuegbarkeiten
  union all select count(*) from public.nutzer_rollen union all select count(*) from public.aufstellungen
  union all select count(*) from public.turnier_helfer union all select count(*) from public.vereinsbefragung) x;
select name, min_spieler from public.mannschaften order by 1;

-- 7. Bestehende Links gültig (Soll: 0 Termine ohne Token, 0 ungültige Formate)
select count(*) filter (where abfrage_token is null) as ohne_token,
       count(*) filter (where abfrage_token !~ '^[A-Za-z0-9_-]{16,128}$') as ungueltig
  from public.spieltermine;

rollback;
