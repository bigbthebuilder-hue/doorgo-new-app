-- READ-ONLY HOSTED CATALOG PREFLIGHT — DO NOT MODIFY INTO AN APPLY SCRIPT
-- Run once in Supabase SQL Editor and export the single JSON result before separately authorizing the unapplied migration.
WITH
server_evidence AS (
  SELECT pg_catalog.jsonb_build_object(
    'server_version', pg_catalog.current_setting('server_version'),
    'database_name', pg_catalog.current_database(),
    'current_role', current_user,
    'inspected_at', pg_catalog.clock_timestamp()
  ) AS result
),
column_evidence AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'column_name', a.attname,
    'ordinal_position', a.attnum,
    'data_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull,
    'default_expression', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
    'identity_kind', a.attidentity::text,
    'generated_kind', a.attgenerated::text
  ) ORDER BY a.attnum), '[]'::jsonb) AS result
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relname = 'dg_native_job_lines'
),
constraint_evidence AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'constraint_name', con.conname,
    'constraint_type', con.contype::text,
    'validated', con.convalidated,
    'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
  ) ORDER BY con.conname), '[]'::jsonb) AS result
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'dg_native_job_lines'
),
index_evidence AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'index_name', i.indexrelid::pg_catalog.regclass::text,
    'is_unique', i.indisunique,
    'is_primary', i.indisprimary,
    'is_valid', i.indisvalid,
    'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
  ) ORDER BY i.indexrelid::pg_catalog.regclass::text), '[]'::jsonb) AS result
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'dg_native_job_lines'
),
table_security_evidence AS (
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(c.relowner),
    'rls_enabled', c.relrowsecurity,
    'rls_forced', c.relforcerowsecurity,
    'table_acl', COALESCE(pg_catalog.to_jsonb(c.relacl), '[]'::jsonb),
    'policies', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.policyname)
      FROM pg_catalog.pg_policies p WHERE p.schemaname='public' AND p.tablename='dg_native_job_lines'), '[]'::jsonb),
    'information_schema_grants', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g) ORDER BY g.grantee,g.privilege_type)
      FROM information_schema.role_table_grants g WHERE g.table_schema='public' AND g.table_name='dg_native_job_lines'), '[]'::jsonb)
  ) AS result
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='dg_native_job_lines'
),
function_evidence AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema_name', n.nspname,
    'function_name', p.proname,
    'oid', p.oid,
    'function_kind', p.prokind::text,
    'signature', p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
    'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
    'arguments', pg_catalog.pg_get_function_arguments(p.oid),
    'argument_names', COALESCE(pg_catalog.to_jsonb(p.proargnames), '[]'::jsonb),
    'argument_modes', COALESCE(pg_catalog.to_jsonb(p.proargmodes), '[]'::jsonb),
    'input_argument_type_oids', pg_catalog.to_jsonb(p.proargtypes::pg_catalog.oid[]),
    'all_argument_type_oids', COALESCE(pg_catalog.to_jsonb(p.proallargtypes), pg_catalog.to_jsonb(p.proargtypes::pg_catalog.oid[])),
    'rendered_input_types', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.format_type(argument_type_oid,NULL) ORDER BY ordinal)
      FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY AS argument(argument_type_oid,ordinal)), '[]'::jsonb),
    'result_type', pg_catalog.pg_get_function_result(p.oid),
    'owner', pg_catalog.pg_get_userbyid(p.proowner),
    'language', l.lanname,
    'security_definer', p.prosecdef,
    'volatility', p.provolatile::text,
    'parallel_setting', p.proparallel::text,
    'strict', p.proisstrict,
    'leakproof', p.proleakproof,
    'configuration', COALESCE(pg_catalog.to_jsonb(p.proconfig), '[]'::jsonb),
    'definition_md5', pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
    'definition', pg_catalog.pg_get_functiondef(p.oid),
    'acl', COALESCE(pg_catalog.to_jsonb(p.proacl), '[]'::jsonb),
    'execution_grants', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantee', pg_catalog.pg_get_userbyid(grant_acl.grantee),
      'privilege_type', grant_acl.privilege_type,
      'grantable', grant_acl.is_grantable
    ) ORDER BY pg_catalog.pg_get_userbyid(grant_acl.grantee))
      FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f',p.proowner))) grant_acl), '[]'::jsonb),
    'matches_expected_logical_signature', CASE p.proname
      WHEN 'dg_create_native_job' THEN p.proargtypes::pg_catalog.oid[] = ARRAY['uuid'::pg_catalog.regtype::pg_catalog.oid,'text'::pg_catalog.regtype::pg_catalog.oid,'text'::pg_catalog.regtype::pg_catalog.oid,'text'::pg_catalog.regtype::pg_catalog.oid,'jsonb'::pg_catalog.regtype::pg_catalog.oid,'jsonb'::pg_catalog.regtype::pg_catalog.oid]::pg_catalog.oid[]
      WHEN 'dg_update_native_job' THEN p.proargtypes::pg_catalog.oid[] = ARRAY['uuid'::pg_catalog.regtype::pg_catalog.oid,'bigint'::pg_catalog.regtype::pg_catalog.oid,'jsonb'::pg_catalog.regtype::pg_catalog.oid,'jsonb'::pg_catalog.regtype::pg_catalog.oid]::pg_catalog.oid[]
      WHEN 'dg_create_transferred_native_job' THEN p.proargtypes::pg_catalog.oid[] = ARRAY['uuid'::pg_catalog.regtype::pg_catalog.oid,'jsonb'::pg_catalog.regtype::pg_catalog.oid,'jsonb'::pg_catalog.regtype::pg_catalog.oid,'jsonb'::pg_catalog.regtype::pg_catalog.oid]::pg_catalog.oid[]
      ELSE false END
  ) ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)), '[]'::jsonb) AS result
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname !~ '^pg_toast'
    AND p.proname IN ('dg_create_native_job','dg_update_native_job','dg_create_transferred_native_job')
),
function_diagnostic_evidence AS (
  SELECT pg_catalog.jsonb_build_object(
    'exact_name_overload_count', (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
        AND p.proname IN ('dg_create_native_job','dg_update_native_job','dg_create_transferred_native_job')),
    'diagnostic_fallback_needed', (SELECT pg_catalog.count(*)=0 FROM pg_catalog.pg_proc exact_p JOIN pg_catalog.pg_namespace exact_n ON exact_n.oid=exact_p.pronamespace
      WHERE exact_n.nspname NOT IN ('pg_catalog','information_schema') AND exact_n.nspname !~ '^pg_toast'
        AND exact_p.proname IN ('dg_create_native_job','dg_update_native_job','dg_create_transferred_native_job')),
    'fallback_candidates', COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema_name',n.nspname,'function_name',p.proname,'oid',p.oid,
      'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
      'result_type',pg_catalog.pg_get_function_result(p.oid)
    ) ORDER BY n.nspname,p.proname,p.oid) FILTER (WHERE (SELECT pg_catalog.count(*)=0
      FROM pg_catalog.pg_proc exact_p JOIN pg_catalog.pg_namespace exact_n ON exact_n.oid=exact_p.pronamespace
      WHERE exact_n.nspname NOT IN ('pg_catalog','information_schema') AND exact_n.nspname !~ '^pg_toast'
        AND exact_p.proname IN ('dg_create_native_job','dg_update_native_job','dg_create_transferred_native_job'))), '[]'::jsonb)
  ) AS result
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
    AND (p.proname LIKE '%native%job%' OR p.proname LIKE 'dg_create%' OR p.proname LIKE 'dg_update%' OR p.proname LIKE '%transferred%')
),
sequence_evidence AS (
  SELECT pg_catalog.jsonb_build_object(
    'schema_name', n.nspname,
    'sequence_name', c.relname,
    'owner', pg_catalog.pg_get_userbyid(c.relowner),
    'data_type', pg_catalog.format_type(s.seqtypid, NULL),
    'start_value', s.seqstart,
    'increment', s.seqincrement,
    'minimum_value', s.seqmin,
    'maximum_value', s.seqmax,
    'cache_size', s.seqcache,
    'cycles', s.seqcycle,
    'last_value', q.last_value,
    'is_called', q.is_called,
    'calculated_next_candidate', CASE WHEN q.is_called THEN q.last_value + s.seqincrement ELSE q.last_value END,
    'acl', COALESCE(pg_catalog.to_jsonb(c.relacl), '[]'::jsonb)
  ) AS result
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_sequence s ON s.seqrelid=c.oid
  CROSS JOIN public.dg_native_job_reference_seq q
  WHERE n.nspname='public' AND c.relname='dg_native_job_reference_seq'
),
provenance_evidence AS (
  SELECT pg_catalog.jsonb_build_object(
    'native_job_constraints', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',con.conname,'definition',pg_catalog.pg_get_constraintdef(con.oid,true)) ORDER BY con.conname)
      FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('dg_native_jobs','dg_native_job_create_commands')), '[]'::jsonb),
    'native_job_indexes', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::pg_catalog.regclass::text)
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('dg_native_jobs','dg_native_job_create_commands')), '[]'::jsonb)
  ) AS result
),
migration_history_candidates AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema_name',n.nspname,
    'relation_name',c.relname,
    'relation_kind',c.relkind::text,
    'owner',pg_catalog.pg_get_userbyid(c.relowner),
    'estimated_row_count',c.reltuples::bigint,
    'exact_row_count',CASE WHEN n.nspname='supabase_migrations' AND c.relname='schema_migrations'
      THEN (SELECT pg_catalog.count(*) FROM supabase_migrations.schema_migrations) ELSE NULL END,
    'exact_count_note',CASE WHEN n.nspname='supabase_migrations' AND c.relname='schema_migrations'
      THEN 'direct safe count' ELSE 'metadata-only candidate; no dynamic relation execution' END,
    'columns',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'column_name',a.attname,'ordinal_position',a.attnum,'data_type',pg_catalog.format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'default_expression',pg_catalog.pg_get_expr(d.adbin,d.adrelid)
    ) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped), '[]'::jsonb),
    'acl',COALESCE(pg_catalog.to_jsonb(c.relacl),'[]'::jsonb),
    'expanded_grants',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantee',pg_catalog.pg_get_userbyid(grant_acl.grantee),'privilege_type',grant_acl.privilege_type,'grantable',grant_acl.is_grantable
    ) ORDER BY pg_catalog.pg_get_userbyid(grant_acl.grantee),grant_acl.privilege_type)
      FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) grant_acl),'[]'::jsonb)
  ) ORDER BY n.nspname,c.relname), '[]'::jsonb) AS result
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
    AND c.relkind::text IN ('r','p','v','m','f')
    AND (c.relname='schema_migrations' OR c.relname='migrations' OR c.relname='migration_history'
      OR c.relname LIKE '%schema_migrations%' OR c.relname LIKE '%migration_history%')
),
migration_history_evidence AS (
  SELECT pg_catalog.jsonb_build_object(
    'relation_exists', pg_catalog.to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
    'complete_column_definition',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'column_name',a.attname,'ordinal_position',a.attnum,'data_type',pg_catalog.format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'default_expression',pg_catalog.pg_get_expr(d.adbin,d.adrelid)
    ) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations' AND a.attnum>0 AND NOT a.attisdropped), '[]'::jsonb),
    'exact_row_count',pg_catalog.count(*),
    'direct_dimension_migration_already_recorded',COALESCE(pg_catalog.bool_or(pg_catalog.to_jsonb(h)->>'version'='20260805000000'),false),
    'latest_25_rows',COALESCE((SELECT pg_catalog.jsonb_agg(sample.row_json ORDER BY sample.physical_rank)
      FROM (SELECT pg_catalog.row_number() OVER (ORDER BY h2.ctid DESC) AS physical_rank, pg_catalog.to_jsonb(h2)-'statements' AS row_json
        FROM supabase_migrations.schema_migrations h2 ORDER BY h2.ctid DESC LIMIT 25) sample), '[]'::jsonb),
    'latest_rows_ordering_note','physical ctid order used because no version column name or type is assumed; statements payload omitted defensively'
  ) AS result
  FROM supabase_migrations.schema_migrations h
),
sections AS (
  SELECT 1 AS section_number,'server_identity'::text AS section_name,result FROM server_evidence
  UNION ALL SELECT 2,'native_line_columns',result FROM column_evidence
  UNION ALL SELECT 3,'native_line_constraints',result FROM constraint_evidence
  UNION ALL SELECT 4,'native_line_indexes',result FROM index_evidence
  UNION ALL SELECT 5,'native_line_security',result FROM table_security_evidence
  UNION ALL SELECT 6,'write_rpc_definitions',result FROM function_evidence
  UNION ALL SELECT 7,'write_rpc_discovery_diagnostics',result FROM function_diagnostic_evidence
  UNION ALL SELECT 8,'dg_sequence_runtime_state',result FROM sequence_evidence
  UNION ALL SELECT 9,'provenance_transfer_and_stale_revision_guards',result FROM provenance_evidence
  UNION ALL SELECT 10,'migration_history_candidates',result FROM migration_history_candidates
  UNION ALL SELECT 11,'supabase_migration_history',result FROM migration_history_evidence
)
SELECT pg_catalog.jsonb_build_object(
  'inspection', 'direct_dimension_glass_hosted_catalog_preflight',
  'read_only', true,
  'section_count', pg_catalog.count(*),
  'sections', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'section_number',section_number,'section_name',section_name,'results',result
  ) ORDER BY section_number)
) AS consolidated_preflight_result
FROM sections;
