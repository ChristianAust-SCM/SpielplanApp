-- ============================================================================
-- Migration 04 · Rückrunde: serverseitig geprüfter Terminimport (CSV-Vorschau)
-- Status: VORBEREITET, NICHT ANGEWENDET (Freigabe durch Christian erforderlich)
-- Voraussetzung: Migrationen 01–03
-- ============================================================================
-- public.termine_importieren(zeilen, speichern):
--   * nur Administratoren
--   * speichern = false → reine Prüfung/Vorschau, schreibt nichts
--   * speichern = true  → alle Zeilen in EINER Transaktion, nur wenn fehlerfrei
--   * prüft Datum, Uhrzeit, Mannschaft, Gegner, Heim/Auswärts, Halbrunde,
--     Dubletten in der Datei und gegen vorhandene Termine
-- Bestehende Termine und Antworten werden nie verändert.
-- ============================================================================

begin;

create or replace function public.termine_importieren(p_zeilen jsonb, p_speichern boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  z record;
  f text[];
  w text[];
  v_m uuid; v_datum date; v_uhr time; v_heim boolean; v_gegner text; v_ort text;
  v_halb text; v_nr int;
  fehler jsonb := '[]'::jsonb;
  warnungen jsonb := '[]'::jsonb;
  gueltig jsonb := '[]'::jsonb;
  schluessel text[] := '{}';
  k text;
  n_gespeichert int := 0;
begin
  if not private.ist_admin() then
    perform private.fehler('Nur Administratoren können Termine importieren.');
  end if;
  if p_zeilen is null or jsonb_typeof(p_zeilen) <> 'array' then
    perform private.fehler('Ungültiges Importformat.');
  end if;
  if jsonb_array_length(p_zeilen) = 0 then
    perform private.fehler('Die Importdatei enthält keine Termine.');
  end if;
  if jsonb_array_length(p_zeilen) > 300 then
    perform private.fehler('Zu viele Zeilen (max. 300 je Import).');
  end if;

  for z in select e.value as j, e.ordinality::int as nr from jsonb_array_elements(p_zeilen) with ordinality e loop
    f := '{}'; w := '{}';
    v_m := null; v_datum := null; v_uhr := null; v_heim := null; v_nr := null;

    begin v_m := (z.j->>'mannschaft_id')::uuid; exception when others then v_m := null; end;
    if v_m is null or not exists (select 1 from public.mannschaften where id = v_m) then
      f := array_append(f, 'Unbekannte Mannschaft'::text);
    end if;

    begin v_datum := to_date(z.j->>'datum', 'YYYY-MM-DD');
      if to_char(v_datum, 'YYYY-MM-DD') <> z.j->>'datum' then v_datum := null; end if;
    exception when others then v_datum := null; end;
    if v_datum is null then
      f := array_append(f, 'Ungültiges Datum (erwartet JJJJ-MM-TT)'::text);
    elsif v_datum < date '2000-01-01' or v_datum > current_date + 730 then
      f := array_append(f, 'Datum außerhalb des zulässigen Bereichs'::text);
    elsif v_datum < current_date then
      w := array_append(w, 'Datum liegt in der Vergangenheit'::text);
    end if;

    if coalesce(z.j->>'uhrzeit', '') <> '' then
      if (z.j->>'uhrzeit') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        v_uhr := (z.j->>'uhrzeit')::time;
      else
        f := array_append(f, 'Ungültige Uhrzeit (erwartet HH:MM)'::text);
      end if;
    end if;

    if jsonb_typeof(z.j->'heim') = 'boolean' then
      v_heim := (z.j->>'heim')::boolean;
    else
      f := array_append(f, 'Heim/Auswärts fehlt'::text);
    end if;

    v_gegner := regexp_replace(btrim(coalesce(z.j->>'gegner', '')), '\s+', ' ', 'g');
    if char_length(v_gegner) < 2 or char_length(v_gegner) > 80 then
      f := array_append(f, 'Gegner fehlt oder ist zu lang (2–80 Zeichen)'::text);
    elsif v_gegner ~ '[<>]' then
      f := array_append(f, 'Gegner enthält unzulässige Zeichen'::text);
    end if;

    v_ort := nullif(btrim(coalesce(z.j->>'ort', '')), '');
    if v_ort is not null and (char_length(v_ort) > 120 or v_ort ~ '[<>]') then
      f := array_append(f, 'Ort ist zu lang oder enthält unzulässige Zeichen'::text);
    end if;

    v_halb := coalesce(nullif(z.j->>'halbrunde', ''), 'Rückrunde');
    if v_halb not in ('Vorrunde', 'Rückrunde') then
      f := array_append(f, 'Halbrunde muss Vorrunde oder Rückrunde sein'::text);
    end if;

    if coalesce(z.j->>'spieltag_nr', '') <> '' then
      if (z.j->>'spieltag_nr') ~ '^[0-9]{1,2}$' and (z.j->>'spieltag_nr')::int between 1 and 40 then
        v_nr := (z.j->>'spieltag_nr')::int;
      else
        f := array_append(f, 'Ungültige Spieltagsnummer'::text);
      end if;
    end if;

    if v_m is not null and v_datum is not null and char_length(v_gegner) >= 2 then
      k := v_m::text || '|' || v_datum::text || '|' || lower(v_gegner);
      if k = any (schluessel) then
        f := array_append(f, 'Doppelte Zeile in der Importdatei'::text);
      end if;
      schluessel := schluessel || k;
      if exists (select 1 from public.spieltermine st
                  where st.mannschaft_id = v_m and st.datum = v_datum and lower(st.gegner) = lower(v_gegner)) then
        f := array_append(f, 'Termin existiert bereits (Dublette)'::text);
      elsif exists (select 1 from public.spieltermine st where st.mannschaft_id = v_m and st.datum = v_datum) then
        w := array_append(w, 'Mannschaft hat an diesem Tag bereits einen anderen Termin'::text);
      end if;
    end if;

    if cardinality(f) > 0 then
      fehler := fehler || jsonb_build_object('zeile', z.nr, 'fehler', to_jsonb(f));
    else
      gueltig := gueltig || jsonb_build_object('mannschaft_id', v_m, 'datum', v_datum, 'uhrzeit', v_uhr,
        'heim', v_heim, 'gegner', v_gegner, 'ort', v_ort, 'halbrunde', v_halb, 'spieltag_nr', v_nr);
    end if;
    if cardinality(w) > 0 then
      warnungen := warnungen || jsonb_build_object('zeile', z.nr, 'warnungen', to_jsonb(w));
    end if;
  end loop;

  if p_speichern and jsonb_array_length(fehler) = 0 then
    insert into public.spieltermine (mannschaft_id, spieltag_nr, datum, uhrzeit, heim, gegner, ort, halbrunde, status)
    select (g->>'mannschaft_id')::uuid, (g->>'spieltag_nr')::int, (g->>'datum')::date, (g->>'uhrzeit')::time,
           (g->>'heim')::boolean, g->>'gegner', g->>'ort', g->>'halbrunde', 'Geplant'
      from jsonb_array_elements(gueltig) g;
    get diagnostics n_gespeichert = row_count;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(fehler) = 0,
    'zeilen', jsonb_array_length(p_zeilen),
    'gueltig', jsonb_array_length(gueltig),
    'gespeichert', n_gespeichert,
    'fehler', fehler,
    'warnungen', warnungen);
end $$;

revoke all on function public.termine_importieren(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.termine_importieren(jsonb, boolean) to authenticated;

commit;
