-- Narrow rollback: restore the pre-correction transferred BizTrack update behavior.
BEGIN;

DO $rollback$
DECLARE
 v_corrected_md5 constant text := '4b16dfb5896d1ea080edc05e419de6c2';
 v_restored_md5 constant text := 'be3117f9494d85c82adb2359bf2040d1';
 v_corrected_expression constant text := 'IF v_job.legacy_identifier_kind=''biztrack_sales_order'' THEN v_sales_order:=v_job.biztrack_sales_order; END IF;';
 v_restored_expression constant text := 'IF v_job.legacy_identifier_kind=''biztrack_sales_order'' THEN v_sales_order:=v_job.legacy_job_id; END IF;';
 v_before_definition text; v_after_definition text; v_restore_definition text;
 v_before_md5 text; v_after_md5 text; v_sequence bigint; v_after_sequence bigint;
 v_is_called boolean; v_after_is_called boolean; v_contract_passed boolean; v_grants_passed boolean;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
 INTO v_before_definition,v_before_md5
 FROM pg_catalog.pg_proc AS p
 WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');
 SELECT last_value,is_called INTO v_sequence,v_is_called FROM public.dg_native_job_reference_seq;

 IF v_before_md5 IS DISTINCT FROM v_corrected_md5 THEN RAISE EXCEPTION 'transferred_biztrack_rollback.start_md5_mismatch'; END IF;
 IF (pg_catalog.length(v_before_definition)-pg_catalog.length(pg_catalog.replace(v_before_definition,v_corrected_expression,'')))
      / pg_catalog.length(v_corrected_expression) <> 1
 THEN RAISE EXCEPTION 'transferred_biztrack_rollback.expected_single_expression_missing'; END IF;
 IF pg_catalog.strpos(v_before_definition,v_restored_expression)<>0 THEN RAISE EXCEPTION 'transferred_biztrack_rollback.restored_expression_already_present'; END IF;

 v_restore_definition:=pg_catalog.replace(v_before_definition,v_corrected_expression,v_restored_expression);
 EXECUTE v_restore_definition;

 SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
 INTO v_after_definition,v_after_md5
 FROM pg_catalog.pg_proc AS p
 WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');
 IF v_after_md5 IS DISTINCT FROM v_restored_md5 THEN RAISE EXCEPTION 'transferred_biztrack_rollback.restored_md5_mismatch'; END IF;

 v_contract_passed:=pg_catalog.strpos(v_after_definition,v_restored_expression)>0
  AND pg_catalog.strpos(v_after_definition,v_corrected_expression)=0
  AND v_after_definition LIKE '%jsonb_object_keys(line)%''sidelight_specifications''%''transom_t_bar_size''%''transom_glass_type_code''%''transom_custom_glass_description''%''include_diagram_on_work_order''%'
  AND v_after_definition LIKE '%sidelight_specifications=EXCLUDED.sidelight_specifications%'
  AND v_after_definition LIKE '%transom_t_bar_size=EXCLUDED.transom_t_bar_size%'
  AND v_after_definition LIKE '%transom_glass_type_code=EXCLUDED.transom_glass_type_code%'
  AND v_after_definition LIKE '%transom_custom_glass_description=EXCLUDED.transom_custom_glass_description%'
  AND v_after_definition LIKE '%dg_validate_direct_dimension_glass_source(line)%'
  AND v_after_definition LIKE '%v_job.revision IS DISTINCT FROM p_expected_revision%'
  AND v_after_definition LIKE '%native_job.stale_revision%'
  AND v_after_definition LIKE '%line_status=''Archived''%'
  AND v_after_definition LIKE '%ON CONFLICT (line_id) DO UPDATE%'
  AND v_after_definition LIKE '%revision=job.revision+1%';
 IF NOT v_contract_passed THEN RAISE EXCEPTION 'transferred_biztrack_rollback.contract_mismatch'; END IF;

 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
   WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)')
     AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""'])
 THEN RAISE EXCEPTION 'transferred_biztrack_rollback.function_security_mismatch'; END IF;
 SELECT (SELECT pg_catalog.count(*)=2 FROM information_schema.routine_privileges
   WHERE specific_schema='public' AND routine_name='dg_update_native_job'
     AND grantee IN ('postgres','authenticated') AND privilege_type='EXECUTE')
   AND NOT EXISTS (SELECT 1 FROM information_schema.routine_privileges
     WHERE specific_schema='public' AND routine_name='dg_update_native_job'
       AND grantee IN ('PUBLIC','anon','service_role') AND privilege_type='EXECUTE') INTO v_grants_passed;
 IF NOT v_grants_passed THEN RAISE EXCEPTION 'transferred_biztrack_rollback.grant_mismatch'; END IF;

 SELECT last_value,is_called INTO v_after_sequence,v_after_is_called FROM public.dg_native_job_reference_seq;
 IF v_after_sequence<>v_sequence OR v_after_is_called IS DISTINCT FROM v_is_called
 THEN RAISE EXCEPTION 'transferred_biztrack_rollback.sequence_changed'; END IF;
END;
$rollback$;

COMMIT;
