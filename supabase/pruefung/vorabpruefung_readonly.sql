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

-- 10. Speziell Migration 01 ------------------------------------------------
-- 10a. Aktuelle Policies auf nutzer_rollen (Soll laut Audit: genau
--      "Admins verwalten Rollen" + "Eigene Rollen lesen"; Abweichung = Drift)
select policyname, cmd, roles::text, qual, with_check
  from pg_policies where schemaname = 'public' and tablename = 'nutzer_rollen' order by 1;

-- 10b. Eigentümer und RLS-Flags (Soll: Owner postgres, RLS an, nicht FORCE)
select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'nutzer_rollen';

-- 10c. Ausführende Rolle (Migration läuft als diese Rolle; Soll: postgres)
select current_user, r.rolbypassrls, r.rolsuper
  from pg_roles r where r.rolname = current_user;

-- 10d. Policies anderer Tabellen, die nutzer_rollen verwenden (Soll: nur
--      aufstellungen, nur Rolle authenticated – anon verliert den Zugriff)
select tablename, policyname, roles::text
  from pg_policies
 where schemaname = 'public' and tablename <> 'nutzer_rollen'
   and (coalesce(qual,'') like '%nutzer_rollen%' or coalesce(with_check,'') like '%nutzer_rollen%')
 order by 1, 2;

-- 10e. Funktionen/Views außerhalb der Plattformschemas, die nutzer_rollen
--      referenzieren (Soll: keine – sonst eigener Schreibweg an RLS vorbei)
select n.nspname, p.proname, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime','vault',
                         'extensions','graphql','graphql_public','pgbouncer','supabase_functions')
   and p.prosrc like '%nutzer_rollen%';
select schemaname, viewname from pg_views
 where definition like '%nutzer_rollen%' and schemaname not in ('pg_catalog','information_schema');

-- 10f. Anzahl verschiedener Admin-Konten (Soll: >= 1; letzter-Admin-Schutz)
--      und Rollen, deren Konto nicht mehr existiert (nur Anzahl)
select count(distinct user_id) filter (where rolle = 'admin') as admin_konten,
       count(distinct user_id) filter (where rolle = 'mf')    as mf_konten,
       count(*) filter (where user_id is null)                as rollen_ohne_konto
  from public.nutzer_rollen;

-- 10g. Rollen, die seit dem Audit (09.11.2026 11:56 UTC+1) angelegt wurden
--      (Hinweis auf mögliche Selbstvergabe; nur Anzahl je Rolle)
select rolle, count(*) as neu_seit_audit
  from public.nutzer_rollen where created_at > timestamptz '2026-11-09 10:56:00+00'
 group by rolle;

-- 11. Plausibilität der Rollenzuordnungen – PSEUDONYMISIERT -----------------
-- Keine Namen, keine E-Mails, keine IDs. "konto" ist ein 6-stelliges
-- Pseudonym (Hash), nur um Zeilen desselben Kontos zu gruppieren.
-- Mannschaftsnamen sind Vereinsdaten, keine Personendaten.
select row_number() over (order by m.name nulls last, nr.rolle) as nr,
       left(md5(nr.user_id::text || 'spielplan-vorab'), 6)       as konto,
       nr.rolle,
       m.name                                                    as mannschaft,
       (u.id is not null)                                        as konto_existiert,
       (u.email_confirmed_at is not null)                        as email_bestaetigt,
       (u.last_sign_in_at)::date                                 as letzte_anmeldung,
       (nr.created_at)::date                                     as rolle_angelegt,
       (lower(u.email) = lower(m.mf_email))                      as email_passt_zu_mf_eintrag,
       (count(*) over (partition by nr.user_id))::int            as rollen_des_kontos
  from public.nutzer_rollen nr
  left join public.mannschaften m on m.id = nr.mannschaft_id
  left join auth.users u          on u.id = nr.user_id
 order by 1;

-- 11b. Mannschaften (für Mindeststärken): je Mannschaft Anzahl MF-/Admin-Rollen
select m.name, m.liga,
       count(nr.id) filter (where nr.rolle = 'mf')    as mf_rollen,
       count(nr.id) filter (where nr.rolle = 'admin') as admin_rollen
  from public.mannschaften m left join public.nutzer_rollen nr on nr.mannschaft_id = m.id
 group by m.id, m.name, m.liga order by m.name;

-- 11c. Konten ohne jede Rolle (nur Anzahl)
select count(*) as konten_ohne_rolle
  from auth.users u where not exists (select 1 from public.nutzer_rollen nr where nr.user_id = u.id);

rollback;
