BEGIN;

-- Compute Jobs grouping from existing production completion only.
-- Drafts and jobs with no production stay active. Fulfillment has no effect.
-- No lifecycle, booking or historical rows change.
CREATE FUNCTION public.dg_job_production_is_complete(p_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT j.lifecycle_stage = 'Confirmed Job' AND COALESCE((
    SELECT bool_and(b.completed_at IS NOT NULL)
    FROM public.dg_production_bookings b
    WHERE (b.linked_internal_job_id = j.internal_job_id
      OR (b.linked_internal_job_id IS NULL AND b.job_id = j.visible_identifier))
      AND b.booking_kind = 'production' AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
  ), false)
  FROM public.dg_native_jobs j
  WHERE j.internal_job_id = p_job_id AND j.archived_at IS NULL;
$$;
ALTER FUNCTION public.dg_job_production_is_complete(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_job_production_is_complete(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Retain the existing authenticated list boundary, business gate, archive handling,
-- pagination, owner and ACL. Only extend its authorized projection.
DO $$
DECLARE
  definition text := pg_catalog.pg_get_functiondef('public.dg_list_native_jobs(boolean,integer,timestamptz,uuid)'::regprocedure);
  marker text := '''site_address'',job.site_address,';
BEGIN
  IF (length(definition) - length(replace(definition, marker, ''))) <> length(marker) THEN
    RAISE EXCEPTION 'native_job.list_definition_drift';
  END IF;
  EXECUTE replace(definition, marker,
    marker || '''salesperson'',job.salesperson,''is_complete'',COALESCE(public.dg_job_production_is_complete(job.internal_job_id),false),');
END;
$$;

COMMIT;
