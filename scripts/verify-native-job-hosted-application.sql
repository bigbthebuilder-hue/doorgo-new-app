-- DOORGO NATIVE-JOB HOSTED APPLICATION VERIFICATION
-- PORTION 1 is permanently read-only. Run and export it separately.
-- PORTION 2 writes only controlled test state inside a transaction and ends with ROLLBACK.
-- PostgreSQL sequences are nontransactional: allocator tests permanently consume test suffixes.

-- ==================== PORTION 1: PERMANENT READ-ONLY VERIFICATION ====================
WITH
expected_routines(name,identity_arguments) AS (VALUES
  ('dg_create_native_job','p_command_id uuid, p_origin text, p_legacy_job_id text, p_legacy_identifier_kind text, p_header jsonb, p_lines jsonb'),
  ('dg_update_native_job','p_internal_job_id uuid, p_expected_revision bigint, p_header jsonb, p_lines jsonb'),
  ('dg_archive_native_job','p_internal_job_id uuid, p_expected_revision bigint, p_reason text'),
  ('dg_get_native_job','p_internal_job_id uuid, p_include_archived boolean'),
  ('dg_list_native_jobs','p_include_archived boolean, p_limit integer, p_cursor_updated_at timestamp with time zone, p_cursor_internal_job_id uuid')
),
native_relations AS (
  SELECT c.relname,c.relkind::text,n.nspname,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('dg_native_jobs','dg_native_job_lines','dg_native_job_create_commands','dg_native_job_reference_seq')
),
native_routines AS (
  SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.prosecdef,
    pg_catalog.array_to_string(p.proconfig,',') AS configuration
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'dg_%native_job%'
),
update_function_evidence AS (
  SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.prosecdef,
    pg_catalog.array_to_string(p.proconfig,',') AS configuration,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS function_definition_md5,
    pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid),'GREATEST(')>0 AS contains_valid_greatest,
    pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)),'pg_catalog.'||'greatest(')>0
      AS contains_invalid_pg_catalog_greatest
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='dg_update_native_job'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)=
      'p_internal_job_id uuid, p_expected_revision bigint, p_header jsonb, p_lines jsonb'
),
native_columns AS (
  SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('dg_native_jobs','dg_native_job_lines','dg_native_job_create_commands')
),
native_constraints AS (
  SELECT c.relname AS table_name,con.conname,con.contype::text AS constraint_type,
    pg_catalog.pg_get_constraintdef(con.oid,true) AS definition
  FROM pg_catalog.pg_constraint AS con JOIN pg_catalog.pg_class AS c ON c.oid=con.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'dg_native_job%'
),
native_indexes AS (
  SELECT tablename,indexname,indexdef FROM pg_catalog.pg_indexes
  WHERE schemaname='public' AND tablename LIKE 'dg_native_job%'
),
native_grants AS (
  SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name LIKE 'dg_native_job%'
),
routine_grants AS (
  SELECT grantee,routine_name,privilege_type FROM information_schema.role_routine_grants
  WHERE specific_schema='public' AND routine_name LIKE 'dg_%native_job%'
),
sequence_grants AS (
  SELECT COALESCE(role.rolname,'PUBLIC') AS grantee,acl.privilege_type,acl.is_grantable
  FROM pg_catalog.pg_class AS seq_class
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=seq_class.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    seq_class.relacl,pg_catalog.acldefault('S'::pg_catalog."char",seq_class.relowner)
  )) AS acl
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid=acl.grantee
  WHERE namespace.nspname='public' AND seq_class.relkind::text='S'
    AND seq_class.relname='dg_native_job_reference_seq'
),
native_policies AS (
  SELECT schemaname,tablename,policyname,roles,cmd FROM pg_catalog.pg_policies
  WHERE schemaname='public' AND tablename LIKE 'dg_native_job%'
),
legacy_schema AS (
  SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('dg_jobs','dg_job_lines')
),
operational_schema AS (
  SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public'
    AND (table_name LIKE 'dg_production%' OR table_name LIKE 'dg_calendar%'
      OR table_name='dg_daily_capacity' OR table_name LIKE 'dg_fulfillment%'
      OR table_name LIKE 'dg_document%' OR table_name LIKE 'dg_email%')
),
sections AS (
  SELECT 1 AS section_number,'native_relations'::text AS section_name,pg_catalog.count(*) AS row_count,
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.relname),'[]'::jsonb) AS results_json FROM native_relations AS x
  UNION ALL SELECT 2,'native_columns',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.table_name,x.ordinal_position),'[]'::jsonb) FROM native_columns AS x
  UNION ALL SELECT 3,'native_constraints',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.table_name,x.conname),'[]'::jsonb) FROM native_constraints AS x
  UNION ALL SELECT 4,'native_indexes',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.tablename,x.indexname),'[]'::jsonb) FROM native_indexes AS x
  UNION ALL SELECT 5,'native_routines',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.proname),'[]'::jsonb) FROM native_routines AS x
  UNION ALL SELECT 6,'missing_or_mismatched_rpcs',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) ORDER BY e.name),'[]'::jsonb)
    FROM expected_routines AS e WHERE NOT EXISTS (SELECT 1 FROM native_routines AS r WHERE r.proname=e.name AND r.identity_arguments=e.identity_arguments)
  UNION ALL SELECT 7,'native_table_grants',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.table_name,x.grantee,x.privilege_type),'[]'::jsonb) FROM native_grants AS x
  UNION ALL SELECT 8,'native_rpc_grants',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.routine_name,x.grantee),'[]'::jsonb) FROM routine_grants AS x
  UNION ALL SELECT 9,'sequence_state',1,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'start_value',s.seqstart,'increment_by',s.seqincrement,'min_value',s.seqmin,'max_value',s.seqmax,'cache_size',s.seqcache))
    FROM pg_catalog.pg_sequence AS s JOIN pg_catalog.pg_class AS c ON c.oid=s.seqrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='dg_native_job_reference_seq'
  UNION ALL SELECT 10,'legacy_mirror_schema',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.table_name,x.ordinal_position),'[]'::jsonb) FROM legacy_schema AS x
  UNION ALL SELECT 11,'legacy_and_operational_counts',5,pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('table_name','dg_jobs','row_count',(SELECT pg_catalog.count(*) FROM public.dg_jobs)),
    pg_catalog.jsonb_build_object('table_name','dg_job_lines','row_count',(SELECT pg_catalog.count(*) FROM public.dg_job_lines)),
    pg_catalog.jsonb_build_object('table_name','dg_production_bookings','row_count',(SELECT pg_catalog.count(*) FROM public.dg_production_bookings)),
    pg_catalog.jsonb_build_object('table_name','dg_calendar_links','row_count',(SELECT pg_catalog.count(*) FROM public.dg_calendar_links)),
    pg_catalog.jsonb_build_object('table_name','dg_daily_capacity','row_count',(SELECT pg_catalog.count(*) FROM public.dg_daily_capacity)))
  UNION ALL SELECT 12,'operational_schema_marker',pg_catalog.count(*),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'catalog_row_count',pg_catalog.count(*),'catalog_md5',pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      table_name||'|'||ordinal_position::text||'|'||column_name||'|'||data_type||'|'||udt_name||'|'||is_nullable||'|'||COALESCE(column_default,''),
      E'\n' ORDER BY table_name,ordinal_position),'')))) FROM operational_schema
  UNION ALL SELECT 13,'fail_closed_security_summary',1,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'all_tables_rls_enabled',NOT EXISTS (SELECT 1 FROM native_relations WHERE relkind='r' AND NOT relrowsecurity),
    'no_table_forced_rls',NOT EXISTS (SELECT 1 FROM native_relations WHERE relkind='r' AND relforcerowsecurity),
    'policy_count',(SELECT pg_catalog.count(*) FROM native_policies),
    'all_rpc_owners_postgres',(
      (SELECT pg_catalog.count(*) FROM native_routines)=5
      AND NOT EXISTS (SELECT 1 FROM native_routines WHERE owner<>'postgres')
      AND NOT EXISTS (SELECT 1 FROM native_routines AS r WHERE NOT EXISTS (
        SELECT 1 FROM expected_routines AS e WHERE e.name=r.proname AND e.identity_arguments=r.identity_arguments))
    ),
    'update_function_contract_passed',EXISTS (SELECT 1 FROM update_function_evidence
      WHERE owner='postgres' AND prosecdef=true AND configuration='search_path=""'
        AND contains_valid_greatest=true AND contains_invalid_pg_catalog_greatest=false),
    'forbidden_direct_table_grant_count',(SELECT pg_catalog.count(*) FROM native_grants
      WHERE grantee IN ('PUBLIC','anon','authenticated','service_role')),
    'authenticated_rpc_grant_count',(SELECT pg_catalog.count(*) FROM routine_grants
      WHERE grantee='authenticated' AND privilege_type='EXECUTE'),
    'postgres_owner_rpc_grant_count',(SELECT pg_catalog.count(*) FROM routine_grants
      WHERE grantee='postgres' AND privilege_type='EXECUTE'),
    'service_role_rpc_grant_count',(SELECT pg_catalog.count(*) FROM routine_grants
      WHERE grantee='service_role'),
    'other_unexpected_rpc_grant_count',(SELECT pg_catalog.count(*) FROM routine_grants
      WHERE grantee NOT IN ('postgres','authenticated') OR privilege_type<>'EXECUTE'),
    'rpc_grant_contract_passed',(
      (SELECT pg_catalog.count(*) FROM routine_grants WHERE grantee='authenticated' AND privilege_type='EXECUTE')=5
      AND (SELECT pg_catalog.count(*) FROM routine_grants WHERE grantee='postgres' AND privilege_type='EXECUTE')=5
      AND NOT EXISTS (SELECT 1 FROM routine_grants WHERE grantee NOT IN ('postgres','authenticated') OR privilege_type<>'EXECUTE')
    ),
    'forbidden_direct_sequence_grant_count',(SELECT pg_catalog.count(*) FROM sequence_grants
      WHERE grantee IN ('PUBLIC','anon','authenticated','service_role'))))
  UNION ALL SELECT 14,'native_sequence_grants',pg_catalog.count(*),COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.grantee,x.privilege_type),'[]'::jsonb)
    FROM sequence_grants AS x
  UNION ALL SELECT 15,'update_function_evidence',pg_catalog.count(*),COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.proname,x.identity_arguments),'[]'::jsonb)
    FROM update_function_evidence AS x
)
SELECT section_number,section_name,row_count,results_json FROM sections ORDER BY section_number;

-- ==================== PORTION 2: TRANSACTION-ROLLED-BACK BEHAVIORAL TESTS ====================
BEGIN;
DO $acceptance$
DECLARE
  v_actor uuid;
  v_original_active boolean;
  v_original_manager boolean;
  v_original_access text;
  v_command uuid:=extensions.gen_random_uuid();
  v_second_command uuid:=extensions.gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_job_id uuid;
  v_line_one uuid;
  v_line_two uuid;
  v_reference text;
  v_reference_suffix bigint;
  v_sequence_last bigint;
  v_sequence_is_called boolean;
  v_sequence_position bigint;
  v_revision bigint;
  v_page jsonb;
  v_cursor_time timestamptz;
  v_cursor_id uuid;
  v_expected_failure boolean;
  v_legacy_jobs bigint:=(SELECT pg_catalog.count(*) FROM public.dg_jobs);
  v_legacy_lines bigint:=(SELECT pg_catalog.count(*) FROM public.dg_job_lines);
  v_production bigint:=(SELECT pg_catalog.count(*) FROM public.dg_production_bookings);
  v_calendar bigint:=(SELECT pg_catalog.count(*) FROM public.dg_calendar_links);
  v_capacity bigint:=(SELECT pg_catalog.count(*) FROM public.dg_daily_capacity);
  v_header jsonb:=pg_catalog.jsonb_build_object('customer','NON-PRODUCTION NATIVE ACCEPTANCE','lifecycle_stage','Draft','po_numbers','[]'::jsonb);
  v_lines jsonb:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('line_index',1,'mode','Interior','config','S','width','36','height','80','qty',1),
    pg_catalog.jsonb_build_object('line_index',2,'mode','Interior','config','S','width','34','height','80','qty',1));
BEGIN
  SELECT profile.user_id,profile.active,profile.is_manager,permission.access_level
    INTO v_actor,v_original_active,v_original_manager,v_original_access
  FROM public.dg_user_profiles AS profile JOIN public.dg_user_permissions AS permission ON permission.user_id=profile.user_id
  WHERE profile.active=true AND permission.permission_key='jobs' AND permission.access_level='use'
  ORDER BY profile.user_id LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'acceptance.no_active_jobs_use_actor'; END IF;
  IF (SELECT pg_catalog.count(*) FROM public.dg_user_profiles AS profile JOIN public.dg_user_permissions AS permission ON permission.user_id=profile.user_id
    WHERE profile.active=true AND permission.permission_key='jobs' AND permission.access_level='use')<>1
  THEN RAISE EXCEPTION 'acceptance.controlled_actor_not_unique'; END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);

  SELECT state.last_value,state.is_called INTO v_sequence_last,v_sequence_is_called
  FROM public.dg_native_job_reference_seq AS state;
  v_sequence_position:=CASE WHEN v_sequence_is_called THEN v_sequence_last ELSE v_sequence_last-1 END;

  v_result:=public.dg_create_native_job(v_command,'native',NULL,NULL,v_header,v_lines);
  v_job_id:=(v_result->'job'->>'internal_job_id')::uuid;
  v_reference:=v_result->'job'->>'door_go_reference';
  IF v_reference !~ '^DG-[0-9]{6}$' THEN RAISE EXCEPTION 'acceptance.created_reference_format_failed'; END IF;
  v_reference_suffix:=pg_catalog.substring(v_reference,4)::bigint;
  IF v_reference_suffix<=v_sequence_position
    OR v_reference_suffix<>(SELECT state.last_value FROM public.dg_native_job_reference_seq AS state)
    OR EXISTS (SELECT 1 FROM public.dg_native_jobs AS job
      WHERE job.internal_job_id<>v_job_id AND (job.door_go_reference=v_reference OR job.visible_identifier=v_reference))
    OR EXISTS (SELECT 1 FROM public.dg_jobs AS legacy WHERE legacy.job_id=v_reference)
  THEN RAISE EXCEPTION 'acceptance.created_reference_allocation_failed'; END IF;
  IF v_result->'job'->>'revision'<>'1' OR pg_catalog.jsonb_array_length(v_result->'lines')<>2
  THEN RAISE EXCEPTION 'acceptance.create_or_first_reference_failed'; END IF;
  v_line_one:=(v_result->'lines'->0->>'line_id')::uuid; v_line_two:=(v_result->'lines'->1->>'line_id')::uuid;
  v_replay:=public.dg_create_native_job(v_command,'native',NULL,NULL,v_header,v_lines);
  IF v_replay->>'idempotent_replay'<>'true' OR v_replay->'job'->>'internal_job_id'<>v_job_id::text
  THEN RAISE EXCEPTION 'acceptance.idempotent_replay_failed'; END IF;

  v_expected_failure:=false;
  BEGIN PERFORM public.dg_create_native_job(v_command,'native',NULL,NULL,v_header||'{"notes":"changed"}'::jsonb,v_lines);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%idempotency_conflict%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.command_conflict_not_rejected'; END IF;

  v_expected_failure:=false;
  BEGIN PERFORM public.dg_create_native_job(extensions.gen_random_uuid(),'legacy_transfer',v_reference,'door_go_reference',v_header,v_lines);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%duplicate_door_go_reference%' OR SQLERRM LIKE '%duplicate_identifier%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.duplicate_dg_not_rejected'; END IF;

  PERFORM public.dg_create_native_job(v_second_command,'native',NULL,NULL,
    v_header||pg_catalog.jsonb_build_object('biztrack_sales_order','ACCEPT-'||v_second_command::text),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line_index',1,'mode','Interior','config','S','width','32','height','80','qty',1)));
  v_expected_failure:=false;
  BEGIN PERFORM public.dg_create_native_job(extensions.gen_random_uuid(),'native',NULL,NULL,
    v_header||pg_catalog.jsonb_build_object('biztrack_sales_order','ACCEPT-'||v_second_command::text),v_lines);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%duplicate_sales_order%' OR SQLERRM LIKE '%duplicate_identifier%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.duplicate_sales_order_not_rejected'; END IF;

  v_result:=public.dg_update_native_job(v_job_id,1,v_header||'{"notes":"updated"}'::jsonb,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line_id',v_line_one,'line_index',1,'mode','Interior','config','S','width','36','height','80','qty',1)));
  v_revision:=(v_result->'job'->>'revision')::bigint;
  IF v_revision<>2 OR (v_result->'lines'->0->>'line_id')::uuid<>v_line_one
    OR NOT EXISTS (SELECT 1 FROM public.dg_native_job_lines WHERE line_id=v_line_two AND line_status='Archived')
  THEN RAISE EXCEPTION 'acceptance.update_line_identity_or_archive_failed'; END IF;
  v_expected_failure:=false;
  BEGIN PERFORM public.dg_update_native_job(v_job_id,1,v_header,v_lines);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%stale_revision%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.stale_update_not_rejected'; END IF;

  UPDATE public.dg_user_permissions SET access_level='view' WHERE user_id=v_actor AND permission_key='jobs';
  PERFORM public.dg_get_native_job(v_job_id,false); v_page:=public.dg_list_native_jobs(false,1,NULL,NULL);
  IF v_page->'page'->>'has_more'<>'true' THEN RAISE EXCEPTION 'acceptance.cursor_first_page_failed'; END IF;
  v_cursor_time:=(v_page->'page'->>'next_cursor_updated_at')::timestamptz;
  v_cursor_id:=(v_page->'page'->>'next_cursor_internal_job_id')::uuid;
  PERFORM public.dg_list_native_jobs(false,1,v_cursor_time,v_cursor_id);
  v_expected_failure:=false;
  BEGIN PERFORM public.dg_update_native_job(v_job_id,2,v_header,v_lines);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%permission_required%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.jobs_view_write_not_denied'; END IF;
  v_expected_failure:=false;
  BEGIN PERFORM public.dg_list_native_jobs(false,101,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%validation_failed%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.limit_not_rejected'; END IF;
  v_expected_failure:=false;
  BEGIN PERFORM public.dg_list_native_jobs(false,50,v_cursor_time,NULL);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%validation_failed%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.partial_cursor_not_rejected'; END IF;

  UPDATE public.dg_user_permissions SET access_level='use' WHERE user_id=v_actor AND permission_key='jobs';
  PERFORM public.dg_archive_native_job(v_job_id,2,'Controlled rolled-back acceptance');
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(public.dg_list_native_jobs(false,100,NULL,NULL)->'items') AS item
    WHERE item->>'internal_job_id'=v_job_id::text) THEN RAISE EXCEPTION 'acceptance.archived_default_exclusion_failed'; END IF;

  UPDATE public.dg_user_profiles SET active=false WHERE user_id=v_actor;
  v_expected_failure:=false;
  BEGIN PERFORM public.dg_list_native_jobs(false,50,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%active_profile_required%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.inactive_not_denied'; END IF;
  UPDATE public.dg_user_profiles SET active=true,is_manager=true WHERE user_id=v_actor;
  UPDATE public.dg_user_permissions SET access_level='none' WHERE user_id=v_actor AND permission_key='jobs';
  v_expected_failure:=false;
  BEGIN PERFORM public.dg_list_native_jobs(false,50,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%permission_required%' THEN v_expected_failure:=true; ELSE RAISE; END IF; END;
  IF NOT v_expected_failure THEN RAISE EXCEPTION 'acceptance.manager_fallback_or_jobs_none_not_denied'; END IF;
  UPDATE public.dg_user_profiles SET active=v_original_active,is_manager=v_original_manager WHERE user_id=v_actor;
  UPDATE public.dg_user_permissions SET access_level=v_original_access WHERE user_id=v_actor AND permission_key='jobs';

  IF v_legacy_jobs<>(SELECT pg_catalog.count(*) FROM public.dg_jobs)
    OR v_legacy_lines<>(SELECT pg_catalog.count(*) FROM public.dg_job_lines)
    OR v_production<>(SELECT pg_catalog.count(*) FROM public.dg_production_bookings)
    OR v_calendar<>(SELECT pg_catalog.count(*) FROM public.dg_calendar_links)
    OR v_capacity<>(SELECT pg_catalog.count(*) FROM public.dg_daily_capacity)
  THEN RAISE EXCEPTION 'acceptance.prohibited_data_mutation_detected'; END IF;
  RAISE NOTICE 'All controlled native-job behavioral assertions passed for reference %; transaction rollback follows.',v_reference;
END;
$acceptance$;
ROLLBACK;
