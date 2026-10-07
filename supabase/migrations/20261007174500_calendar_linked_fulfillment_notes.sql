-- Calendar-use users may read only the Job-owned fulfillment notes needed by linked Calendar items.
BEGIN;

CREATE FUNCTION public.calendar_linked_fulfillment_notes(p_internal_job_ids uuid[])
RETURNS TABLE(internal_job_id uuid, notes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  PERFORM public.dg_calendar_require_use(false);

  IF p_internal_job_ids IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT job.internal_job_id, job.notes
  FROM public.dg_native_jobs job
  WHERE job.internal_job_id = ANY(p_internal_job_ids)
    AND job.archived_at IS NULL;
END;
$$;

ALTER FUNCTION public.calendar_linked_fulfillment_notes(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_linked_fulfillment_notes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_linked_fulfillment_notes(uuid[]) TO authenticated;

COMMIT;