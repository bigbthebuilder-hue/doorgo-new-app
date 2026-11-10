-- Calendar View and Use share the existing company-wide fulfillment-note projection.
-- Requires the business-access migration (20261027120000); no mutation gate changes.
-- Completed items remain visible; only deleted items cease to qualify.
BEGIN;

CREATE OR REPLACE FUNCTION public.calendar_linked_fulfillment_notes(p_internal_job_ids uuid[])
RETURNS TABLE(internal_job_id uuid, notes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='calendar_item.authentication_required';
  END IF;
  PERFORM public.dg_require_business_access();
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true) THEN
    RAISE EXCEPTION USING MESSAGE='calendar_item.active_profile_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions p
    WHERE p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level IN ('view','use')
  ) THEN
    RAISE EXCEPTION USING MESSAGE='calendar_item.permission_required';
  END IF;

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
