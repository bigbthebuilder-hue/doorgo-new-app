-- Compatibility-only rollback. For the coordinated Phase 1 rollback, run
-- this before restoring the pre-permissions function definitions and grants.
BEGIN;
DO $$
DECLARE
  entry record;
  definition text;
BEGIN
  FOR entry IN
    SELECT * FROM (VALUES
      ('public.dg_staff_away_write_location(uuid,uuid)'::regprocedure,
       'v_location text := public.dg_staff_away_legacy_roster_key(public.dg_staff_away_scope(true));',
       'v_location text := public.dg_staff_away_scope(true);'),
      ('public.load_calendar_staff_away_range(date,date)'::regprocedure,
       'SELECT public.dg_staff_away_legacy_roster_key(COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''''),''default'')) INTO v_location',
       'SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''''),''default'') INTO v_location')
    ) AS changes(target, old_text, new_text)
  LOOP
    definition := pg_catalog.pg_get_functiondef(entry.target);
    IF (length(definition) - length(replace(definition, entry.old_text, ''))) <> length(entry.old_text) THEN
      RAISE EXCEPTION 'staff_away.compatibility_rollback_definition_drift: %', entry.target;
    END IF;
    EXECUTE replace(definition, entry.old_text, entry.new_text);
  END LOOP;
END $$;
DROP FUNCTION public.dg_staff_away_legacy_roster_key(text);
COMMIT;
