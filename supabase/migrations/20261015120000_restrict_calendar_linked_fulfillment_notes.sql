-- Shared Calendar access: qualify by fulfillment linkage, never salesperson/creator.
-- Completed items remain visible; only deleted items cease to qualify.
BEGIN;

CREATE OR REPLACE FUNCTION public.calendar_linked_fulfillment_notes(p_internal_job_ids uuid[])
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
    AND job.archived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.dg_calendar_items item
      WHERE item.linked_internal_job_id = job.internal_job_id
        AND item.item_type IN ('delivery', 'customer_pickup')
        AND item.deleted_at IS NULL
    );
END;
$$;

ALTER FUNCTION public.calendar_linked_fulfillment_notes(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_linked_fulfillment_notes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_linked_fulfillment_notes(uuid[]) TO authenticated;

COMMIT;
