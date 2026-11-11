-- Prepared locally; requires 20261111020255. No schema or scheduling changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $patch$
DECLARE definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)')) INTO definition;
  IF definition IS NULL OR pg_catalog.strpos(definition, 'glass_calc=NULLIF(')=0
    OR pg_catalog.strpos(definition, 'FOR UPDATE')=0 OR pg_catalog.strpos(definition, 'native_job.stale_revision')=0
    OR pg_catalog.strpos(definition, 'labelIndividualDoorIds')>0
    OR pg_catalog.strpos(definition, $$- 'labelDoorId' - 'labelProductCode'$$)=0
    OR pg_catalog.strpos(definition, $$IN ('labelDoorId','labelProductCode')$$)=0
  THEN RAISE EXCEPTION 'door_labels.unexpected_update_definition'; END IF;
  definition := pg_catalog.replace(definition, $$- 'labelDoorId' - 'labelProductCode'$$, $$- 'labelDoorId' - 'labelProductCode' - 'labelIndividualDoorIds'$$);
  definition := pg_catalog.replace(definition, $$IN ('labelDoorId','labelProductCode')$$, $$IN ('labelDoorId','labelProductCode','labelIndividualDoorIds')$$);
  EXECUTE definition;
END;
$patch$;

CREATE OR REPLACE FUNCTION public.dg_update_native_door_labels(p_internal_job_id uuid, p_line_id uuid, p_changes jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  actor uuid := auth.uid();
  job public.dg_native_jobs%ROWTYPE;
  line public.dg_native_job_lines%ROWTYPE;
  entry record;
  metadata_key text;
  current_value jsonb;
  desired_value jsonb;
  next_calc jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'native_job.authentication_required'; END IF;
  -- Match normal save lock order: active profile, parent job, then door line.
  PERFORM 1 FROM public.dg_user_profiles p WHERE p.user_id=actor AND p.active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'native_job.active_profile_required'; END IF;
  PERFORM public.dg_require_business_access();
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p
    WHERE p.user_id=actor AND p.permission_key='jobs' AND p.access_level='use')
  THEN RAISE EXCEPTION 'native_job.permission_required'; END IF;
  IF p_internal_job_id IS NULL OR p_line_id IS NULL OR p_changes IS NULL
    OR pg_catalog.jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb
  THEN RAISE EXCEPTION 'native_job.validation_failed'; END IF;

  SELECT * INTO job FROM public.dg_native_jobs j WHERE j.internal_job_id=p_internal_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'native_job.not_found'; END IF;
  IF job.archived_at IS NOT NULL THEN RAISE EXCEPTION 'native_job.archived'; END IF;
  SELECT * INTO line FROM public.dg_native_job_lines l
    WHERE l.internal_job_id=p_internal_job_id AND l.line_id=p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'native_job.not_found'; END IF;

  next_calc := COALESCE(line.glass_calc,'{}'::jsonb);
  FOR entry IN SELECT * FROM pg_catalog.jsonb_each(p_changes) LOOP
    IF entry.key NOT IN ('doorId','productCode','individualDoorIds') OR pg_catalog.jsonb_typeof(entry.value)<>'object'
    THEN RAISE EXCEPTION 'native_job.validation_failed'; END IF;
    IF NOT (entry.value ? 'expected' AND entry.value ? 'value')
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(entry.value) AS k WHERE k NOT IN ('expected','value'))

    THEN RAISE EXCEPTION 'native_job.validation_failed'; END IF;
    IF entry.key='individualDoorIds' THEN
      IF pg_catalog.jsonb_typeof(entry.value->'expected')<>'array' OR pg_catalog.jsonb_typeof(entry.value->'value')<>'array'
      THEN RAISE EXCEPTION 'native_job.validation_failed'; END IF;
      IF pg_catalog.jsonb_array_length(entry.value->'expected')>500 OR pg_catalog.jsonb_array_length(entry.value->'value')>500
        OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(entry.value->'expected') AS v WHERE pg_catalog.jsonb_typeof(v)<>'string')
        OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(entry.value->'value') AS v WHERE pg_catalog.jsonb_typeof(v)<>'string')
      THEN RAISE EXCEPTION 'native_job.validation_failed'; END IF;
      metadata_key := 'labelIndividualDoorIds';
      current_value := COALESCE(next_calc->metadata_key,'[]'::jsonb);
      desired_value := entry.value->'value';
    ELSE
      IF pg_catalog.jsonb_typeof(entry.value->'expected') NOT IN ('string','null')
        OR pg_catalog.jsonb_typeof(entry.value->'value') NOT IN ('string','null')
      THEN RAISE EXCEPTION 'native_job.validation_failed'; END IF;
      metadata_key := CASE entry.key WHEN 'doorId' THEN 'labelDoorId' ELSE 'labelProductCode' END;
      current_value := COALESCE(next_calc->metadata_key,'null'::jsonb);
      desired_value := CASE WHEN entry.value->'value'='""'::jsonb THEN 'null'::jsonb ELSE entry.value->'value' END;
    END IF;
    -- A retry after a lost response succeeds when the requested value is present.
    -- Different fields can be edited concurrently without overwriting each other.
    IF current_value IS DISTINCT FROM entry.value->'expected'
      AND current_value IS DISTINCT FROM desired_value
    THEN RAISE EXCEPTION 'native_job.stale_labels'; END IF;
    IF desired_value='null'::jsonb THEN
      next_calc := next_calc - metadata_key;
    ELSE
      next_calc := pg_catalog.jsonb_set(next_calc,ARRAY[metadata_key],desired_value,true);
    END IF;
  END LOOP;
  -- No parent UPDATE, revision increment, line specification rewrite, or scheduling
  -- call. Unknown JSON keys are retained. An exact retry performs no UPDATE at all.
  IF next_calc IS DISTINCT FROM COALESCE(line.glass_calc,'{}'::jsonb) THEN
    UPDATE public.dg_native_job_lines SET glass_calc=NULLIF(next_calc,'{}'::jsonb)
      WHERE line_id=p_line_id AND internal_job_id=p_internal_job_id;
  END IF;
  RETURN true;
END;
$function$;

ALTER FUNCTION public.dg_update_native_door_labels(uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_update_native_door_labels(uuid,uuid,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dg_update_native_door_labels(uuid,uuid,jsonb) TO authenticated;

COMMIT;
