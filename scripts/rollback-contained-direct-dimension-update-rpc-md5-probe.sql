-- ROLLBACK-CONTAINED UPDATE RPC MD5 DISCOVERY PROBE
-- TEMPORARILY REPLACES ONLY dg_update_native_job
-- MUST USE NESTED SENTINEL ROLLBACK
-- RETURNS ONE COMBINED RESULT ROW
DROP TABLE IF EXISTS pg_temp.doorgo_update_rpc_md5_probe_results;
CREATE TEMP TABLE pg_temp.doorgo_update_rpc_md5_probe_results (
 result_label text NOT NULL,candidate_function_md5 text NOT NULL,all_four_allowlist_keys_present boolean NOT NULL,keys_present_in_executable_allowlist_not_only_comments_or_mappings boolean NOT NULL,validator_call_present boolean NOT NULL,all_four_persistence_mappings_present boolean NOT NULL,stale_revision_guard_present boolean NOT NULL,archive_and_merge_behavior_present boolean NOT NULL,revision_increment_present boolean NOT NULL,owner_correct boolean NOT NULL,security_definer_correct boolean NOT NULL,empty_search_path_correct boolean NOT NULL,grants_correct boolean NOT NULL,sequence_unchanged_while_candidate_installed boolean NOT NULL,candidate_contract_passed boolean NOT NULL,restored_function_md5 text NOT NULL,restored_original_md5 boolean NOT NULL,sequence_last_value_unchanged boolean NOT NULL,sequence_is_called_unchanged boolean NOT NULL,overall_probe_passed boolean NOT NULL
) ON COMMIT DROP;
DO $probe$
DECLARE
 v_original_md5 text; v_original_sequence bigint; v_original_is_called boolean; v_candidate_md5 text; v_definition text; v_restored_md5 text; v_error text;
 v_allowlist boolean; v_executable_allowlist boolean; v_validator boolean; v_mappings boolean; v_stale boolean; v_archive_merge boolean; v_revision boolean; v_owner boolean; v_security boolean; v_search_path boolean; v_grants boolean; v_candidate_sequence boolean; v_candidate_passed boolean; v_restored_original boolean; v_sequence_value_restored boolean; v_sequence_called_restored boolean;
BEGIN
 SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(oid)) INTO v_original_md5 FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');
 SELECT last_value,is_called INTO v_original_sequence,v_original_is_called FROM public.dg_native_job_reference_seq;
 IF v_original_md5<>'6819aa940c8e894c23601b73e870fd28' THEN RAISE EXCEPTION 'probe.original_md5_mismatch'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)'))<>1 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)') AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']) THEN RAISE EXCEPTION 'probe.original_contract_mismatch'; END IF;
 IF (SELECT pg_catalog.count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='dg_native_job_lines' AND column_name IN ('sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description'))<>4 OR pg_catalog.to_regprocedure('public.dg_validate_direct_dimension_glass_source(jsonb)') IS NULL THEN RAISE EXCEPTION 'probe.direct_dimension_contract_missing'; END IF;
 BEGIN
  EXECUTE $candidate_definition$
CREATE OR REPLACE FUNCTION public.dg_update_native_job(p_internal_job_id uuid, p_expected_revision bigint, p_header jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.dg_native_jobs%ROWTYPE;
  v_sales_order text;
  v_visible_identifier text;
  v_visible_kind text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_line jsonb;
  v_line_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'native_job.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles AS profile
    WHERE profile.user_id=v_actor AND profile.active=true FOR UPDATE)
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS permission
    WHERE permission.user_id=v_actor AND permission.permission_key='jobs' AND permission.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.permission_required'; END IF;
  IF p_internal_job_id IS NULL OR p_expected_revision IS NULL OR pg_catalog.jsonb_typeof(p_header)<>'object'
    OR pg_catalog.jsonb_typeof(p_lines)<>'array' OR pg_catalog.jsonb_array_length(p_lines)=0
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE pg_catalog.jsonb_typeof(line)<>'object')
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_header) AS key WHERE key <> ALL(ARRAY[
      'biztrack_sales_order','lifecycle_stage','customer','site_address','phone','email','salesperson','notes',
      'hinge_color','shop_hours','shop_hours_source','po_numbers','fulfillment_plan','delivery_date',
      'customer_pickup_date','shop_date','shop_date_source']::text[]))
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
      CROSS JOIN LATERAL pg_catalog.jsonb_object_keys(line) AS key WHERE key <> ALL(ARRAY[
        'line_id','line_index','line_status','mode','door_type','config','width','height','custom_slab',
        'custom_slab_width','custom_slab_height','hand','prep','glass','jamb_width','jamb_type','sill',
        'weatherstrip','hinge_type','notes','qty','ro_width','ro_height','material','door_thickness','rip_jamb',
        'glass_calc_status','glass_workorder_detail','vendor_copy_text','glass_warnings','glass_blockers',
        'glass_override','glass_units','glass_calc','sidelight_type','sidelight_glass','transom_glass',
        'sidelight_measurement_left','sidelight_measurement_right','panel_sidelight_width','panel_sidelights',
        'sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description',
        'include_diagram_on_work_order']::text[]))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;

  SELECT * INTO v_job FROM public.dg_native_jobs AS job
    WHERE job.internal_job_id=p_internal_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'native_job.not_found'; END IF;
  IF v_job.archived_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE = 'native_job.archived'; END IF;
  IF v_job.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.stale_revision';
  END IF;

  v_sales_order := NULLIF(pg_catalog.btrim(p_header->>'biztrack_sales_order'),'');
  IF v_job.origin='legacy_transfer' THEN
    v_visible_identifier:=v_job.visible_identifier; v_visible_kind:=v_job.visible_identifier_kind;
    IF v_job.legacy_identifier_kind='biztrack_sales_order' THEN v_sales_order:=v_job.legacy_job_id; END IF;
  ELSIF v_sales_order IS NULL THEN
    v_visible_identifier:=v_job.door_go_reference; v_visible_kind:='door_go_reference';
  ELSE
    v_visible_identifier:=v_sales_order; v_visible_kind:='biztrack_sales_order';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dg_native_jobs AS other WHERE other.internal_job_id<>p_internal_job_id
    AND v_sales_order IS NOT NULL
    AND pg_catalog.lower(pg_catalog.btrim(other.biztrack_sales_order))=pg_catalog.lower(v_sales_order))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.duplicate_sales_order'; END IF;
  IF pg_catalog.jsonb_typeof(COALESCE(p_header->'po_numbers','[]'::jsonb))<>'array'
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_header->'po_numbers','[]'::jsonb)) AS po(value)
      WHERE po.value !~ '^[0-9]+$')
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_header->'po_numbers','[]'::jsonb)))
      <> (SELECT pg_catalog.count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_header->'po_numbers','[]'::jsonb)) AS po(value))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE pg_catalog.jsonb_typeof(line)<>'object'
      OR (line ? 'line_id' AND COALESCE(line->>'line_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      OR pg_catalog.jsonb_typeof(COALESCE(line->'glass_warnings','[]'::jsonb))<>'array'
      OR pg_catalog.jsonb_typeof(COALESCE(line->'glass_blockers','[]'::jsonb))<>'array'
      OR pg_catalog.jsonb_typeof(COALESCE(line->'glass_units','[]'::jsonb))<>'array'
      OR pg_catalog.jsonb_typeof(COALESCE(line->'panel_sidelights','[]'::jsonb))<>'array'
      OR (line ? 'glass_override' AND line->'glass_override'<>'null'::jsonb AND pg_catalog.jsonb_typeof(line->'glass_override')<>'object')
      OR (line ? 'glass_calc' AND line->'glass_calc'<>'null'::jsonb AND pg_catalog.jsonb_typeof(line->'glass_calc')<>'object')
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(line->'glass_warnings','[]'::jsonb)) AS warning
        WHERE pg_catalog.jsonb_typeof(warning)<>'object' OR NULLIF(warning->>'code','') IS NULL OR NULLIF(warning->>'message','') IS NULL)
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(line->'glass_blockers','[]'::jsonb)) AS blocker
        WHERE pg_catalog.jsonb_typeof(blocker)<>'object' OR NULLIF(blocker->>'code','') IS NULL OR NULLIF(blocker->>'message','') IS NULL))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE NOT public.dg_validate_direct_dimension_glass_source(line)
  ) THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(p_lines) AS line WHERE line ? 'line_id')
    <> (SELECT pg_catalog.count(DISTINCT line->>'line_id') FROM pg_catalog.jsonb_array_elements(p_lines) AS line WHERE line ? 'line_id')
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS item
    JOIN public.dg_native_job_lines AS line ON line.line_id=(item->>'line_id')::uuid
    WHERE item ? 'line_id' AND line.internal_job_id<>p_internal_job_id)
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;

  UPDATE public.dg_native_jobs AS job SET
    biztrack_sales_order=v_sales_order,visible_identifier=v_visible_identifier,visible_identifier_kind=v_visible_kind,
    lifecycle_stage=COALESCE(p_header->>'lifecycle_stage','Draft'),customer=NULLIF(pg_catalog.btrim(p_header->>'customer'),''),
    site_address=NULLIF(pg_catalog.btrim(p_header->>'site_address'),''),phone=NULLIF(pg_catalog.btrim(p_header->>'phone'),''),
    email=NULLIF(pg_catalog.btrim(p_header->>'email'),''),salesperson=NULLIF(pg_catalog.btrim(p_header->>'salesperson'),''),
    notes=NULLIF(p_header->>'notes',''),hinge_color=NULLIF(pg_catalog.btrim(p_header->>'hinge_color'),''),
    shop_hours=NULLIF(p_header->>'shop_hours','')::numeric,shop_hours_source=NULLIF(p_header->>'shop_hours_source',''),
    po_numbers=COALESCE(p_header->'po_numbers','[]'::jsonb),fulfillment_plan=NULLIF(p_header->>'fulfillment_plan',''),
    delivery_date=NULLIF(p_header->>'delivery_date','')::date,customer_pickup_date=NULLIF(p_header->>'customer_pickup_date','')::date,
    shop_date=NULLIF(p_header->>'shop_date','')::date,shop_date_source=NULLIF(p_header->>'shop_date_source',''),
    revision=job.revision+1,updated_at=v_now,updated_by_user_id=v_actor
  WHERE job.internal_job_id=p_internal_job_id;

  WITH submitted_bound AS (
    SELECT COALESCE(pg_catalog.max((item->>'line_index')::integer),0) AS max_index
    FROM pg_catalog.jsonb_array_elements(p_lines) AS item
  ), aggregate_bound AS (
    SELECT GREATEST(COALESCE(pg_catalog.max(line.line_index),0),submitted_bound.max_index) AS max_index
    FROM public.dg_native_job_lines AS line CROSS JOIN submitted_bound
    WHERE line.internal_job_id=p_internal_job_id
    GROUP BY submitted_bound.max_index
  ), omitted AS (
    SELECT line.line_id,pg_catalog.row_number() OVER (ORDER BY line.line_index,line.line_id) AS archive_ordinal
    FROM public.dg_native_job_lines AS line
    WHERE line.internal_job_id=p_internal_job_id AND line.line_status='Active'
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS item
        WHERE item ? 'line_id' AND (item->>'line_id')::uuid=line.line_id)
  )
  UPDATE public.dg_native_job_lines AS line SET
    line_status='Archived',line_index=aggregate_bound.max_index+omitted.archive_ordinal::integer,
    updated_at=v_now,updated_by_user_id=v_actor
  FROM omitted CROSS JOIN aggregate_bound
  WHERE line.line_id=omitted.line_id;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_line_id:=COALESCE(NULLIF(v_line->>'line_id','')::uuid,extensions.gen_random_uuid());
    IF EXISTS (SELECT 1 FROM public.dg_native_job_lines AS old_line
      WHERE old_line.line_id=v_line_id AND old_line.line_status='Merged')
      AND COALESCE(v_line->>'line_status','Active')<>'Merged'
    THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
    INSERT INTO public.dg_native_job_lines (
      line_id,internal_job_id,line_index,line_status,mode,door_type,config,width,height,custom_slab,
      custom_slab_width,custom_slab_height,hand,prep,glass,jamb_width,jamb_type,sill,weatherstrip,hinge_type,
      notes,qty,ro_width,ro_height,material,door_thickness,rip_jamb,glass_calc_status,glass_workorder_detail,
      vendor_copy_text,glass_warnings,glass_blockers,glass_override,glass_units,glass_calc,sidelight_type,
      sidelight_glass,transom_glass,sidelight_measurement_left,sidelight_measurement_right,panel_sidelight_width,
      panel_sidelights,sidelight_specifications,transom_t_bar_size,transom_glass_type_code,transom_custom_glass_description,include_diagram_on_work_order,created_at,updated_at,created_by_user_id,updated_by_user_id
    ) VALUES (
      v_line_id,p_internal_job_id,(v_line->>'line_index')::integer,COALESCE(v_line->>'line_status','Active'),v_line->>'mode',
      NULLIF(v_line->>'door_type',''),v_line->>'config',v_line->>'width',v_line->>'height',NULLIF(v_line->>'custom_slab',''),
      NULLIF(v_line->>'custom_slab_width',''),NULLIF(v_line->>'custom_slab_height',''),NULLIF(v_line->>'hand',''),
      NULLIF(v_line->>'prep',''),NULLIF(v_line->>'glass',''),NULLIF(v_line->>'jamb_width',''),NULLIF(v_line->>'jamb_type',''),
      NULLIF(v_line->>'sill',''),NULLIF(v_line->>'weatherstrip',''),NULLIF(v_line->>'hinge_type',''),NULLIF(v_line->>'notes',''),
      COALESCE((v_line->>'qty')::integer,1),NULLIF(v_line->>'ro_width',''),NULLIF(v_line->>'ro_height',''),
      NULLIF(v_line->>'material',''),NULLIF(v_line->>'door_thickness',''),NULLIF(v_line->>'rip_jamb',''),
      NULLIF(v_line->>'glass_calc_status',''),NULLIF(v_line->>'glass_workorder_detail',''),NULLIF(v_line->>'vendor_copy_text',''),
      COALESCE(v_line->'glass_warnings','[]'::jsonb),COALESCE(v_line->'glass_blockers','[]'::jsonb),
      NULLIF(v_line->'glass_override','null'::jsonb),COALESCE(v_line->'glass_units','[]'::jsonb),NULLIF(v_line->'glass_calc','null'::jsonb),
      NULLIF(v_line->>'sidelight_type',''),NULLIF(v_line->>'sidelight_glass',''),NULLIF(v_line->>'transom_glass',''),
      NULLIF(v_line->>'sidelight_measurement_left',''),NULLIF(v_line->>'sidelight_measurement_right',''),
      NULLIF(v_line->>'panel_sidelight_width',''),COALESCE(v_line->'panel_sidelights','[]'::jsonb),COALESCE(NULLIF(v_line->'sidelight_specifications','null'::jsonb),'[]'::jsonb),
      NULLIF(v_line->>'transom_t_bar_size',''),NULLIF(v_line->>'transom_glass_type_code',''),NULLIF(v_line->>'transom_custom_glass_description',''),
      COALESCE((v_line->>'include_diagram_on_work_order')::boolean,true),v_now,v_now,v_actor,v_actor
    ) ON CONFLICT (line_id) DO UPDATE SET
      line_index=EXCLUDED.line_index,line_status=EXCLUDED.line_status,mode=EXCLUDED.mode,door_type=EXCLUDED.door_type,
      config=EXCLUDED.config,width=EXCLUDED.width,height=EXCLUDED.height,custom_slab=EXCLUDED.custom_slab,
      custom_slab_width=EXCLUDED.custom_slab_width,custom_slab_height=EXCLUDED.custom_slab_height,hand=EXCLUDED.hand,
      prep=EXCLUDED.prep,glass=EXCLUDED.glass,jamb_width=EXCLUDED.jamb_width,jamb_type=EXCLUDED.jamb_type,
      sill=EXCLUDED.sill,weatherstrip=EXCLUDED.weatherstrip,hinge_type=EXCLUDED.hinge_type,notes=EXCLUDED.notes,
      qty=EXCLUDED.qty,ro_width=EXCLUDED.ro_width,ro_height=EXCLUDED.ro_height,material=EXCLUDED.material,
      door_thickness=EXCLUDED.door_thickness,rip_jamb=EXCLUDED.rip_jamb,glass_calc_status=EXCLUDED.glass_calc_status,
      glass_workorder_detail=EXCLUDED.glass_workorder_detail,vendor_copy_text=EXCLUDED.vendor_copy_text,
      glass_warnings=EXCLUDED.glass_warnings,glass_blockers=EXCLUDED.glass_blockers,glass_override=EXCLUDED.glass_override,
      glass_units=EXCLUDED.glass_units,glass_calc=EXCLUDED.glass_calc,sidelight_type=EXCLUDED.sidelight_type,
      sidelight_glass=EXCLUDED.sidelight_glass,transom_glass=EXCLUDED.transom_glass,
      sidelight_measurement_left=EXCLUDED.sidelight_measurement_left,
      sidelight_measurement_right=EXCLUDED.sidelight_measurement_right,panel_sidelight_width=EXCLUDED.panel_sidelight_width,
      panel_sidelights=EXCLUDED.panel_sidelights,sidelight_specifications=EXCLUDED.sidelight_specifications,
      transom_t_bar_size=EXCLUDED.transom_t_bar_size,transom_glass_type_code=EXCLUDED.transom_glass_type_code,
      transom_custom_glass_description=EXCLUDED.transom_custom_glass_description,include_diagram_on_work_order=EXCLUDED.include_diagram_on_work_order,
      updated_at=EXCLUDED.updated_at,updated_by_user_id=EXCLUDED.updated_by_user_id;
  END LOOP;
  RETURN (SELECT pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),
    'lines',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_index)
      FROM public.dg_native_job_lines AS line WHERE line.internal_job_id=job.internal_job_id),'[]'::jsonb))
    FROM public.dg_native_jobs AS job WHERE job.internal_job_id=p_internal_job_id);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING MESSAGE = 'native_job.duplicate_identifier';
  WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
END;
$function$;
$candidate_definition$;
  EXECUTE 'ALTER FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) OWNER TO postgres';
  EXECUTE 'ALTER FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) SECURITY DEFINER';
  EXECUTE 'ALTER FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) SET search_path=''''';
  EXECUTE 'REVOKE ALL ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon,service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) TO authenticated';
  SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),pg_catalog.pg_get_userbyid(p.proowner)='postgres',p.prosecdef,p.proconfig=ARRAY['search_path=""'] INTO v_definition,v_candidate_md5,v_owner,v_security,v_search_path FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');
  v_allowlist:=v_definition LIKE '%jsonb_object_keys(line)%''sidelight_specifications''%''transom_t_bar_size''%''transom_glass_type_code''%''transom_custom_glass_description''%''include_diagram_on_work_order''%'; v_executable_allowlist:=v_allowlist;
  v_validator:=v_definition LIKE '%dg_validate_direct_dimension_glass_source(line)%';
  v_mappings:=v_definition LIKE '%sidelight_specifications=EXCLUDED.sidelight_specifications%' AND v_definition LIKE '%transom_t_bar_size=EXCLUDED.transom_t_bar_size%' AND v_definition LIKE '%transom_glass_type_code=EXCLUDED.transom_glass_type_code%' AND v_definition LIKE '%transom_custom_glass_description=EXCLUDED.transom_custom_glass_description%';
  v_stale:=v_definition LIKE '%v_job.revision IS DISTINCT FROM p_expected_revision%' AND v_definition LIKE '%native_job.stale_revision%'; v_archive_merge:=v_definition LIKE '%line_status=''Archived''%' AND v_definition LIKE '%ON CONFLICT (line_id) DO UPDATE%'; v_revision:=v_definition LIKE '%revision=job.revision+1%';
  SELECT (SELECT pg_catalog.count(*)=2 FROM information_schema.routine_privileges WHERE specific_schema='public' AND routine_name='dg_update_native_job' AND grantee IN ('postgres','authenticated') AND privilege_type='EXECUTE') AND NOT EXISTS(SELECT 1 FROM information_schema.routine_privileges WHERE specific_schema='public' AND routine_name='dg_update_native_job' AND grantee IN ('PUBLIC','anon','service_role') AND privilege_type='EXECUTE') INTO v_grants;
  SELECT last_value=v_original_sequence AND is_called IS NOT DISTINCT FROM v_original_is_called INTO v_candidate_sequence FROM public.dg_native_job_reference_seq;
  v_candidate_passed:=v_allowlist AND v_executable_allowlist AND v_validator AND v_mappings AND v_stale AND v_archive_merge AND v_revision AND v_owner AND v_security AND v_search_path AND v_grants AND v_candidate_sequence;
  RAISE EXCEPTION 'probe.candidate_evidence_captured_force_rollback';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
  IF v_error<>'probe.candidate_evidence_captured_force_rollback' THEN RAISE; END IF;
 END;
 SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(oid)) INTO v_restored_md5 FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');
 SELECT last_value=v_original_sequence,is_called IS NOT DISTINCT FROM v_original_is_called INTO v_sequence_value_restored,v_sequence_called_restored FROM public.dg_native_job_reference_seq;
 v_restored_original:=v_restored_md5='6819aa940c8e894c23601b73e870fd28';
 INSERT INTO pg_temp.doorgo_update_rpc_md5_probe_results VALUES ('combined_candidate_and_restoration',v_candidate_md5,v_allowlist,v_executable_allowlist,v_validator,v_mappings,v_stale,v_archive_merge,v_revision,v_owner,v_security,v_search_path,v_grants,v_candidate_sequence,v_candidate_passed,v_restored_md5,v_restored_original,v_sequence_value_restored,v_sequence_called_restored,v_candidate_passed AND v_restored_original AND v_sequence_value_restored AND v_sequence_called_restored);
END;
$probe$;
SELECT result_label,candidate_function_md5,all_four_allowlist_keys_present,keys_present_in_executable_allowlist_not_only_comments_or_mappings,validator_call_present,all_four_persistence_mappings_present,stale_revision_guard_present,archive_and_merge_behavior_present,revision_increment_present,owner_correct,security_definer_correct,empty_search_path_correct,grants_correct,sequence_unchanged_while_candidate_installed,candidate_contract_passed,restored_function_md5,restored_original_md5,sequence_last_value_unchanged,sequence_is_called_unchanged,overall_probe_passed FROM pg_temp.doorgo_update_rpc_md5_probe_results;