-- DOORGO LEGACY-TRANSFER HOSTED APPLICATION VERIFICATION
-- PORTION 1 is permanently read-only. Export and review it before and after PORTION 2.
-- PORTION 2 is controlled non-production data inside one transaction ending in ROLLBACK.

-- ==================== PORTION 1: PERMANENT READ-ONLY VERIFICATION ====================
WITH
expected_columns(name,data_type,udt_name,is_nullable,column_default) AS (VALUES
 ('transfer_source_system','text','text','YES',NULL::text),('transfer_schema','text','text','YES',NULL),
 ('transfer_version','integer','int4','YES',NULL),('transfer_source_identifier_kind','text','text','YES',NULL),
 ('transfer_source_identifier_value','text','text','YES',NULL),('transfer_source_saved_at','timestamp with time zone','timestamptz','YES',NULL),
 ('transfer_exported_at','timestamp with time zone','timestamptz','YES',NULL),('transfer_source_fingerprint','text','text','YES',NULL)
),
actual_columns AS (
 SELECT column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name='dg_native_jobs'
),
expected_routines(name,identity_arguments) AS (VALUES
 ('dg_create_native_job','p_command_id uuid, p_origin text, p_legacy_job_id text, p_legacy_identifier_kind text, p_header jsonb, p_lines jsonb'),
 ('dg_update_native_job','p_internal_job_id uuid, p_expected_revision bigint, p_header jsonb, p_lines jsonb'),
 ('dg_archive_native_job','p_internal_job_id uuid, p_expected_revision bigint, p_reason text'),
 ('dg_get_native_job','p_internal_job_id uuid, p_include_archived boolean'),
 ('dg_list_native_jobs','p_include_archived boolean, p_limit integer, p_cursor_updated_at timestamp with time zone, p_cursor_internal_job_id uuid'),
 ('dg_create_transferred_native_job','p_command_id uuid, p_provenance jsonb, p_header jsonb, p_lines jsonb'),
 ('dg_enforce_native_job_identity_immutability','')
),
routines AS (
 SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
  pg_catalog.pg_get_userbyid(p.proowner) owner,p.prosecdef,pg_catalog.array_to_string(p.proconfig,',') configuration,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) definition_md5,
  pg_catalog.pg_get_functiondef(p.oid) definition
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND EXISTS(SELECT 1 FROM expected_routines e WHERE e.name=p.proname
   AND e.identity_arguments=pg_catalog.pg_get_function_identity_arguments(p.oid))
),
constraints AS (
 SELECT con.conname,con.contype::text constraint_type,pg_catalog.pg_get_constraintdef(con.oid,true) definition
 FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='dg_native_jobs'
),
indexes AS (
 SELECT indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname='public' AND tablename='dg_native_jobs'
),
triggers AS (
 SELECT t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true) definition FROM pg_catalog.pg_trigger t
 JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='dg_native_jobs' AND NOT t.tgisinternal
),
relations AS (
 SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relname IN ('dg_native_jobs','dg_native_job_lines','dg_native_job_create_commands')
),
policies AS (
 SELECT tablename,policyname,roles,cmd FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename LIKE 'dg_native_job%'
),
table_grants AS (
 SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name LIKE 'dg_native_job%'
),
rpc_grants AS (
 SELECT grantee,routine_name,privilege_type FROM information_schema.role_routine_grants
 WHERE specific_schema='public' AND EXISTS(SELECT 1 FROM expected_routines e WHERE e.name=routine_name)
),
sequence_grants AS (
 SELECT COALESCE(r.rolname,'PUBLIC') grantee,a.privilege_type FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(c.relacl,pg_catalog.acldefault('S'::pg_catalog."char",c.relowner))) a
 LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee WHERE n.nspname='public' AND c.relname='dg_native_job_reference_seq'
),
sequence_state AS (
 SELECT s.last_value,s.is_called,q.seqstart start_value,q.seqincrement increment_by,q.seqcache cache_size,q.seqcycle cycle
 FROM public.dg_native_job_reference_seq s CROSS JOIN pg_catalog.pg_sequence q
 JOIN pg_catalog.pg_class c ON c.oid=q.seqrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='dg_native_job_reference_seq'
),
runtime AS (
 SELECT 'native_jobs'::text name,pg_catalog.count(*) count FROM public.dg_native_jobs
 UNION ALL SELECT 'native_lines',pg_catalog.count(*) FROM public.dg_native_job_lines
 UNION ALL SELECT 'native_commands',pg_catalog.count(*) FROM public.dg_native_job_create_commands
 UNION ALL SELECT 'legacy_jobs',pg_catalog.count(*) FROM public.dg_jobs
 UNION ALL SELECT 'legacy_lines',pg_catalog.count(*) FROM public.dg_job_lines
 UNION ALL SELECT 'production_bookings',pg_catalog.count(*) FROM public.dg_production_bookings
 UNION ALL SELECT 'calendar_links',pg_catalog.count(*) FROM public.dg_calendar_links
 UNION ALL SELECT 'daily_capacity',pg_catalog.count(*) FROM public.dg_daily_capacity
),
dg_000013 AS (
 SELECT internal_job_id,visible_identifier,origin,revision,archived_at,archive_reason,
  transfer_source_system,transfer_schema,transfer_version,transfer_source_identifier_kind,
  transfer_source_identifier_value,transfer_source_saved_at,transfer_exported_at,transfer_source_fingerprint,
  (SELECT pg_catalog.count(*) FROM public.dg_native_job_lines l WHERE l.internal_job_id=j.internal_job_id) line_count,
  (SELECT pg_catalog.count(*) FROM public.dg_native_job_create_commands c WHERE c.internal_job_id=j.internal_job_id) receipt_count
 FROM public.dg_native_jobs j WHERE visible_identifier='DG-000013'
),
operational_schema AS (
 SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
 FROM information_schema.columns WHERE table_schema='public' AND (table_name LIKE 'dg_production%'
 OR table_name LIKE 'dg_calendar%' OR table_name='dg_daily_capacity' OR table_name LIKE 'dg_fulfillment%'
 OR table_name LIKE 'dg_document%' OR table_name LIKE 'dg_email%')
),
summary AS (
 SELECT pg_catalog.jsonb_build_object(
  'all_new_columns_exact',NOT EXISTS(SELECT 1 FROM expected_columns e WHERE NOT EXISTS(SELECT 1 FROM actual_columns a WHERE a.column_name=e.name AND a.data_type=e.data_type AND a.udt_name=e.udt_name AND a.is_nullable=e.is_nullable AND a.column_default IS NOT DISTINCT FROM e.column_default)),
  'all_seven_routines_exact',(SELECT pg_catalog.count(*) FROM routines)=7,
  'all_routine_owners_postgres',NOT EXISTS(SELECT 1 FROM routines WHERE owner<>'postgres'),
  'all_routines_fixed_empty_search_path',NOT EXISTS(SELECT 1 FROM routines WHERE configuration IS DISTINCT FROM 'search_path=""'),
  'transfer_rpc_security_definer',EXISTS(SELECT 1 FROM routines WHERE proname='dg_create_transferred_native_job' AND prosecdef),
  'transfer_rpc_has_no_nextval',NOT EXISTS(SELECT 1 FROM routines WHERE proname='dg_create_transferred_native_job' AND pg_catalog.lower(definition) LIKE '%nextval(%'),
  'transfer_rpc_has_no_legacy_or_operational_reference',NOT EXISTS(SELECT 1 FROM routines WHERE proname='dg_create_transferred_native_job' AND pg_catalog.lower(definition) ~ 'dg_jobs|dg_job_lines|dg_production|dg_calendar|dg_daily_capacity|dg_fulfillment|dg_document|dg_email'),
  'immutability_trigger_present',EXISTS(SELECT 1 FROM triggers WHERE tgname='dg_native_jobs_identity_immutability'),
  'immutability_function_contract',EXISTS(SELECT 1 FROM routines WHERE proname='dg_enforce_native_job_identity_immutability' AND definition LIKE '%OLD.legacy_job_id IS DISTINCT FROM NEW.legacy_job_id%' AND definition LIKE '%OLD.transfer_source_fingerprint IS DISTINCT FROM NEW.transfer_source_fingerprint%' AND definition LIKE '%native_job.immutable_provenance%'),
  'get_exposes_complete_job_row',EXISTS(SELECT 1 FROM routines WHERE proname='dg_get_native_job' AND definition LIKE '%pg_catalog.to_jsonb(job)%'),
  'list_exposes_unified_legacy_identifier',EXISTS(SELECT 1 FROM routines WHERE proname='dg_list_native_jobs' AND definition LIKE '%'||'''legacy_job_id'''||',job.legacy_job_id%' AND definition LIKE '%'||'''visible_identifier_kind'''||',job.visible_identifier_kind%'),
  'all_revised_constraints_present',(SELECT pg_catalog.count(*) FROM constraints WHERE conname IN ('dg_native_jobs_identifiers_present','dg_native_jobs_identifiers_trimmed','dg_native_jobs_visible_kind','dg_native_jobs_visible_matches','dg_native_jobs_legacy_kind','dg_native_jobs_transfer_fingerprint','dg_native_jobs_provenance'))=7,
  'fingerprint_constraint_present',EXISTS(SELECT 1 FROM constraints WHERE conname='dg_native_jobs_transfer_fingerprint'),
  'transfer_indexes_present',(SELECT pg_catalog.count(*) FROM indexes WHERE indexname IN ('dg_native_jobs_transfer_fingerprint_unique','dg_native_jobs_transfer_source_unique'))=2,
  'rls_enabled_zero_policies',NOT EXISTS(SELECT 1 FROM relations WHERE NOT relrowsecurity) AND NOT EXISTS(SELECT 1 FROM policies),
  'zero_forbidden_table_grants',NOT EXISTS(SELECT 1 FROM table_grants WHERE grantee IN ('PUBLIC','anon','authenticated','service_role')),
  'zero_forbidden_sequence_grants',NOT EXISTS(SELECT 1 FROM sequence_grants WHERE grantee IN ('PUBLIC','anon','authenticated','service_role')),
  'exact_authenticated_rpc_grants',(SELECT pg_catalog.count(*) FROM rpc_grants WHERE grantee='authenticated' AND privilege_type='EXECUTE')=6,
  'zero_public_anon_service_role_rpc_grants',NOT EXISTS(SELECT 1 FROM rpc_grants WHERE grantee IN ('PUBLIC','anon','service_role')),
  'dg_000013_unchanged',EXISTS(SELECT 1 FROM dg_000013 WHERE origin='native' AND revision=10 AND archived_at IS NOT NULL AND line_count=2 AND receipt_count=1 AND transfer_source_system IS NULL AND transfer_schema IS NULL AND transfer_version IS NULL AND transfer_source_identifier_kind IS NULL AND transfer_source_identifier_value IS NULL AND transfer_source_saved_at IS NULL AND transfer_exported_at IS NULL AND transfer_source_fingerprint IS NULL),
  'native_counts_accepted',EXISTS(SELECT 1 FROM runtime WHERE name='native_jobs' AND count=1) AND EXISTS(SELECT 1 FROM runtime WHERE name='native_lines' AND count=2) AND EXISTS(SELECT 1 FROM runtime WHERE name='native_commands' AND count=1),
  'existing_rpc_hashes_require_preflight_comparison',true,
  'sequence_state_requires_exact_preflight_comparison',true,
  'baseline_requires_preflight_comparison',true
 ) result
),
sections AS (
 SELECT 1 section_number,'new_columns'::text section_name,pg_catalog.count(*) row_count,COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.column_name),'[]'::jsonb) results_json FROM actual_columns a WHERE a.column_name IN (SELECT name FROM expected_columns)
 UNION ALL SELECT 2,'constraints',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.conname),'[]'::jsonb) FROM constraints x
 UNION ALL SELECT 3,'indexes',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.indexname),'[]'::jsonb) FROM indexes x
 UNION ALL SELECT 4,'triggers',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.tgname),'[]'::jsonb) FROM triggers x
 UNION ALL SELECT 5,'routine_contracts',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)-'definition' ORDER BY x.proname),'[]'::jsonb) FROM routines x
 UNION ALL SELECT 6,'transfer_function_evidence',1,pg_catalog.jsonb_build_array((SELECT pg_catalog.to_jsonb(x)-'definition' FROM routines x WHERE x.proname='dg_create_transferred_native_job'))
 UNION ALL SELECT 7,'security',1,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('relations',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)) FROM relations x),'policies',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM policies x),'table_grants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM table_grants x),'rpc_grants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM rpc_grants x),'sequence_grants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM sequence_grants x)))
 UNION ALL SELECT 8,'sequence_state',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM sequence_state x
 UNION ALL SELECT 9,'dg_000013_compatibility',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM dg_000013 x
 UNION ALL SELECT 10,'runtime_baselines',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.name),'[]'::jsonb) FROM runtime x
 UNION ALL SELECT 11,'operational_schema_marker',pg_catalog.count(*),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('rows',pg_catalog.count(*),'md5',pg_catalog.md5(COALESCE(pg_catalog.string_agg(table_name||'|'||ordinal_position::text||'|'||column_name||'|'||data_type||'|'||udt_name||'|'||is_nullable||'|'||COALESCE(column_default,''),E'\n' ORDER BY table_name,ordinal_position),'')))) FROM operational_schema
 UNION ALL SELECT 12,'permanent_verification_summary',1,pg_catalog.jsonb_build_array(result) FROM summary
)
SELECT section_number,section_name,row_count,results_json FROM sections ORDER BY section_number;

-- ==================== PORTION 2: ROLLED-BACK BEHAVIORAL ACCEPTANCE ====================
BEGIN;
DO $legacy_transfer_acceptance$
DECLARE
 v_actor uuid; v_before_sequence bigint; v_after_sequence bigint; v_before_counts jsonb; v_after_counts jsonb;
 v_header jsonb:=pg_catalog.jsonb_build_object('customer','NON-PRODUCTION TEST — LEGACY TRANSFER ACCEPTANCE','lifecycle_stage','Confirmed Job');
 v_lines jsonb:=pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('line_id','90000000-0000-4000-8000-000000000001','line_index',1,'line_status','Active','mode','Interior','config','D','width','2''6"','height','6''8"','qty',1),
  pg_catalog.jsonb_build_object('line_id','90000000-0000-4000-8000-000000000004','line_index',2,'line_status','Active','mode','Interior','config','D','width','3''0"','height','6''8"','qty',1));
 v_lines_dg jsonb; v_lines_job jsonb;
 v_so jsonb:=pg_catalog.jsonb_build_object('direction','legacy_to_native','source_system','legacy-doorgo','source_job_state','active','transfer_schema','doorgo.legacy-job-transfer','transfer_version',1,'source_identifier_kind','biztrack_sales_order','source_identifier_value','NONPROD-LT-SO-999991','source_saved_at','2026-07-30T00:00:00Z','exported_at','2026-07-30T00:01:00Z','source_fingerprint',pg_catalog.repeat('1',64));
 v_dg jsonb:=v_so||pg_catalog.jsonb_build_object('source_identifier_kind','door_go_reference','source_identifier_value','DG-999991','source_fingerprint',pg_catalog.repeat('2',64));
 v_job jsonb:=v_so||pg_catalog.jsonb_build_object('source_identifier_kind','legacy_job_id','source_identifier_value','JOB-999991','source_fingerprint',pg_catalog.repeat('3',64));
 r_so jsonb; r_dg jsonb; r_job jsonb; replay jsonb; v_error text; v_provenance jsonb;
BEGIN
 SELECT profile.user_id INTO v_actor FROM public.dg_user_profiles profile JOIN public.dg_user_permissions permission ON permission.user_id=profile.user_id
 WHERE profile.active=true AND permission.permission_key='jobs' AND permission.access_level='use' ORDER BY profile.user_id LIMIT 1;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'acceptance.no_jobs_use_actor'; END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_actor::text,true); PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
 SELECT last_value INTO v_before_sequence FROM public.dg_native_job_reference_seq;
 SELECT pg_catalog.jsonb_build_object('jobs',(SELECT pg_catalog.count(*) FROM public.dg_native_jobs),'lines',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines),'commands',(SELECT pg_catalog.count(*) FROM public.dg_native_job_create_commands),'legacy_jobs',(SELECT pg_catalog.count(*) FROM public.dg_jobs),'legacy_lines',(SELECT pg_catalog.count(*) FROM public.dg_job_lines),'production',(SELECT pg_catalog.count(*) FROM public.dg_production_bookings),'calendar',(SELECT pg_catalog.count(*) FROM public.dg_calendar_links),'capacity',(SELECT pg_catalog.count(*) FROM public.dg_daily_capacity)) INTO v_before_counts;
 IF EXISTS(SELECT 1 FROM public.dg_native_jobs WHERE door_go_reference IN ('DG-999991') OR legacy_job_id='JOB-999991' OR biztrack_sales_order='NONPROD-LT-SO-999991') THEN RAISE EXCEPTION 'acceptance.test_identifiers_occupied'; END IF;
 v_lines_dg:=pg_catalog.jsonb_set(pg_catalog.jsonb_set(v_lines,'{0,line_id}','"90000000-0000-4000-8000-000000000002"'::jsonb),'{1,line_id}','"90000000-0000-4000-8000-000000000005"'::jsonb);
 v_lines_job:=pg_catalog.jsonb_set(pg_catalog.jsonb_set(v_lines,'{0,line_id}','"90000000-0000-4000-8000-000000000003"'::jsonb),'{1,line_id}','"90000000-0000-4000-8000-000000000006"'::jsonb);
 r_so:=public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000011',v_so,v_header,v_lines);
 r_dg:=public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000012',v_dg,v_header,v_lines_dg);
 r_job:=public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000013',v_job,v_header,v_lines_job);
 IF (r_so#>>'{job,revision}')::integer<>1 OR r_so#>>'{job,visible_identifier}'<>'NONPROD-LT-SO-999991' OR r_so#>>'{job,visible_identifier_kind}'<>'biztrack_sales_order' OR r_so#>>'{job,door_go_reference}' IS NOT NULL THEN RAISE EXCEPTION 'acceptance.sales_order_path_failed'; END IF;
 IF r_dg#>>'{job,visible_identifier}'<>'DG-999991' OR r_dg#>>'{job,visible_identifier_kind}'<>'door_go_reference' OR r_dg#>>'{job,door_go_reference}'<>'DG-999991' THEN RAISE EXCEPTION 'acceptance.dg_path_failed'; END IF;
 IF r_job#>>'{job,visible_identifier}'<>'JOB-999991' OR r_job#>>'{job,visible_identifier_kind}'<>'legacy_job_id' OR r_job#>>'{job,legacy_job_id}'<>'JOB-999991' OR r_job#>>'{job,door_go_reference}' IS NOT NULL THEN RAISE EXCEPTION 'acceptance.legacy_job_path_failed'; END IF;
 IF pg_catalog.jsonb_array_length(r_so->'lines')<>2 OR r_so#>>'{lines,0,line_index}'<>'1' OR r_so#>>'{lines,1,line_index}'<>'2' OR r_so#>>'{lines,0,line_status}'<>'Active' OR r_so#>>'{lines,1,line_status}'<>'Active' THEN RAISE EXCEPTION 'acceptance.lines_failed'; END IF;
 replay:=public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000011',v_so,v_header,v_lines);
 IF replay->>'idempotent_replay'<>'true' OR replay#>>'{job,internal_job_id}'<>r_so#>>'{job,internal_job_id}' THEN RAISE EXCEPTION 'acceptance.idempotent_replay_failed'; END IF;
 IF (SELECT pg_catalog.count(*) FROM public.dg_native_job_create_commands WHERE internal_job_id IN ((r_so#>>'{job,internal_job_id}')::uuid,(r_dg#>>'{job,internal_job_id}')::uuid,(r_job#>>'{job,internal_job_id}')::uuid))<>3 THEN RAISE EXCEPTION 'acceptance.receipt_failed'; END IF;
 -- Every expected rejection is isolated in a subtransaction and must expose its safe token.
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000021',v_so||pg_catalog.jsonb_build_object('source_fingerprint',pg_catalog.repeat('4',64)),v_header,v_lines); RAISE EXCEPTION 'duplicate_sales_order_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%duplicate_sales_order%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000022',v_dg||pg_catalog.jsonb_build_object('source_fingerprint',pg_catalog.repeat('5',64)),v_header,v_lines); RAISE EXCEPTION 'duplicate_dg_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%duplicate_door_go_reference%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000023',v_job||pg_catalog.jsonb_build_object('source_fingerprint',pg_catalog.repeat('6',64)),v_header,v_lines); RAISE EXCEPTION 'duplicate_job_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%duplicate_legacy_job_id%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000024',v_so||pg_catalog.jsonb_build_object('source_identifier_value','NONPROD-OTHER'),v_header,v_lines); RAISE EXCEPTION 'duplicate_fingerprint_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%duplicate_source_fingerprint%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000025',v_so||pg_catalog.jsonb_build_object('source_fingerprint',pg_catalog.repeat('7',64)),v_header,v_lines); RAISE EXCEPTION 'duplicate_source_identity_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%duplicate%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000026',v_dg||pg_catalog.jsonb_build_object('source_identifier_value','DG-000013','source_fingerprint',pg_catalog.repeat('8',64)),v_header,v_lines); RAISE EXCEPTION 'native_dg_collision_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%duplicate_door_go_reference%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000027',v_so||pg_catalog.jsonb_build_object('source_job_state','archived','source_fingerprint',pg_catalog.repeat('9',64)),v_header,v_lines); RAISE EXCEPTION 'archived_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%invalid_transfer_provenance%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000031',v_so||pg_catalog.jsonb_build_object('source_job_state','deleted','source_fingerprint',pg_catalog.repeat('d',64)),v_header,v_lines); RAISE EXCEPTION 'deleted_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%invalid_transfer_provenance%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000028',v_so||pg_catalog.jsonb_build_object('direction','native_to_legacy','source_fingerprint',pg_catalog.repeat('a',64)),v_header,v_lines); RAISE EXCEPTION 'reverse_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%invalid_transfer_provenance%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000029',v_job||pg_catalog.jsonb_build_object('source_identifier_value','DG-999992','source_fingerprint',pg_catalog.repeat('b',64)),v_header,v_lines); RAISE EXCEPTION 'mismatch_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%invalid_identifier_kind%' THEN RAISE; END IF; END;
 v_provenance:=r_job->'job';
 BEGIN UPDATE public.dg_native_jobs SET transfer_source_fingerprint=pg_catalog.repeat('f',64) WHERE internal_job_id=(r_job#>>'{job,internal_job_id}')::uuid; RAISE EXCEPTION 'immutable_provenance_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%immutable_provenance%' THEN RAISE; END IF; END;
 PERFORM public.dg_archive_native_job((r_job#>>'{job,internal_job_id}')::uuid,1,'NON-PRODUCTION TEST COMPLETE');
 IF NOT EXISTS(SELECT 1 FROM public.dg_native_jobs WHERE internal_job_id=(r_job#>>'{job,internal_job_id}')::uuid AND transfer_source_fingerprint=v_provenance->>'transfer_source_fingerprint' AND revision=2 AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'archive_provenance_failed'; END IF;
 IF public.dg_get_native_job((r_so#>>'{job,internal_job_id}')::uuid,false)#>>'{job,visible_identifier}'<>'NONPROD-LT-SO-999991' THEN RAISE EXCEPTION 'get_failed'; END IF;
 IF NOT (public.dg_list_native_jobs(true,100,NULL,NULL)->'items' @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('visible_identifier','JOB-999991','visible_identifier_kind','legacy_job_id'))) THEN RAISE EXCEPTION 'list_failed'; END IF;
 IF pg_catalog.has_table_privilege('authenticated','public.dg_native_jobs','INSERT,UPDATE,DELETE') OR pg_catalog.has_sequence_privilege('authenticated','public.dg_native_job_reference_seq','USAGE,UPDATE') THEN RAISE EXCEPTION 'direct_access_exposed'; END IF;
 UPDATE public.dg_user_permissions SET access_level='view' WHERE user_id=v_actor AND permission_key='jobs';
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000032',v_so||pg_catalog.jsonb_build_object('source_identifier_value','NONPROD-VIEW-DENIED','source_fingerprint',pg_catalog.repeat('e',64)),v_header,v_lines); RAISE EXCEPTION 'jobs_view_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%permission_required%' THEN RAISE; END IF; END;
 UPDATE public.dg_user_permissions SET access_level='none' WHERE user_id=v_actor AND permission_key='jobs'; UPDATE public.dg_user_profiles SET is_manager=true WHERE user_id=v_actor;
 BEGIN PERFORM public.dg_create_transferred_native_job('90000000-0000-4000-8000-000000000030',v_so||pg_catalog.jsonb_build_object('source_identifier_value','NONPROD-DENIED','source_fingerprint',pg_catalog.repeat('c',64)),v_header,v_lines); RAISE EXCEPTION 'manager_fallback_not_rejected'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT; IF v_error NOT LIKE '%permission_required%' THEN RAISE; END IF; END;
 UPDATE public.dg_user_permissions SET access_level='use' WHERE user_id=v_actor AND permission_key='jobs';
 SELECT last_value INTO v_after_sequence FROM public.dg_native_job_reference_seq; IF v_after_sequence<>v_before_sequence THEN RAISE EXCEPTION 'acceptance.sequence_changed'; END IF;
 SELECT pg_catalog.jsonb_build_object('jobs',(SELECT pg_catalog.count(*)-3 FROM public.dg_native_jobs),'lines',(SELECT pg_catalog.count(*)-6 FROM public.dg_native_job_lines),'commands',(SELECT pg_catalog.count(*)-3 FROM public.dg_native_job_create_commands),'legacy_jobs',(SELECT pg_catalog.count(*) FROM public.dg_jobs),'legacy_lines',(SELECT pg_catalog.count(*) FROM public.dg_job_lines),'production',(SELECT pg_catalog.count(*) FROM public.dg_production_bookings),'calendar',(SELECT pg_catalog.count(*) FROM public.dg_calendar_links),'capacity',(SELECT pg_catalog.count(*) FROM public.dg_daily_capacity)) INTO v_after_counts;
 IF v_after_counts<>v_before_counts THEN RAISE EXCEPTION 'acceptance.prohibited_mutation_detected'; END IF;
 RAISE NOTICE 'LEGACY TRANSFER ROLLED-BACK BEHAVIORAL ACCEPTANCE PASSED; sequence remained %',v_after_sequence;
END;
$legacy_transfer_acceptance$;
ROLLBACK;
