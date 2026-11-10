-- ============================================================================
-- Rechte-Check je Konto – AUSSCHLIESSLICH LESEND, PSEUDONYMISIERT
-- ============================================================================
-- Simuliert für jedes Konto mit Rolle die Sicht von PostgREST (SET LOCAL ROLE
-- authenticated + JWT-Claim) und zählt, was es sehen darf. Vor UND nach
-- Migration 01 ausführen und vergleichen.
--   Erwartung nach 01: Admin-Konten sehen alle Rollenzeilen, MF-Konten nur die
--   eigene; spieltermine/aufstellungen/verfuegbarkeiten unverändert zu vorher.
-- Ausgabe nur als NOTICE: Pseudonym (Hash), Rolle, Zählwerte. Keine Namen,
-- E-Mails oder IDs. Läuft in einer read-only-Transaktion und endet mit ROLLBACK.
-- ============================================================================
begin transaction read only;
set local statement_timeout = '15s';

do $$
declare
  k record;
  n_rollen int; n_termine int; n_aufst int; n_verf int; n_admin_sicht int;
begin
  for k in
    select user_id,
           left(md5(user_id::text || 'spielplan-vorab'), 6) as konto,
           string_agg(distinct rolle, '+' order by rolle) as rollen
      from public.nutzer_rollen group by user_id order by 2
  loop
    perform set_config('request.jwt.claim.sub', k.user_id::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', k.user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n_rollen  from public.nutzer_rollen;
    select count(*) into n_admin_sicht from public.nutzer_rollen where rolle = 'admin';
    select count(*) into n_termine from public.spieltermine;
    select count(*) into n_aufst   from public.aufstellungen;
    select count(*) into n_verf    from public.verfuegbarkeiten;
    execute 'reset role';
    raise notice 'RECHTE konto=% rollen=% sieht_rollen=% davon_admin=% termine=% aufstellungen=% verfuegbarkeiten=%',
      k.konto, k.rollen, n_rollen, n_admin_sicht, n_termine, n_aufst, n_verf;
  end loop;

  -- anon (Spielerlink-Pfad des bisherigen Frontends)
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n_termine from public.spieltermine;
  select count(*) into n_verf    from public.verfuegbarkeiten;
  execute 'reset role';
  raise notice 'RECHTE konto=anon termine=% verfuegbarkeiten=% nutzer_rollen_lesbar=%',
    n_termine, n_verf, has_table_privilege('anon', 'public.nutzer_rollen', 'SELECT');
end $$;

-- Statische Rechte (Soll nach 01 in Klammern)
select 'anon TRUNCATE verfuegbarkeiten (f)'          as pruefung, has_table_privilege('anon', 'public.verfuegbarkeiten', 'TRUNCATE') as wert
union all select 'authenticated TRUNCATE spieltermine (f)', has_table_privilege('authenticated', 'public.spieltermine', 'TRUNCATE')
union all select 'anon SELECT nutzer_rollen (f)',           has_table_privilege('anon', 'public.nutzer_rollen', 'SELECT')
union all select 'authenticated INSERT nutzer_rollen (t, RLS: nur Admin)', has_table_privilege('authenticated', 'public.nutzer_rollen', 'INSERT')
union all select 'anon INSERT verfuegbarkeiten (t, unverändert)',          has_table_privilege('anon', 'public.verfuegbarkeiten', 'INSERT');

select policyname, cmd, roles::text from pg_policies
 where schemaname = 'public' and tablename = 'nutzer_rollen' order by 1;
select count(*) as policies_public_gesamt from pg_policies where schemaname = 'public';
select count(*) filter (where tablename like 'sr\_%') as policies_sr from pg_policies where schemaname = 'public';
select tgname from pg_trigger where tgrelid = 'public.nutzer_rollen'::regclass and not tgisinternal;

rollback;
