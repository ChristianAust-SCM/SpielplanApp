-- ============================================================================
-- Spielerabfrage ohne Login: Serverfunktion als anon mit ECHTEN Links prüfen
-- AUSSCHLIESSLICH LESEND (abfrage_laden ist STABLE). Gibt nur Zählwerte aus,
-- keine Tokens, Namen oder Inhalte. Vor und nach Migration 09 ausführen.
-- Soll: fehler = 0, ok = geprueft (bis zu 5 kommende Termine + 5 Alternativtermine)
-- ============================================================================
begin transaction read only;
set local statement_timeout = '15s';

do $$
declare
  t text; ok int := 0; fehler int := 0; geprueft int := 0;
  liste text[];
begin
  select array_agg(tok) into liste from (
    (select abfrage_token as tok from public.spieltermine
      where abfrage_token is not null and datum >= current_date order by datum limit 5)
    union all
    (select a.abfrage_token from public.alternativtermine a join public.spieltermine s on s.id = a.spieltermin_id
      where a.abfrage_token is not null and s.datum >= current_date order by a.datum limit 5)) x;
  foreach t in array coalesce(liste, '{}') loop
    geprueft := geprueft + 1;
    begin
      perform set_config('role', 'anon', true);
      if public.abfrage_laden(t) is null then fehler := fehler + 1; else ok := ok + 1; end if;
      perform set_config('role', 'postgres', true);
    exception when others then
      fehler := fehler + 1;
      perform set_config('role', 'postgres', true);
    end;
  end loop;
  raise notice 'RPC_ANON geprueft=% ok=% fehler=%', geprueft, ok, fehler;
end $$;

-- anon darf die Funktion ausführen, aber keine Spielplan-Tabelle direkt lesen (nach 09: f)
select has_function_privilege('anon', 'public.abfrage_laden(text)', 'execute')     as anon_rpc,
       has_table_privilege('anon', 'public.spieltermine', 'select')                as anon_tabelle_spieltermine,
       has_table_privilege('anon', 'public.verfuegbarkeiten', 'select')            as anon_tabelle_verfuegbarkeiten;

rollback;
