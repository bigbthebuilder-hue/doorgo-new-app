-- READ-ONLY DOORGO LEGACY-TRANSFER HOSTED PREFLIGHT — NO DATA OR SCHEMA CHANGES
-- One consolidated result set. Run once immediately before separately authorized application.
WITH
planned_columns(name) AS (VALUES
 ('transfer_source_system'),('transfer_schema'),('transfer_version'),('transfer_source_identifier_kind'),
 ('transfer_source_identifier_value'),('transfer_source_saved_at'),('transfer_exported_at'),('transfer_source_fingerprint')
),
planned_constraints(name) AS (VALUES
 ('dg_native_jobs_transfer_fingerprint')
),
replaced_constraints(name) AS (VALUES
 ('dg_native_jobs_identifiers_present'),('dg_native_jobs_identifiers_trimmed'),('dg_native_jobs_visible_kind'),
 ('dg_native_jobs_visible_matches'),('dg_native_jobs_legacy_kind'),('dg_native_jobs_provenance')
),
planned_indexes(name) AS (VALUES
 ('dg_native_jobs_transfer_fingerprint_unique'),('dg_native_jobs_transfer_source_unique')
),
planned_routines(name,identity_arguments) AS (VALUES
 ('dg_enforce_native_job_identity_immutability',''),
 ('dg_create_transferred_native_job','p_command_id uuid, p_provenance jsonb, p_header jsonb, p_lines jsonb')
),
planned_triggers(name) AS (VALUES ('dg_native_jobs_identity_immutability')),
column_collisions AS (
 SELECT c.column_name,c.data_type,c.udt_name,c.is_nullable,c.column_default
 FROM information_schema.columns c JOIN planned_columns p ON p.name=c.column_name
 WHERE c.table_schema='public' AND c.table_name='dg_native_jobs'
),
named_collisions AS (
 SELECT 'constraint'::text object_kind,con.conname object_name,pg_catalog.pg_get_constraintdef(con.oid,true) definition
 FROM pg_catalog.pg_constraint con JOIN planned_constraints p ON p.name=con.conname
 UNION ALL SELECT 'index',i.indexname,i.indexdef FROM pg_catalog.pg_indexes i JOIN planned_indexes p ON p.name=i.indexname
 WHERE i.schemaname='public'
 UNION ALL SELECT 'trigger',t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true)
 FROM pg_catalog.pg_trigger t JOIN planned_triggers p ON p.name=t.tgname WHERE NOT t.tgisinternal
),
routine_collisions AS (
 SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
   pg_catalog.pg_get_userbyid(p.proowner) owner,p.prosecdef,pg_catalog.array_to_string(p.proconfig,',') configuration
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN planned_routines x ON x.name=p.proname AND x.identity_arguments=pg_catalog.pg_get_function_identity_arguments(p.oid)
 WHERE n.nspname='public'
),
replaced_constraint_evidence AS (
 SELECT con.conname,con.contype::text constraint_type,pg_catalog.pg_get_constraintdef(con.oid,true) definition
 FROM pg_catalog.pg_constraint con JOIN replaced_constraints x ON x.name=con.conname
 JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='dg_native_jobs'
),
native_columns AS (
 SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
 FROM information_schema.columns WHERE table_schema='public'
   AND table_name IN ('dg_native_jobs','dg_native_job_lines','dg_native_job_create_commands')
),
native_constraints AS (
 SELECT c.relname table_name,con.conname,con.contype::text constraint_type,pg_catalog.pg_get_constraintdef(con.oid,true) definition
 FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('dg_native_jobs','dg_native_job_lines','dg_native_job_create_commands')
),
native_indexes AS (
 SELECT tablename,indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname='public' AND tablename LIKE 'dg_native_job%'
),
native_routines AS (
 SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
   pg_catalog.pg_get_userbyid(p.proowner) owner,p.prosecdef,pg_catalog.array_to_string(p.proconfig,',') configuration,
   pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) definition_md5
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('dg_create_native_job','dg_update_native_job','dg_archive_native_job','dg_get_native_job','dg_list_native_jobs')
),
native_relations AS (
 SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relname IN ('dg_native_jobs','dg_native_job_lines','dg_native_job_create_commands')
),
native_policies AS (
 SELECT tablename,policyname,roles,cmd FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename LIKE 'dg_native_job%'
),
native_table_grants AS (
 SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name LIKE 'dg_native_job%'
),
native_routine_grants AS (
 SELECT grantee,routine_name,privilege_type FROM information_schema.role_routine_grants
 WHERE specific_schema='public' AND routine_name IN ('dg_create_native_job','dg_update_native_job','dg_archive_native_job','dg_get_native_job','dg_list_native_jobs')
),
native_sequence_grants AS (
 SELECT COALESCE(r.rolname,'PUBLIC') grantee,a.privilege_type FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(
   COALESCE(c.relacl,pg_catalog.acldefault('S'::pg_catalog."char",c.relowner))) a
 LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
 WHERE n.nspname='public' AND c.relname='dg_native_job_reference_seq'
),
native_runtime AS (
 SELECT 'dg_native_jobs'::text table_name,pg_catalog.count(*) row_count FROM public.dg_native_jobs
 UNION ALL SELECT 'dg_native_job_lines',pg_catalog.count(*) FROM public.dg_native_job_lines
 UNION ALL SELECT 'dg_native_job_create_commands',pg_catalog.count(*) FROM public.dg_native_job_create_commands
),
compatibility AS (
 SELECT pg_catalog.count(*) native_rows,
   pg_catalog.count(*) FILTER (WHERE origin='legacy_transfer') preexisting_transfer_rows,
   pg_catalog.count(*) FILTER (WHERE origin='native' AND door_go_reference IS NULL) invalid_native_reference_rows,
   pg_catalog.count(*) FILTER (WHERE origin='native' AND (legacy_job_id IS NOT NULL OR legacy_identifier_kind IS NOT NULL)) invalid_native_legacy_rows,
   pg_catalog.count(*) FILTER (WHERE legacy_job_id IS NOT NULL) existing_legacy_job_ids,
   pg_catalog.count(*) FILTER (WHERE visible_identifier='DG-000013' AND origin='native' AND revision=10 AND archived_at IS NOT NULL) accepted_dg_000013_rows,
   pg_catalog.count(DISTINCT pg_catalog.lower(pg_catalog.btrim(visible_identifier)))=pg_catalog.count(*) identifiers_unique
 FROM public.dg_native_jobs
),
sequence_state AS (
 SELECT s.last_value,s.is_called,q.seqstart start_value,q.seqincrement increment_by,q.seqcache cache_size,q.seqcycle cycle
 FROM public.dg_native_job_reference_seq s CROSS JOIN pg_catalog.pg_sequence q
 JOIN pg_catalog.pg_class c ON c.oid=q.seqrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='dg_native_job_reference_seq'
),
prerequisites AS (
 SELECT 'role'::text kind,r.rolname name,NULL::text detail FROM pg_catalog.pg_roles r
 WHERE r.rolname IN ('postgres','anon','authenticated','service_role')
 UNION ALL SELECT 'extension',e.extname,n.nspname FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
 WHERE e.extname IN ('pgcrypto','uuid-ossp')
 UNION ALL SELECT 'required_column',c.table_name||'.'||c.column_name,c.data_type FROM information_schema.columns c
 WHERE c.table_schema='public' AND ((c.table_name='dg_user_profiles' AND c.column_name IN ('user_id','active','is_manager'))
 OR (c.table_name='dg_user_permissions' AND c.column_name IN ('user_id','permission_key','access_level')))
),
default_privileges AS (
 SELECT pg_catalog.pg_get_userbyid(d.defaclrole) owner,n.nspname schema_name,d.defaclobjtype::text object_type,
   COALESCE(r.rolname,'PUBLIC') grantee,a.privilege_type
 FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
 WHERE n.nspname='public' AND COALESCE(r.rolname,'PUBLIC')='service_role'
),
operational_schema AS (
 SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
 FROM information_schema.columns WHERE table_schema='public' AND (table_name LIKE 'dg_production%'
 OR table_name LIKE 'dg_calendar%' OR table_name='dg_daily_capacity' OR table_name LIKE 'dg_fulfillment%'
 OR table_name LIKE 'dg_document%' OR table_name LIKE 'dg_email%')
),
optional_operational_relations AS (
 SELECT name,pg_catalog.to_regclass('public.'||name) IS NOT NULL relation_exists
 FROM (VALUES ('dg_documents'),('dg_document_moves'),('dg_fulfillment'),('dg_emails'),('dg_email_events')) x(name)
),
sections AS (
 SELECT 1 section_number,'planned_column_collisions'::text section_name,pg_catalog.count(*) row_count,COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.column_name),'[]'::jsonb) results_json FROM column_collisions x
 UNION ALL SELECT 2,'planned_named_object_collisions',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.object_kind,x.object_name),'[]'::jsonb) FROM named_collisions x
 UNION ALL SELECT 3,'planned_routine_collisions',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.proname),'[]'::jsonb) FROM routine_collisions x
 UNION ALL SELECT 4,'replaced_constraint_evidence',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.conname),'[]'::jsonb) FROM replaced_constraint_evidence x
 UNION ALL SELECT 5,'native_schema',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.table_name,x.ordinal_position),'[]'::jsonb) FROM native_columns x
 UNION ALL SELECT 6,'native_constraints',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.table_name,x.conname),'[]'::jsonb) FROM native_constraints x
 UNION ALL SELECT 7,'native_indexes',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.tablename,x.indexname),'[]'::jsonb) FROM native_indexes x
 UNION ALL SELECT 8,'native_routines',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.proname),'[]'::jsonb) FROM native_routines x
 UNION ALL SELECT 9,'native_security',1,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('relations',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)) FROM native_relations x),'policies',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM native_policies x),'table_grants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM native_table_grants x),'rpc_grants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM native_routine_grants x),'sequence_grants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM native_sequence_grants x)))
 UNION ALL SELECT 10,'native_runtime_and_compatibility',1,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('counts',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.table_name) FROM native_runtime x),'compatibility',(SELECT pg_catalog.to_jsonb(x) FROM compatibility x)))
 UNION ALL SELECT 11,'sequence_state',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM sequence_state x
 UNION ALL SELECT 12,'prerequisites_and_default_privileges',1,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('prerequisites',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.kind,x.name) FROM prerequisites x),'service_role_default_privileges',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) FROM default_privileges x)))
 UNION ALL SELECT 13,'accepted_baseline_counts',8,pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('name','native_jobs','count',(SELECT pg_catalog.count(*) FROM public.dg_native_jobs)),pg_catalog.jsonb_build_object('name','native_lines','count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines)),pg_catalog.jsonb_build_object('name','native_commands','count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_create_commands)),pg_catalog.jsonb_build_object('name','legacy_jobs','count',(SELECT pg_catalog.count(*) FROM public.dg_jobs)),pg_catalog.jsonb_build_object('name','legacy_lines','count',(SELECT pg_catalog.count(*) FROM public.dg_job_lines)),pg_catalog.jsonb_build_object('name','production_bookings','count',(SELECT pg_catalog.count(*) FROM public.dg_production_bookings)),pg_catalog.jsonb_build_object('name','calendar_links','count',(SELECT pg_catalog.count(*) FROM public.dg_calendar_links)),pg_catalog.jsonb_build_object('name','daily_capacity','count',(SELECT pg_catalog.count(*) FROM public.dg_daily_capacity)))
 UNION ALL SELECT 14,'optional_operational_relations',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.name),'[]'::jsonb) FROM optional_operational_relations x
 UNION ALL SELECT 15,'operational_schema_marker',pg_catalog.count(*),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('rows',pg_catalog.count(*),'md5',pg_catalog.md5(COALESCE(pg_catalog.string_agg(table_name||'|'||ordinal_position::text||'|'||column_name||'|'||data_type||'|'||udt_name||'|'||is_nullable||'|'||COALESCE(column_default,''),E'\n' ORDER BY table_name,ordinal_position),'')))) FROM operational_schema
)
SELECT section_number,section_name,row_count,results_json FROM sections ORDER BY section_number;
