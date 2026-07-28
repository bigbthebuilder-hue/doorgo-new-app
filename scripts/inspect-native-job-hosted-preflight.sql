-- READ-ONLY DOORGO NATIVE-JOB HOSTED PREFLIGHT — NO DATA OR SCHEMA CHANGES
-- Run immediately before the separately authorized migration application.
WITH
planned_tables(name) AS (VALUES
  ('dg_native_jobs'),('dg_native_job_lines'),('dg_native_job_create_commands')
),
planned_sequence(name) AS (VALUES ('dg_native_job_reference_seq')),
planned_rpcs(name) AS (VALUES
  ('dg_create_native_job'),('dg_update_native_job'),('dg_archive_native_job'),
  ('dg_get_native_job'),('dg_list_native_jobs')
),
planned_relations AS (
  SELECT name FROM planned_tables UNION ALL SELECT name FROM planned_sequence
),
relation_collisions AS (
  SELECT n.nspname AS schema_name,c.relname AS object_name,c.relkind::text AS object_kind
  FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
  JOIN planned_relations AS p ON p.name=c.relname WHERE n.nspname='public'
),
routine_collisions AS (
  SELECT n.nspname AS schema_name,p.proname AS routine_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  JOIN planned_rpcs AS planned ON planned.name=p.proname WHERE n.nspname='public'
),
named_dependency_collisions AS (
  SELECT 'constraint'::text AS object_kind,con.conname AS object_name
  FROM pg_catalog.pg_constraint AS con WHERE con.conname LIKE 'dg_native_job%'
  UNION ALL
  SELECT 'index',c.relname FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind::text='i' AND c.relname LIKE 'dg_native_job%'
),
legacy_dg AS (
  SELECT job_id,
    CASE WHEN job_id ~ '^DG-[0-9]{6}$' THEN pg_catalog.substring(job_id FROM 4)::integer END AS suffix
  FROM public.dg_jobs WHERE job_id LIKE 'DG-%'
),
legacy_schema AS (
  SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('dg_jobs','dg_job_lines')
),
assumption_columns AS (
  SELECT table_name,column_name,data_type,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public'
    AND ((table_name='dg_user_profiles' AND column_name IN ('user_id','active','is_manager'))
      OR (table_name='dg_user_permissions' AND column_name IN ('user_id','permission_key','access_level'))
      OR (table_name='dg_jobs' AND column_name='job_id'))
),
operational_schema AS (
  SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public'
    AND (table_name LIKE 'dg_production%' OR table_name LIKE 'dg_calendar%'
      OR table_name='dg_daily_capacity' OR table_name LIKE 'dg_fulfillment%'
      OR table_name LIKE 'dg_document%' OR table_name LIKE 'dg_email%')
),
sections AS (
  SELECT 1 AS section_number,'planned_relation_collisions'::text AS section_name,
    pg_catalog.count(*) AS row_count,COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.object_name),'[]'::jsonb) AS results_json
  FROM relation_collisions AS r
  UNION ALL SELECT 2,'planned_rpc_collisions',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.routine_name),'[]'::jsonb) FROM routine_collisions AS r
  UNION ALL SELECT 3,'planned_constraint_index_collisions',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.object_kind,r.object_name),'[]'::jsonb) FROM named_dependency_collisions AS r
  UNION ALL SELECT 4,'dg_sequence_floor',1,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'highest_valid_suffix',COALESCE(pg_catalog.max(suffix),0),'valid_dg_count',pg_catalog.count(suffix),
    'malformed_dg_shaped_count',pg_catalog.count(*) FILTER (WHERE suffix IS NULL),
    'candidate','DG-000007','candidate_unoccupied',NOT EXISTS (SELECT 1 FROM public.dg_jobs WHERE pg_catalog.lower(pg_catalog.btrim(job_id))='dg-000007'),
    'runtime_collision_skipping_required',true)) FROM legacy_dg
  UNION ALL SELECT 5,'required_extensions',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('extension_name',e.extname,'schema_name',n.nspname) ORDER BY e.extname),'[]'::jsonb)
    FROM pg_catalog.pg_extension AS e JOIN pg_catalog.pg_namespace AS n ON n.oid=e.extnamespace WHERE e.extname IN ('pgcrypto','uuid-ossp')
  UNION ALL SELECT 6,'required_roles',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role_name',r.rolname,'can_login',r.rolcanlogin) ORDER BY r.rolname),'[]'::jsonb)
    FROM pg_catalog.pg_roles AS r WHERE r.rolname IN ('postgres','anon','authenticated')
  UNION ALL SELECT 7,'profile_permission_assumptions',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.table_name,a.column_name),'[]'::jsonb) FROM assumption_columns AS a
  UNION ALL SELECT 8,'legacy_mirror_schema',pg_catalog.count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.table_name,s.ordinal_position),'[]'::jsonb) FROM legacy_schema AS s
  UNION ALL SELECT 9,'legacy_mirror_counts',2,pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('table_name','dg_jobs','row_count',(SELECT pg_catalog.count(*) FROM public.dg_jobs)),
    pg_catalog.jsonb_build_object('table_name','dg_job_lines','row_count',(SELECT pg_catalog.count(*) FROM public.dg_job_lines)))
  UNION ALL SELECT 10,'operational_baseline_counts',5,pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('table_name','dg_production_bookings','row_count',(SELECT pg_catalog.count(*) FROM public.dg_production_bookings)),
    pg_catalog.jsonb_build_object('table_name','dg_calendar_links','row_count',(SELECT pg_catalog.count(*) FROM public.dg_calendar_links)),
    pg_catalog.jsonb_build_object('table_name','dg_daily_capacity','row_count',(SELECT pg_catalog.count(*) FROM public.dg_daily_capacity)),
    pg_catalog.jsonb_build_object('table_name','dg_documents','exists',pg_catalog.to_regclass('public.dg_documents') IS NOT NULL),
    pg_catalog.jsonb_build_object('table_name','dg_fulfillment','exists',pg_catalog.to_regclass('public.dg_fulfillment') IS NOT NULL))
  UNION ALL SELECT 11,'operational_schema_marker',pg_catalog.count(*),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'catalog_row_count',pg_catalog.count(*),'catalog_md5',pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      table_name||'|'||ordinal_position::text||'|'||column_name||'|'||data_type||'|'||udt_name||'|'||is_nullable||'|'||COALESCE(column_default,''),
      E'\n' ORDER BY table_name,ordinal_position),'')))) FROM operational_schema
)
SELECT section_number,section_name,row_count,results_json FROM sections ORDER BY section_number;
