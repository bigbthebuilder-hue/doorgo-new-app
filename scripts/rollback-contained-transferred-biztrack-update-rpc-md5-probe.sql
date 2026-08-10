-- ROLLBACK-CONTAINED TRANSFERRED BIZTRACK UPDATE RPC MD5 DISCOVERY PROBE
-- TEMPORARILY REPLACES ONLY dg_update_native_job INSIDE A NESTED SUBTRANSACTION
-- MUST RESTORE THE STARTING FUNCTION AND DG SEQUENCE STATE
-- RETURNS ONE COMBINED RESULT ROW
DROP TABLE IF EXISTS pg_temp.doorgo_transferred_biztrack_update_probe_results;
CREATE TEMP TABLE pg_temp.doorgo_transferred_biztrack_update_probe_results (
 result_label text NOT NULL,
 candidate_function_md5 text NOT NULL,
 transferred_biztrack_preserved_from_sales_order boolean NOT NULL,
 obsolete_legacy_job_id_source_absent boolean NOT NULL,
 exact_update_signature_present boolean NOT NULL,
 all_four_allowlist_keys_present boolean NOT NULL,
 all_four_persistence_mappings_present boolean NOT NULL,
 validator_call_present boolean NOT NULL,
 stale_revision_guard_present boolean NOT NULL,
 archive_and_merge_behavior_present boolean NOT NULL,
 revision_increment_present boolean NOT NULL,
 owner_correct boolean NOT NULL,
 security_definer_correct boolean NOT NULL,
 empty_search_path_correct boolean NOT NULL,
 grants_correct boolean NOT NULL,
 sequence_unchanged_while_candidate_installed boolean NOT NULL,
 candidate_contract_passed boolean NOT NULL,
 restored_function_md5 text NOT NULL,
 restored_current_md5 boolean NOT NULL,
 sequence_last_value_unchanged boolean NOT NULL,
 sequence_is_called_unchanged boolean NOT NULL,
 overall_probe_passed boolean NOT NULL
) ON COMMIT DROP;

DO $probe$
DECLARE
 v_expected_md5 constant text := 'be3117f9494d85c82adb2359bf2040d1';
 v_old_expression constant text := 'IF v_job.legacy_identifier_kind=''biztrack_sales_order'' THEN v_sales_order:=v_job.legacy_job_id; END IF;';
 v_new_expression constant text := 'IF v_job.legacy_identifier_kind=''biztrack_sales_order'' THEN v_sales_order:=v_job.biztrack_sales_order; END IF;';
 v_original_definition text; v_candidate_definition text; v_definition text;
 v_original_md5 text; v_candidate_md5 text; v_restored_md5 text; v_error text;
 v_original_sequence bigint; v_original_is_called boolean;
 v_preservation boolean; v_obsolete_absent boolean; v_signature boolean; v_allowlist boolean; v_mappings boolean;
 v_validator boolean; v_stale boolean; v_archive_merge boolean; v_revision boolean;
 v_owner boolean; v_security boolean; v_search_path boolean; v_grants boolean; v_candidate_sequence boolean;
 v_candidate_passed boolean; v_restored_current boolean; v_sequence_value_restored boolean; v_sequence_called_restored boolean;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
 INTO v_original_definition,v_original_md5
 FROM pg_catalog.pg_proc AS p
 WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');
 SELECT last_value,is_called INTO v_original_sequence,v_original_is_called FROM public.dg_native_job_reference_seq;

 IF v_original_md5 IS DISTINCT FROM v_expected_md5 THEN RAISE EXCEPTION 'probe.original_md5_mismatch'; END IF;
 IF (pg_catalog.length(v_original_definition)-pg_catalog.length(pg_catalog.replace(v_original_definition,v_old_expression,'')))
      / pg_catalog.length(v_old_expression) <> 1
 THEN RAISE EXCEPTION 'probe.expected_single_defect_expression_missing'; END IF;
 IF pg_catalog.strpos(v_original_definition,v_new_expression)<>0 THEN RAISE EXCEPTION 'probe.candidate_expression_already_present'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc AS p
   WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)')
     AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']
 ) THEN RAISE EXCEPTION 'probe.original_contract_mismatch'; END IF;

 v_candidate_definition:=pg_catalog.replace(v_original_definition,v_old_expression,v_new_expression);
 BEGIN
  EXECUTE v_candidate_definition;
  SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
    pg_catalog.pg_get_userbyid(p.proowner)='postgres',p.prosecdef,p.proconfig=ARRAY['search_path=""']
  INTO v_definition,v_candidate_md5,v_owner,v_security,v_search_path
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');

  v_preservation:=pg_catalog.strpos(v_definition,v_new_expression)>0;
  v_obsolete_absent:=pg_catalog.strpos(v_definition,v_old_expression)=0;
  v_signature:=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)') IS NOT NULL;
  v_allowlist:=v_definition LIKE '%jsonb_object_keys(line)%''sidelight_specifications''%''transom_t_bar_size''%''transom_glass_type_code''%''transom_custom_glass_description''%''include_diagram_on_work_order''%';
  v_mappings:=v_definition LIKE '%sidelight_specifications=EXCLUDED.sidelight_specifications%'
    AND v_definition LIKE '%transom_t_bar_size=EXCLUDED.transom_t_bar_size%'
    AND v_definition LIKE '%transom_glass_type_code=EXCLUDED.transom_glass_type_code%'
    AND v_definition LIKE '%transom_custom_glass_description=EXCLUDED.transom_custom_glass_description%';
  v_validator:=v_definition LIKE '%dg_validate_direct_dimension_glass_source(line)%';
  v_stale:=v_definition LIKE '%v_job.revision IS DISTINCT FROM p_expected_revision%' AND v_definition LIKE '%native_job.stale_revision%';
  v_archive_merge:=v_definition LIKE '%line_status=''Archived''%' AND v_definition LIKE '%ON CONFLICT (line_id) DO UPDATE%';
  v_revision:=v_definition LIKE '%revision=job.revision+1%';
  SELECT (SELECT pg_catalog.count(*)=2 FROM information_schema.routine_privileges
    WHERE specific_schema='public' AND routine_name='dg_update_native_job'
      AND grantee IN ('postgres','authenticated') AND privilege_type='EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM information_schema.routine_privileges
      WHERE specific_schema='public' AND routine_name='dg_update_native_job'
        AND grantee IN ('PUBLIC','anon','service_role') AND privilege_type='EXECUTE') INTO v_grants;
  SELECT last_value=v_original_sequence AND is_called IS NOT DISTINCT FROM v_original_is_called
    INTO v_candidate_sequence FROM public.dg_native_job_reference_seq;
  v_candidate_passed:=v_preservation AND v_obsolete_absent AND v_signature AND v_allowlist AND v_mappings
    AND v_validator AND v_stale AND v_archive_merge AND v_revision AND v_owner AND v_security
    AND v_search_path AND v_grants AND v_candidate_sequence;
  RAISE EXCEPTION 'probe.candidate_evidence_captured_force_rollback';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
  IF v_error<>'probe.candidate_evidence_captured_force_rollback' THEN RAISE; END IF;
 END;

 SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) INTO v_restored_md5
 FROM pg_catalog.pg_proc AS p
 WHERE p.oid=pg_catalog.to_regprocedure('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)');
 SELECT last_value=v_original_sequence,is_called IS NOT DISTINCT FROM v_original_is_called
 INTO v_sequence_value_restored,v_sequence_called_restored FROM public.dg_native_job_reference_seq;
 v_restored_current:=v_restored_md5=v_expected_md5;
 IF NOT v_restored_current OR NOT v_sequence_value_restored OR NOT v_sequence_called_restored
 THEN RAISE EXCEPTION 'probe.restoration_failed'; END IF;

 INSERT INTO pg_temp.doorgo_transferred_biztrack_update_probe_results VALUES (
  'combined_candidate_and_restoration',v_candidate_md5,v_preservation,v_obsolete_absent,v_signature,v_allowlist,
  v_mappings,v_validator,v_stale,v_archive_merge,v_revision,v_owner,v_security,v_search_path,v_grants,
  v_candidate_sequence,v_candidate_passed,v_restored_md5,v_restored_current,v_sequence_value_restored,
  v_sequence_called_restored,v_candidate_passed AND v_restored_current AND v_sequence_value_restored AND v_sequence_called_restored
 );
END;
$probe$;

SELECT result_label,candidate_function_md5,transferred_biztrack_preserved_from_sales_order,
 obsolete_legacy_job_id_source_absent,exact_update_signature_present,all_four_allowlist_keys_present,
 all_four_persistence_mappings_present,validator_call_present,stale_revision_guard_present,
 archive_and_merge_behavior_present,revision_increment_present,owner_correct,security_definer_correct,
 empty_search_path_correct,grants_correct,sequence_unchanged_while_candidate_installed,
 candidate_contract_passed,restored_function_md5,restored_current_md5,sequence_last_value_unchanged,
 sequence_is_called_unchanged,overall_probe_passed
FROM pg_temp.doorgo_transferred_biztrack_update_probe_results;
