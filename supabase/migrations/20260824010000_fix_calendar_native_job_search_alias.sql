BEGIN;

CREATE OR REPLACE FUNCTION public.search_calendar_linkable_jobs(p_query text,p_item_type text,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_query text:=pg_catalog.btrim(p_query);v_limit integer:=COALESCE(p_limit,20);v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true) THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND p.access_level IN('view','use')) THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required';END IF;
  IF v_query='' OR p_item_type NOT IN('production','delivery','customer_pickup','note') OR v_limit<1 OR v_limit>50 THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed';END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) ORDER BY candidate.updated_at DESC,candidate.internal_job_id DESC),'[]'::jsonb) INTO v_result FROM(
    SELECT j.internal_job_id,j.customer,j.biztrack_sales_order,j.door_go_reference,j.visible_identifier,j.salesperson,j.fulfillment_plan,j.revision,j.updated_at
    FROM public.dg_native_jobs j
    WHERE j.archived_at IS NULL AND j.origin IN('native','legacy_transfer')
      AND (j.customer ILIKE '%'||v_query||'%' OR j.biztrack_sales_order ILIKE '%'||v_query||'%' OR j.door_go_reference ILIKE '%'||v_query||'%' OR j.visible_identifier ILIKE '%'||v_query||'%')
      AND (p_item_type IN('production','note') OR (p_item_type='delivery' AND (j.fulfillment_plan IS NULL OR j.fulfillment_plan='Delivery')) OR (p_item_type='customer_pickup' AND (j.fulfillment_plan IS NULL OR j.fulfillment_plan='Customer Pickup')))
    ORDER BY j.updated_at DESC,j.internal_job_id DESC LIMIT v_limit
  )candidate;
  RETURN v_result;
END;$$;
ALTER FUNCTION public.search_calendar_linkable_jobs(text,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.search_calendar_linkable_jobs(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_calendar_linkable_jobs(text,text,integer) TO authenticated;

COMMIT;
