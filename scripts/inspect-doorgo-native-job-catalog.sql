/*
READ-ONLY DOORGO NATIVE JOB CATALOG INSPECTION — NO DATA OR SCHEMA CHANGES

Run this script once in the Supabase SQL Editor. It returns one consolidated
result set with one row per catalog section. Download that result as CSV or use
Copy as JSON. The script reads PostgreSQL and information_schema catalogs only;
it does not select customer or job row contents.
*/

WITH
section_01_rows AS (
  SELECT
    '01_dg_tables' AS result_section,
    n.nspname AS table_schema,
    c.relname AS table_name,
    CASE c.relkind::text WHEN 'r' THEN 'ordinary table' WHEN 'p' THEN 'partitioned table' WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized view' WHEN 'f' THEN 'foreign table' ELSE c.relkind::text END AS relation_kind,
    pg_get_userbyid(c.relowner) AS owner_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    obj_description(c.oid, 'pg_class') AS relation_comment,
    c.relname AS _sort_key
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'dg\_%' ESCAPE '\'
    AND c.relkind::text IN ('r', 'p', 'v', 'm', 'f')
),
section_02_rows AS (
  SELECT
    '02_dg_columns' AS result_section,
    n.nspname AS table_schema,
    c.relname AS table_name,
    a.attnum AS ordinal_position,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    NOT a.attnotnull AS is_nullable,
    pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
    CASE a.attidentity::text WHEN 'a' THEN 'always' WHEN 'd' THEN 'by default' ELSE 'none' END AS identity_status,
    CASE a.attgenerated::text WHEN 's' THEN 'stored' WHEN 'v' THEN 'virtual' ELSE 'none' END AS generated_status,
    col_description(c.oid, a.attnum) AS column_comment,
    c.relname || ':' || lpad(a.attnum::text, 6, '0') AS _sort_key
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef AS ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'dg\_%' ESCAPE '\'
    AND c.relkind::text IN ('r', 'p', 'v', 'm', 'f')
    AND a.attnum > 0
    AND NOT a.attisdropped
),
section_03_rows AS (
  SELECT
    '03_dg_constraints' AS result_section,
    n.nspname AS table_schema,
    c.relname AS table_name,
    con.conname AS constraint_name,
    CASE con.contype::text WHEN 'p' THEN 'primary key' WHEN 'u' THEN 'unique' WHEN 'f' THEN 'foreign key'
      WHEN 'x' THEN 'exclusion' WHEN 'c' THEN 'check' ELSE con.contype::text END AS constraint_type,
    rn.nspname AS referenced_schema,
    rc.relname AS referenced_table,
    con.condeferrable AS is_deferrable,
    con.condeferred AS initially_deferred,
    con.convalidated AS is_validated,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition,
    c.relname || ':' || con.contype::text || ':' || con.conname AS _sort_key
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_class AS rc ON rc.oid = con.confrelid
  LEFT JOIN pg_catalog.pg_namespace AS rn ON rn.oid = rc.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'dg\_%' ESCAPE '\'
    AND con.contype::text IN ('p', 'u', 'f', 'x', 'c')
),
section_04_rows AS (
  SELECT
    '04_dg_indexes' AS result_section,
    tn.nspname AS table_schema,
    tc.relname AS table_name,
    ic.relname AS index_name,
    am.amname AS access_method,
    i.indisprimary AS is_primary,
    i.indisunique AS is_unique,
    i.indisexclusion AS is_exclusion,
    i.indisvalid AS is_valid,
    i.indisready AS is_ready,
    pg_catalog.pg_get_indexdef(i.indexrelid) AS index_definition,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS partial_predicate,
    pg_catalog.pg_get_expr(i.indexprs, i.indrelid) AS index_expressions,
    tc.relname || ':' || ic.relname AS _sort_key
  FROM pg_catalog.pg_index AS i
  JOIN pg_catalog.pg_class AS tc ON tc.oid = i.indrelid
  JOIN pg_catalog.pg_namespace AS tn ON tn.oid = tc.relnamespace
  JOIN pg_catalog.pg_class AS ic ON ic.oid = i.indexrelid
  JOIN pg_catalog.pg_am AS am ON am.oid = ic.relam
  WHERE tn.nspname = 'public'
    AND tc.relname LIKE 'dg\_%' ESCAPE '\'
),
section_05_rows AS (
  SELECT
    '05_dg_policies' AS result_section,
    schemaname AS table_schema,
    tablename AS table_name,
    policyname AS policy_name,
    permissive,
    roles,
    cmd AS command,
    qual AS using_expression,
    with_check AS with_check_expression,
    tablename || ':' || policyname AS _sort_key
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename LIKE 'dg\_%' ESCAPE '\'
),
section_06_rows AS (
  SELECT
    '06_dg_table_grants' AS result_section,
    pg_catalog.pg_get_userbyid(acl.grantor) AS grantor,
    CASE acl.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee,
    n.nspname AS table_schema,
    c.relname AS table_name,
    acl.privilege_type,
    acl.is_grantable,
    c.relname || ':' || acl.grantee::text || ':' || acl.privilege_type AS _sort_key
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS acl
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'dg\_%' ESCAPE '\'
    AND c.relkind::text IN ('r', 'p', 'v', 'm', 'f')
),
section_07_rows AS (
  SELECT
    '07_dg_triggers' AS result_section,
    n.nspname AS table_schema,
    c.relname AS table_name,
    t.tgname AS trigger_name,
    t.tgenabled::text AS enabled_mode,
    pn.nspname AS function_schema,
    p.proname AS function_name,
    pg_catalog.pg_get_triggerdef(t.oid, true) AS trigger_definition,
    c.relname || ':' || t.tgname AS _sort_key
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'dg\_%' ESCAPE '\'
    AND NOT t.tgisinternal
),
section_08_rows AS (
  SELECT DISTINCT
    '08_dg_and_job_related_functions' AS result_section,
    pn.nspname AS function_schema,
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    l.lanname AS language_name,
    p.prosecdef AS security_definer,
    p.provolatile::text AS volatility,
    p.proparallel::text AS parallel_safety,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
    pg_catalog.pg_get_functiondef(p.oid) AS function_definition,
    p.proname || ':' || pg_catalog.pg_get_function_identity_arguments(p.oid) AS _sort_key
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE pn.nspname = 'public'
    AND p.prokind::text IN ('f', 'p')
    AND (
      p.proname LIKE 'dg\_%' ESCAPE '\'
      OR pg_catalog.pg_get_functiondef(p.oid) ~* '\m(dg_jobs|dg_job_lines|dg_native_jobs|dg_native_job_lines)\M'
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend AS d
        JOIN pg_catalog.pg_class AS dependency_relation ON dependency_relation.oid = d.refobjid
        JOIN pg_catalog.pg_namespace AS dependency_schema ON dependency_schema.oid = dependency_relation.relnamespace
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_class'::regclass
          AND dependency_schema.nspname = 'public'
          AND dependency_relation.relname IN ('dg_jobs', 'dg_job_lines', 'dg_native_jobs', 'dg_native_job_lines')
      )
    )
),
section_09_rows AS (
  SELECT
    '09_dg_function_grants' AS result_section,
    pg_catalog.pg_get_userbyid(acl.grantor) AS grantor,
    CASE acl.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee,
    n.nspname AS routine_schema,
    p.proname AS routine_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    acl.privilege_type,
    acl.is_grantable,
    p.proname || ':' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ':' || acl.grantee::text || ':' || acl.privilege_type AS _sort_key
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
  WHERE n.nspname = 'public'
    AND p.prokind::text IN ('f', 'p')
    AND (
      p.proname LIKE 'dg\_%' ESCAPE '\'
      OR p.proname IN ('dg_create_native_job', 'dg_update_native_job', 'dg_archive_native_job', 'dg_get_native_job', 'dg_list_native_jobs')
      OR pg_catalog.pg_get_functiondef(p.oid) ~* '\m(dg_jobs|dg_job_lines|dg_native_jobs|dg_native_job_lines)\M'
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend AS d
        JOIN pg_catalog.pg_class AS dependency_relation ON dependency_relation.oid = d.refobjid
        JOIN pg_catalog.pg_namespace AS dependency_schema ON dependency_schema.oid = dependency_relation.relnamespace
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_class'::regclass
          AND dependency_schema.nspname = 'public'
          AND dependency_relation.relname IN ('dg_jobs', 'dg_job_lines', 'dg_native_jobs', 'dg_native_job_lines')
      )
    )
),
section_10_rows AS (
  SELECT
    '10_dg_sequences' AS result_section,
    n.nspname AS sequence_schema,
    c.relname AS sequence_name,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
    pg_catalog.format_type(s.seqtypid, NULL) AS data_type,
    s.seqstart AS start_value,
    s.seqincrement AS increment_by,
    s.seqmin AS minimum_value,
    s.seqmax AS maximum_value,
    s.seqcache AS cache_size,
    s.seqcycle AS cycles,
    tn.nspname AS owned_by_schema,
    tc.relname AS owned_by_table,
    ta.attname AS owned_by_column,
    c.relname AS _sort_key
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_sequence AS s ON s.seqrelid = c.oid
  LEFT JOIN pg_catalog.pg_depend AS d ON d.classid = 'pg_class'::regclass AND d.objid = c.oid
    AND d.refclassid = 'pg_class'::regclass AND d.deptype::text IN ('a', 'i')
  LEFT JOIN pg_catalog.pg_class AS tc ON tc.oid = d.refobjid
  LEFT JOIN pg_catalog.pg_namespace AS tn ON tn.oid = tc.relnamespace
  LEFT JOIN pg_catalog.pg_attribute AS ta ON ta.attrelid = d.refobjid AND ta.attnum = d.refobjsubid
  WHERE n.nspname = 'public'
    AND (c.relname LIKE 'dg\_%' ESCAPE '\' OR c.relname = 'dg_native_job_reference_seq'
      OR tc.relname IN ('dg_jobs', 'dg_job_lines', 'dg_native_jobs', 'dg_native_job_lines', 'dg_native_job_create_commands'))
),
section_11_rows AS (
  SELECT
    '11_dg_sequence_grants' AS result_section,
    pg_catalog.pg_get_userbyid(acl.grantor) AS grantor,
    CASE acl.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee,
    n.nspname AS sequence_schema,
    c.relname AS sequence_name,
    acl.privilege_type,
    acl.is_grantable,
    c.relname || ':' || acl.grantee::text || ':' || acl.privilege_type AS _sort_key
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('S', c.relowner))) AS acl
  WHERE c.relkind::text = 'S'
    AND n.nspname = 'public'
    AND (c.relname LIKE 'dg\_%' ESCAPE '\' OR c.relname = 'dg_native_job_reference_seq')
),
section_12_rows AS (
  SELECT
    '12_job_sequence_defaults' AS result_section,
    n.nspname AS table_schema,
    c.relname AS table_name,
    a.attname AS column_name,
    pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
    c.relname || ':' || lpad(a.attnum::text, 6, '0') AS _sort_key
  FROM pg_catalog.pg_attrdef AS ad
  JOIN pg_catalog.pg_class AS c ON c.oid = ad.adrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
  WHERE n.nspname = 'public'
    AND c.relname IN ('dg_jobs', 'dg_job_lines', 'dg_native_jobs', 'dg_native_job_lines', 'dg_native_job_create_commands')
    AND pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) ~* 'nextval'
),
section_13_rows AS (
  SELECT DISTINCT
    '13_job_object_dependencies' AS result_section,
    pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
    pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced_object,
    d.deptype::text AS dependency_type,
    pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid) || ':' ||
      pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS _sort_key
  FROM pg_catalog.pg_depend AS d
  WHERE EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('dg_jobs', 'dg_job_lines', 'dg_native_jobs', 'dg_native_job_lines', 'dg_native_job_create_commands')
      AND ((d.classid = 'pg_class'::regclass AND d.objid = c.oid)
        OR (d.refclassid = 'pg_class'::regclass AND d.refobjid = c.oid))
  )
),
section_14_rows AS (
  SELECT
    '14_planned_name_collisions' AS result_section,
    planned.object_kind,
    planned.object_name,
    CASE
      WHEN planned.object_kind = 'table' THEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = planned.object_name AND c.relkind::text IN ('r', 'p', 'v', 'm', 'f'))
      WHEN planned.object_kind = 'sequence' THEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = planned.object_name AND c.relkind::text = 'S')
      WHEN planned.object_kind = 'function/RPC' THEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = planned.object_name)
      ELSE false
    END AS already_exists,
    planned.object_kind || ':' || planned.object_name AS _sort_key
  FROM (VALUES
    ('table', 'dg_native_jobs'),
    ('table', 'dg_native_job_lines'),
    ('table', 'dg_native_job_create_commands'),
    ('sequence', 'dg_native_job_reference_seq'),
    ('function/RPC', 'dg_create_native_job'),
    ('function/RPC', 'dg_update_native_job'),
    ('function/RPC', 'dg_archive_native_job'),
    ('function/RPC', 'dg_get_native_job'),
    ('function/RPC', 'dg_list_native_jobs')
  ) AS planned(object_kind, object_name)
),
section_15_rows AS (
  SELECT
    '15_uuid_extensions' AS result_section,
    available.name AS extension_name,
    available.default_version,
    installed.extversion AS installed_version,
    (installed.oid IS NOT NULL) AS is_installed,
    installed_namespace.nspname AS installed_schema,
    available.comment,
    available.name AS _sort_key
  FROM pg_catalog.pg_available_extensions AS available
  LEFT JOIN pg_catalog.pg_extension AS installed ON installed.extname = available.name
  LEFT JOIN pg_catalog.pg_namespace AS installed_namespace ON installed_namespace.oid = installed.extnamespace
  WHERE available.name IN ('pgcrypto', 'uuid-ossp')
),
section_16_rows AS (
  SELECT
    '16_uuid_generator_functions' AS result_section,
    n.nspname AS function_schema,
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
    p.prosecdef AS security_definer,
    pg_catalog.pg_get_functiondef(p.oid) AS function_definition,
    n.nspname || ':' || p.proname || ':' || pg_catalog.pg_get_function_identity_arguments(p.oid) AS _sort_key
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE p.proname IN ('gen_random_uuid', 'uuid_generate_v4')
    AND p.prokind::text = 'f'
),
consolidated_sections AS (
  SELECT 1 AS section_number, 'dg_tables' AS section_name,
    COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_01_rows AS r), '[]'::jsonb) AS results_json
  UNION ALL SELECT 2, 'dg_columns', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_02_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 3, 'dg_constraints', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_03_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 4, 'dg_indexes', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_04_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 5, 'dg_policies', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_05_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 6, 'dg_table_grants', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_06_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 7, 'dg_triggers', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_07_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 8, 'dg_and_job_related_functions', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_08_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 9, 'dg_function_grants', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_09_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 10, 'dg_sequences', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_10_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 11, 'dg_sequence_grants', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_11_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 12, 'job_sequence_defaults', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_12_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 13, 'job_object_dependencies', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_13_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 14, 'planned_name_collisions', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_14_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 15, 'uuid_extensions', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_15_rows AS r), '[]'::jsonb)
  UNION ALL SELECT 16, 'uuid_generator_functions', COALESCE((SELECT jsonb_agg(to_jsonb(r) - '_sort_key' ORDER BY r._sort_key) FROM section_16_rows AS r), '[]'::jsonb)
)
SELECT
  section_number,
  section_name,
  jsonb_array_length(results_json) AS row_count,
  results_json
FROM consolidated_sections
ORDER BY section_number;
