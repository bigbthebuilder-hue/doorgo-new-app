BEGIN;

-- Single-shop compatibility for Staff Away only. Keep the hosted roster key
-- and the account's stored profile label. This is not a location registry.
CREATE FUNCTION public.dg_staff_away_legacy_roster_key(p_location text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT CASE p_location
    WHEN 'Central Door & Window' THEN 'default'
    WHEN 'Central Door' THEN 'default'
    ELSE p_location
  END;
$$;
ALTER FUNCTION public.dg_staff_away_legacy_roster_key(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_staff_away_legacy_roster_key(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Patch only the effective scheduler scope and editor roster assignment.
-- Existing business/Calendar gates, company-wide period query, location-based
-- mutation checks, owner and ACL remain in place. Abort if either body drifted.
DO $$
DECLARE
  entry record;
  definition text;
BEGIN
  FOR entry IN
    SELECT * FROM (VALUES
      ('public.dg_staff_away_write_location(uuid,uuid)'::regprocedure,
       'v_location text := public.dg_staff_away_scope(true);',
       'v_location text := public.dg_staff_away_legacy_roster_key(public.dg_staff_away_scope(true));'),
      ('public.load_calendar_staff_away_range(date,date)'::regprocedure,
       'SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''''),''default'') INTO v_location',
       'SELECT public.dg_staff_away_legacy_roster_key(COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''''),''default'')) INTO v_location')
    ) AS changes(target, old_text, new_text)
  LOOP
    definition := pg_catalog.pg_get_functiondef(entry.target);
    IF (length(definition) - length(replace(definition, entry.old_text, ''))) <> length(entry.old_text) THEN
      RAISE EXCEPTION 'staff_away.compatibility_definition_drift: %', entry.target;
    END IF;
    EXECUTE replace(definition, entry.old_text, entry.new_text);
  END LOOP;
END $$;

COMMIT;
