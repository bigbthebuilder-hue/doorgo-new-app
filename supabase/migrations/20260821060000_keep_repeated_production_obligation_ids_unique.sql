-- Scope native synchronization-created booking IDs to each obligation instance.
BEGIN;

DO $migration$
DECLARE v_definition text;v_original text:='''native-''||NEW.internal_job_id::text';v_replacement text:='''native-''||extensions.gen_random_uuid()::text';
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.sync_native_job_calendar_obligations()'::regprocedure) INTO v_definition;
  IF pg_catalog.strpos(v_definition,v_original)=0 THEN RAISE EXCEPTION 'calendar_sync.expected_booking_id_expression_missing';END IF;
  EXECUTE pg_catalog.replace(v_definition,v_original,v_replacement);
END;
$migration$;

COMMIT;
