-- ============================================================================
-- Vorabprüfung vor Anwendung der Migrationen – AUSSCHLIESSLICH LESEND
-- ============================================================================
-- Ausführung NUR nach ausdrücklicher Freigabe durch Christian, z. B. über den
-- bestehenden Read-only-Auditzugang. Liefert nur Strukturdaten und
-- aggregierte Zahlen – keine Namen, Anmerkungen, Tokens oder E-Mails.
-- ============================================================================
begin transaction read only;
set local statement_timeout = '15s';

-- 1. Tatsächliche Spalten der App-Tabellen (Abgleich mit Baseline)
select table_name, column_name, data_type, is_nullable, column_default is not null as hat_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('vereine','mannschaften','spieler','spieltermine','alternativtermine',
                      'verfuegbarkeiten','nutzer_rollen','aufstellungen','turnier_helfer','vereinsbefragung')
 order by table_name, ordinal_position;

-- 2. Namenskonflikte: existieren Objekte, die die Migrationen anlegen?
select n.nspname, p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'public' and p.proname in ('abfrage_laden','abfrage_antworten','abfrage_nachmelden',
          'helfer_eintragen','oeffentlicher_spielplan','abfrage_link_erzeugen','abfrage_link_widerrufen',
          'abfrage_links_liste','abfrage_token_erneuern','verschiebung_abschliessen','aufstellung_speichern',
          'termine_importieren'))
    or n.nspname = 'private';
select nspname from pg_namespace where nspname = 'private';

-- 3. Doppelte Alternativtermine (würden Migration 02 abbrechen)
select count(*) as doppelte_alternativtermine from (
  select spieltermin_id, datum, uhrzeit from public.alternativtermine
   group by 1, 2, 3 having count(*) > 1) x;

-- 4. Verfügbarkeiten mit Spieler aus anderer Mannschaft (Altlasten, nur Anzahl)
select count(*) as fremde_spieler_antworten
  from public.verfuegbarkeiten v
  join public.spieler s on s.id = v.spieler_id
  join public.spieltermine st on st.id = v.spieltermin_id
 where s.mannschaft_id <> st.mannschaft_id;

-- 5. Alternativtermin-Antworten mit falschem Spieltermin (nur Anzahl)
select count(*) as inkonsistente_alt_antworten
  from public.verfuegbarkeiten v join public.alternativtermine a on a.id = v.alternativtermin_id
 where a.spieltermin_id <> v.spieltermin_id;

-- 6. Rollen: Anzahl Admins / MF (letzter-Admin-Schutz), Rollen ohne Mannschaft
select rolle, count(*) as anzahl, count(*) filter (where mannschaft_id is null) as ohne_mannschaft
  from public.nutzer_rollen group by rolle;

-- 7. Tokenformate (Migration akzeptiert [A-Za-z0-9_-]{16,128})
select 'spieltermine' as tabelle, count(*) filter (where abfrage_token !~ '^[A-Za-z0-9_-]{16,128}$') as ungueltige_tokens
  from public.spieltermine
union all
select 'alternativtermine', count(*) filter (where abfrage_token !~ '^[A-Za-z0-9_-]{16,128}$')
  from public.alternativtermine;

-- 8. Mannschaftsstärken (falls Spalte existiert – sonst Fehler, dann entfällt Abfrage)
-- select name, min_spieler from public.mannschaften order by name;

-- 9. Trigger auf App-Tabellen (Konflikte mit neuen Triggern)
select event_object_table, trigger_name from information_schema.triggers
 where event_object_schema = 'public'
   and event_object_table in ('spieltermine','alternativtermine','verfuegbarkeiten','nutzer_rollen');

rollback;
