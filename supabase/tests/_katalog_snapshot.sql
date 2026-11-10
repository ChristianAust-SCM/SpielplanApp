-- Normalisierter Katalogauszug (Rechte, Policies, Trigger, Funktionen, Schemas)
-- für Vorher/Nachher-Vergleiche in der Testumgebung. Liest nur Katalogdaten.
-- Aufruf mit psql -v bereich=alle|sr  (sr = nur Objekte außerhalb der
-- Spielplan-Tabellen, z. B. SR-Anwendung)
\pset format unaligned
\pset tuples_only on
with app(t) as (values ('vereine'),('mannschaften'),('spieler'),('spieltermine'),
  ('alternativtermine'),('verfuegbarkeiten'),('nutzer_rollen'),('aufstellungen'),
  ('turnier_helfer'),('vereinsbefragung')),
zeilen as (
  select 'acl' art, c.relname obj,
         coalesce((select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
                                     || ':' || a.privilege_type, ','
                                     order by case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type)
                     from aclexplode(c.relacl) a), '') inhalt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m')
  union all
  select 'rls', c.relname, c.relrowsecurity::text || '/' || c.relforcerowsecurity::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'pol', tablename || ':' || policyname,
         permissive || '|' || cmd || '|' || roles::text || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')
    from pg_policies where schemaname = 'public'
  union all
  select 'trg', c.relname || ':' || t.tgname, pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'fn', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
         coalesce((select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
                                     || ':' || a.privilege_type, ','
                                     order by case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type)
                     from aclexplode(p.proacl) a), 'default') || '|' || md5(p.prosrc)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','private')
  union all
  select 'nsp', nspname, coalesce(nspacl::text, '') from pg_namespace where nspname in ('public','private')
)
select art || ' ' || obj || ' = ' || inhalt
  from zeilen
 where :'bereich' = 'alle'
    or (art in ('acl','rls') and obj not in (select t from app))
    or (art = 'pol' and split_part(obj, ':', 1) not in (select t from app))
    or (art = 'trg' and split_part(obj, ':', 1) not in (select t from app))
    or (art = 'fn' and obj like 'public.%')
 order by 1;
