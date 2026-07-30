-- EMERGENCY ONLY: remove the unapplied/applied legacy-transfer amendment before any transfer is authoritative.
-- Stop if any transferred row exists. This script preserves native and legacy data.
BEGIN;

DO $rollback_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.dg_native_jobs WHERE origin='legacy_transfer'
    OR transfer_source_system IS NOT NULL OR transfer_source_fingerprint IS NOT NULL)
  THEN RAISE EXCEPTION 'rollback.blocked_transferred_native_jobs_exist'; END IF;
END;
$rollback_guard$;

DROP TRIGGER dg_native_jobs_identity_immutability ON public.dg_native_jobs;
DROP FUNCTION public.dg_enforce_native_job_identity_immutability();
DROP FUNCTION public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb);
DROP INDEX public.dg_native_jobs_transfer_source_unique;
DROP INDEX public.dg_native_jobs_transfer_fingerprint_unique;

ALTER TABLE public.dg_native_jobs
  DROP CONSTRAINT dg_native_jobs_identifiers_present,
  DROP CONSTRAINT dg_native_jobs_identifiers_trimmed,
  DROP CONSTRAINT dg_native_jobs_visible_kind,
  DROP CONSTRAINT dg_native_jobs_visible_matches,
  DROP CONSTRAINT dg_native_jobs_legacy_kind,
  DROP CONSTRAINT dg_native_jobs_transfer_fingerprint,
  DROP CONSTRAINT dg_native_jobs_provenance,
  ADD CONSTRAINT dg_native_jobs_identifiers_present CHECK (biztrack_sales_order IS NOT NULL OR door_go_reference IS NOT NULL),
  ADD CONSTRAINT dg_native_jobs_identifiers_trimmed CHECK (
    (biztrack_sales_order IS NULL OR (biztrack_sales_order=pg_catalog.btrim(biztrack_sales_order) AND biztrack_sales_order<>''))
    AND (door_go_reference IS NULL OR (door_go_reference=pg_catalog.btrim(door_go_reference) AND door_go_reference<>''))
    AND visible_identifier=pg_catalog.btrim(visible_identifier) AND visible_identifier<>''
    AND (legacy_job_id IS NULL OR (legacy_job_id=pg_catalog.btrim(legacy_job_id) AND legacy_job_id<>''))
  ),
  ADD CONSTRAINT dg_native_jobs_visible_kind CHECK (visible_identifier_kind IN ('biztrack_sales_order','door_go_reference')),
  ADD CONSTRAINT dg_native_jobs_visible_matches CHECK (
    (visible_identifier_kind='biztrack_sales_order' AND visible_identifier=biztrack_sales_order)
    OR (visible_identifier_kind='door_go_reference' AND visible_identifier=door_go_reference)
  ),
  ADD CONSTRAINT dg_native_jobs_legacy_kind CHECK (legacy_identifier_kind IS NULL OR legacy_identifier_kind IN ('biztrack_sales_order','door_go_reference')),
  ADD CONSTRAINT dg_native_jobs_provenance CHECK (
    (origin='native' AND legacy_job_id IS NULL AND legacy_identifier_kind IS NULL AND door_go_reference IS NOT NULL)
    OR (origin='legacy_transfer' AND legacy_job_id IS NOT NULL AND legacy_identifier_kind IS NOT NULL
      AND visible_identifier=legacy_job_id AND visible_identifier_kind=legacy_identifier_kind
      AND ((legacy_identifier_kind='biztrack_sales_order' AND biztrack_sales_order=legacy_job_id AND door_go_reference IS NULL)
        OR (legacy_identifier_kind='door_go_reference' AND door_go_reference=legacy_job_id)))
  ),
  DROP COLUMN transfer_source_system,
  DROP COLUMN transfer_schema,
  DROP COLUMN transfer_version,
  DROP COLUMN transfer_source_identifier_kind,
  DROP COLUMN transfer_source_identifier_value,
  DROP COLUMN transfer_source_saved_at,
  DROP COLUMN transfer_exported_at,
  DROP COLUMN transfer_source_fingerprint;

CREATE OR REPLACE FUNCTION public.dg_list_native_jobs(
  p_include_archived boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_internal_job_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_candidates jsonb;
  v_items jsonb;
  v_has_more boolean;
  v_next_updated_at timestamptz;
  v_next_job_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles AS profile WHERE profile.user_id=v_actor AND profile.active=true)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS permission WHERE permission.user_id=v_actor
    AND permission.permission_key='jobs' AND permission.access_level IN ('view','use'))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required'; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100
    OR ((p_cursor_updated_at IS NULL) <> (p_cursor_internal_job_id IS NULL))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed'; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY item_updated_at DESC,item_job_id DESC),'[]'::jsonb)
  INTO v_candidates
  FROM (
    SELECT pg_catalog.jsonb_build_object(
      'internal_job_id',job.internal_job_id,'biztrack_sales_order',job.biztrack_sales_order,
      'door_go_reference',job.door_go_reference,'visible_identifier',job.visible_identifier,
      'visible_identifier_kind',job.visible_identifier_kind,'origin',job.origin,'revision',job.revision,
      'lifecycle_stage',job.lifecycle_stage,'customer',job.customer,'site_address',job.site_address,
      'archived_at',job.archived_at,'created_at',job.created_at,'updated_at',job.updated_at,
      'active_line_count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines AS line
        WHERE line.internal_job_id=job.internal_job_id AND line.line_status='Active'),
      'archived_line_count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines AS line
        WHERE line.internal_job_id=job.internal_job_id AND line.line_status='Archived')
    ) AS item, job.updated_at AS item_updated_at, job.internal_job_id AS item_job_id
    FROM public.dg_native_jobs AS job
    WHERE job.origin IN ('native','legacy_transfer')
      AND (COALESCE(p_include_archived,false) OR job.archived_at IS NULL)
      AND (p_cursor_updated_at IS NULL OR job.updated_at<p_cursor_updated_at
        OR (job.updated_at=p_cursor_updated_at AND job.internal_job_id<p_cursor_internal_job_id))
    ORDER BY job.updated_at DESC,job.internal_job_id DESC
    LIMIT p_limit+1
  ) AS candidates;

  v_has_more:=pg_catalog.jsonb_array_length(v_candidates)>p_limit;
  SELECT COALESCE(pg_catalog.jsonb_agg(element ORDER BY ordinal),'[]'::jsonb) INTO v_items
  FROM pg_catalog.jsonb_array_elements(v_candidates) WITH ORDINALITY AS candidate(element,ordinal)
  WHERE ordinal<=p_limit;
  IF v_has_more THEN
    v_next_updated_at:=(v_items->(pg_catalog.jsonb_array_length(v_items)-1)->>'updated_at')::timestamptz;
    v_next_job_id:=(v_items->(pg_catalog.jsonb_array_length(v_items)-1)->>'internal_job_id')::uuid;
  END IF;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'page',pg_catalog.jsonb_build_object(
    'limit',p_limit,'has_more',v_has_more,'next_cursor_updated_at',v_next_updated_at,
    'next_cursor_internal_job_id',v_next_job_id));
END;
$$;
ALTER FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) TO authenticated;

COMMIT;
