-- Add source inputs for deterministic direct-dimension glass reconciliation.
-- UNAPPLIED: this migration requires separate hosted authorization.
BEGIN;

CREATE OR REPLACE FUNCTION public.dg_validate_direct_dimension_glass_source(p_line jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_specifications jsonb := COALESCE(NULLIF(p_line->'sidelight_specifications', 'null'::jsonb), '[]'::jsonb);
  v_specification jsonb;
  v_key text;
  v_index numeric;
  v_identity text;
  v_identities text[] := ARRAY[]::text[];
BEGIN
  -- Persistence rejects malformed structure and bounded scalar sources. The shared
  -- application geometry engine remains authoritative for topology and dimensions.
  IF pg_catalog.jsonb_typeof(p_line) <> 'object'
    OR pg_catalog.jsonb_typeof(v_specifications) <> 'array'
  THEN RETURN false; END IF;

  FOR v_specification IN SELECT value FROM pg_catalog.jsonb_array_elements(v_specifications) LOOP
    IF pg_catalog.jsonb_typeof(v_specification) <> 'object' THEN RETURN false; END IF;
    FOR v_key IN SELECT key FROM pg_catalog.jsonb_object_keys(v_specification) AS key LOOP
      IF v_key <> ALL(ARRAY[
        'side','index','finishedWidth','tBarSize','glassTypeCode','customGlassDescription',
        'panelSizeMode','panelConstructionNotes'
      ]::text[]) THEN RETURN false; END IF;
    END LOOP;

    IF NOT (v_specification ? 'side')
      OR pg_catalog.jsonb_typeof(v_specification->'side') <> 'string'
      OR v_specification->>'side' NOT IN ('left','right')
      OR NOT (v_specification ? 'index')
      OR pg_catalog.jsonb_typeof(v_specification->'index') <> 'number'
    THEN RETURN false; END IF;
    v_index := (v_specification->>'index')::numeric;
    IF v_index <> pg_catalog.trunc(v_index) OR v_index < 1 OR v_index > 3 THEN RETURN false; END IF;
    v_identity := (v_specification->>'side') || ':' || v_index::integer::text;
    IF v_identity = ANY(v_identities) THEN RETURN false; END IF;
    v_identities := pg_catalog.array_append(v_identities, v_identity);

    IF v_specification ? 'finishedWidth' AND v_specification->'finishedWidth' <> 'null'::jsonb
      AND (pg_catalog.jsonb_typeof(v_specification->'finishedWidth') IS DISTINCT FROM 'string'
        OR pg_catalog.length(pg_catalog.btrim(v_specification->>'finishedWidth')) NOT BETWEEN 1 AND 32
        OR pg_catalog.btrim(v_specification->>'finishedWidth') !~ '^[0-9[:space:]./''"′’″“”-]+$')
    THEN RETURN false; END IF;
    IF v_specification ? 'tBarSize' AND v_specification->'tBarSize' <> 'null'::jsonb
      AND (pg_catalog.jsonb_typeof(v_specification->'tBarSize') IS DISTINCT FROM 'string'
        OR v_specification->>'tBarSize' NOT IN ('1.5','2.25'))
    THEN RETURN false; END IF;
    IF v_specification ? 'glassTypeCode' AND v_specification->'glassTypeCode' <> 'null'::jsonb
      AND (pg_catalog.jsonb_typeof(v_specification->'glassTypeCode') IS DISTINCT FROM 'string'
        OR v_specification->>'glassTypeCode' NOT IN ('CLEAR','SATIN_ETCH','CUSTOM'))
    THEN RETURN false; END IF;
    IF v_specification ? 'customGlassDescription' AND v_specification->'customGlassDescription' <> 'null'::jsonb
      AND (pg_catalog.jsonb_typeof(v_specification->'customGlassDescription') IS DISTINCT FROM 'string'
        OR pg_catalog.length(v_specification->>'customGlassDescription') > 200)
    THEN RETURN false; END IF;
    IF v_specification->>'glassTypeCode' = 'CUSTOM'
      AND (pg_catalog.jsonb_typeof(v_specification->'customGlassDescription') IS DISTINCT FROM 'string'
        OR pg_catalog.length(pg_catalog.btrim(v_specification->>'customGlassDescription')) NOT BETWEEN 1 AND 200)
    THEN RETURN false; END IF;
    IF v_specification ? 'panelSizeMode' AND v_specification->'panelSizeMode' <> 'null'::jsonb
      AND (pg_catalog.jsonb_typeof(v_specification->'panelSizeMode') IS DISTINCT FROM 'string'
        OR v_specification->>'panelSizeMode' NOT IN ('standard','custom'))
    THEN RETURN false; END IF;
    IF v_specification ? 'panelConstructionNotes' AND v_specification->'panelConstructionNotes' <> 'null'::jsonb
      AND (pg_catalog.jsonb_typeof(v_specification->'panelConstructionNotes') IS DISTINCT FROM 'string'
        OR pg_catalog.length(v_specification->>'panelConstructionNotes') > 1000)
    THEN RETURN false; END IF;
  END LOOP;

  IF p_line ? 'transom_t_bar_size' AND p_line->'transom_t_bar_size' <> 'null'::jsonb
    AND (pg_catalog.jsonb_typeof(p_line->'transom_t_bar_size') IS DISTINCT FROM 'string'
      OR p_line->>'transom_t_bar_size' NOT IN ('1.5','2.25'))
  THEN RETURN false; END IF;
  IF p_line ? 'transom_glass_type_code' AND p_line->'transom_glass_type_code' <> 'null'::jsonb
    AND (pg_catalog.jsonb_typeof(p_line->'transom_glass_type_code') IS DISTINCT FROM 'string'
      OR p_line->>'transom_glass_type_code' NOT IN ('CLEAR','SATIN_ETCH','CUSTOM'))
  THEN RETURN false; END IF;
  IF p_line ? 'transom_custom_glass_description' AND p_line->'transom_custom_glass_description' <> 'null'::jsonb
    AND (pg_catalog.jsonb_typeof(p_line->'transom_custom_glass_description') IS DISTINCT FROM 'string'
      OR pg_catalog.length(p_line->>'transom_custom_glass_description') > 200)
  THEN RETURN false; END IF;
  IF p_line->>'transom_glass_type_code' = 'CUSTOM'
    AND (pg_catalog.jsonb_typeof(p_line->'transom_custom_glass_description') IS DISTINCT FROM 'string'
      OR pg_catalog.length(pg_catalog.btrim(p_line->>'transom_custom_glass_description')) NOT BETWEEN 1 AND 200)
  THEN RETURN false; END IF;
  RETURN true;
END;
$$;

ALTER TABLE public.dg_native_job_lines
  ADD COLUMN sidelight_specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN transom_t_bar_size text NULL,
  ADD COLUMN transom_glass_type_code text NULL,
  ADD COLUMN transom_custom_glass_description text NULL,
  ADD CONSTRAINT dg_native_job_lines_sidelight_specifications_shape CHECK (public.dg_validate_direct_dimension_glass_source(pg_catalog.jsonb_build_object('sidelight_specifications', sidelight_specifications))),
  ADD CONSTRAINT dg_native_job_lines_sidelight_t_bar_sizes CHECK (NOT pg_catalog.jsonb_path_exists(sidelight_specifications, '$[*] ? (@.tBarSize != null && @.tBarSize != "1.5" && @.tBarSize != "2.25")')),
  ADD CONSTRAINT dg_native_job_lines_sidelight_glass_codes CHECK (NOT pg_catalog.jsonb_path_exists(sidelight_specifications, '$[*] ? (@.glassTypeCode != null && @.glassTypeCode != "CLEAR" && @.glassTypeCode != "SATIN_ETCH" && @.glassTypeCode != "CUSTOM")')),
  ADD CONSTRAINT dg_native_job_lines_panel_size_modes CHECK (NOT pg_catalog.jsonb_path_exists(sidelight_specifications, '$[*] ? (@.panelSizeMode != null && @.panelSizeMode != "standard" && @.panelSizeMode != "custom")')),
  ADD CONSTRAINT dg_native_job_lines_transom_t_bar_size CHECK (transom_t_bar_size IS NULL OR transom_t_bar_size IN ('1.5','2.25')),
  ADD CONSTRAINT dg_native_job_lines_transom_glass_type_code CHECK (transom_glass_type_code IS NULL OR transom_glass_type_code IN ('CLEAR','SATIN_ETCH','CUSTOM'));

CREATE OR REPLACE FUNCTION public.dg_create_native_job(p_command_id uuid, p_origin text, p_legacy_job_id text, p_legacy_identifier_kind text, p_header jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_origin text := NULLIF(pg_catalog.btrim(p_origin), '');
  v_legacy_job_id text := NULLIF(pg_catalog.btrim(p_legacy_job_id), '');
  v_legacy_kind text := NULLIF(pg_catalog.btrim(p_legacy_identifier_kind), '');
  v_sales_order text;
  v_dg_reference text;
  v_visible_identifier text;
  v_visible_kind text;
  v_job_id uuid := extensions.gen_random_uuid();
  v_fingerprint text;
  v_receipt public.dg_native_job_create_commands%ROWTYPE;
  v_candidate bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_line jsonb;
  v_line_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.authentication_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor AND profile.active = true
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.active_profile_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions AS permission
    WHERE permission.user_id = v_actor
      AND permission.permission_key = 'jobs'
      AND permission.access_level = 'use'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.permission_required';
  END IF;
  IF p_command_id IS NULL OR pg_catalog.jsonb_typeof(p_header) <> 'object'
    OR pg_catalog.jsonb_typeof(p_lines) <> 'array' OR pg_catalog.jsonb_array_length(p_lines) = 0
  THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE pg_catalog.jsonb_typeof(line) <> 'object')
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_header) AS key
    WHERE key <> ALL(ARRAY[
      'biztrack_sales_order','lifecycle_stage','customer','site_address','phone','email','salesperson',
      'notes','hinge_color','shop_hours','shop_hours_source','po_numbers','fulfillment_plan',
      'delivery_date','customer_pickup_date','shop_date','shop_date_source'
    ]::text[])
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    CROSS JOIN LATERAL pg_catalog.jsonb_object_keys(line) AS key
    WHERE key <> ALL(ARRAY[
      'line_id','line_index','line_status','mode','door_type','config','width','height','custom_slab',
      'custom_slab_width','custom_slab_height','hand','prep','glass','jamb_width','jamb_type','sill',
      'weatherstrip','hinge_type','notes','qty','ro_width','ro_height','material','door_thickness',
      'rip_jamb','glass_calc_status','glass_workorder_detail','vendor_copy_text','glass_warnings',
      'glass_blockers','glass_override','glass_units','glass_calc','sidelight_type','sidelight_glass',
      'transom_glass','sidelight_measurement_left','sidelight_measurement_right','panel_sidelight_width',
      'panel_sidelights','sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description','include_diagram_on_work_order'
    ]::text[])
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
  END IF;

  v_sales_order := NULLIF(pg_catalog.btrim(p_header->>'biztrack_sales_order'), '');
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('origin', v_origin, 'legacy_job_id', v_legacy_job_id,
      'legacy_identifier_kind', v_legacy_kind, 'header', p_header, 'lines', p_lines)::text,
    'UTF8'), 'sha256'), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dg_native_job_create_command:' || p_command_id::text, 0)
  );
  SELECT * INTO v_receipt FROM public.dg_native_job_create_commands AS command
  WHERE command.command_id = p_command_id;
  IF FOUND THEN
    IF v_receipt.actor_user_id IS DISTINCT FROM v_actor
      OR v_receipt.request_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION USING MESSAGE = 'native_job.idempotency_conflict';
    END IF;
    RETURN (
      SELECT pg_catalog.jsonb_build_object('job', pg_catalog.to_jsonb(job),
        'lines', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_index)
          FROM public.dg_native_job_lines AS line WHERE line.internal_job_id = job.internal_job_id), '[]'::jsonb),
        'idempotent_replay', true)
      FROM public.dg_native_jobs AS job WHERE job.internal_job_id = v_receipt.internal_job_id
    );
  END IF;

  IF v_origin = 'native' THEN
    IF v_legacy_job_id IS NOT NULL OR v_legacy_kind IS NOT NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
    END IF;
    LOOP
      v_candidate := pg_catalog.nextval('public.dg_native_job_reference_seq'::pg_catalog.regclass);
      IF v_candidate > 999999 THEN RAISE EXCEPTION USING MESSAGE = 'native_job.unavailable'; END IF;
      v_dg_reference := 'DG-' || pg_catalog.lpad(v_candidate::text, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.dg_native_jobs AS job
        WHERE pg_catalog.lower(pg_catalog.btrim(job.door_go_reference)) = pg_catalog.lower(v_dg_reference)
      ) AND NOT EXISTS (
        SELECT 1 FROM public.dg_jobs AS legacy
        WHERE pg_catalog.lower(pg_catalog.btrim(legacy.job_id)) = pg_catalog.lower(v_dg_reference)
      );
    END LOOP;
    IF v_sales_order IS NULL THEN
      v_visible_identifier := v_dg_reference; v_visible_kind := 'door_go_reference';
    ELSE
      v_visible_identifier := v_sales_order; v_visible_kind := 'biztrack_sales_order';
    END IF;
  ELSIF v_origin = 'legacy_transfer' THEN
    IF v_legacy_job_id IS NULL OR v_legacy_kind NOT IN ('biztrack_sales_order', 'door_go_reference') THEN
      RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
    END IF;
    v_visible_identifier := v_legacy_job_id; v_visible_kind := v_legacy_kind;
    IF v_legacy_kind = 'biztrack_sales_order' THEN
      IF v_sales_order IS NOT NULL AND pg_catalog.lower(v_sales_order) <> pg_catalog.lower(v_legacy_job_id) THEN
        RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
      END IF;
      v_sales_order := v_legacy_job_id; v_dg_reference := NULL;
    ELSE
      v_dg_reference := v_legacy_job_id;
    END IF;
  ELSE
    RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dg_native_jobs AS job WHERE v_sales_order IS NOT NULL
    AND pg_catalog.lower(pg_catalog.btrim(job.biztrack_sales_order)) = pg_catalog.lower(v_sales_order))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.duplicate_sales_order'; END IF;
  IF EXISTS (SELECT 1 FROM public.dg_native_jobs AS job WHERE v_dg_reference IS NOT NULL
    AND pg_catalog.lower(pg_catalog.btrim(job.door_go_reference)) = pg_catalog.lower(v_dg_reference))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.duplicate_door_go_reference'; END IF;
  IF EXISTS (SELECT 1 FROM public.dg_native_jobs AS job WHERE v_legacy_job_id IS NOT NULL
    AND pg_catalog.lower(pg_catalog.btrim(job.legacy_job_id)) = pg_catalog.lower(v_legacy_job_id))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.duplicate_legacy_transfer'; END IF;

  IF pg_catalog.jsonb_typeof(COALESCE(p_header->'po_numbers', '[]'::jsonb)) <> 'array'
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_header->'po_numbers','[]'::jsonb)) AS po(value)
      WHERE po.value !~ '^[0-9]+$')
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_header->'po_numbers','[]'::jsonb)))
      <> (SELECT pg_catalog.count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_header->'po_numbers','[]'::jsonb)) AS po(value))
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE pg_catalog.jsonb_typeof(line) <> 'object'
      OR (line ? 'line_id' AND COALESCE(line->>'line_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      OR pg_catalog.jsonb_typeof(COALESCE(line->'glass_warnings','[]'::jsonb)) <> 'array'
      OR pg_catalog.jsonb_typeof(COALESCE(line->'glass_blockers','[]'::jsonb)) <> 'array'
      OR pg_catalog.jsonb_typeof(COALESCE(line->'glass_units','[]'::jsonb)) <> 'array'
      OR pg_catalog.jsonb_typeof(COALESCE(line->'panel_sidelights','[]'::jsonb)) <> 'array'
      OR (line ? 'glass_override' AND line->'glass_override' <> 'null'::jsonb AND pg_catalog.jsonb_typeof(line->'glass_override') <> 'object')
      OR (line ? 'glass_calc' AND line->'glass_calc' <> 'null'::jsonb AND pg_catalog.jsonb_typeof(line->'glass_calc') <> 'object')
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

  INSERT INTO public.dg_native_jobs (
    internal_job_id,biztrack_sales_order,door_go_reference,visible_identifier,visible_identifier_kind,
    origin,legacy_job_id,legacy_identifier_kind,lifecycle_stage,customer,site_address,phone,email,
    salesperson,notes,hinge_color,shop_hours,shop_hours_source,po_numbers,fulfillment_plan,
    delivery_date,customer_pickup_date,shop_date,shop_date_source,created_at,updated_at,
    created_by_user_id,updated_by_user_id
  ) VALUES (
    v_job_id,v_sales_order,v_dg_reference,v_visible_identifier,v_visible_kind,v_origin,v_legacy_job_id,v_legacy_kind,
    COALESCE(p_header->>'lifecycle_stage','Draft'),NULLIF(pg_catalog.btrim(p_header->>'customer'),''),
    NULLIF(pg_catalog.btrim(p_header->>'site_address'),''),NULLIF(pg_catalog.btrim(p_header->>'phone'),''),
    NULLIF(pg_catalog.btrim(p_header->>'email'),''),NULLIF(pg_catalog.btrim(p_header->>'salesperson'),''),
    NULLIF(p_header->>'notes',''),NULLIF(pg_catalog.btrim(p_header->>'hinge_color'),''),
    NULLIF(p_header->>'shop_hours','')::numeric,NULLIF(p_header->>'shop_hours_source',''),
    COALESCE(p_header->'po_numbers','[]'::jsonb),NULLIF(p_header->>'fulfillment_plan',''),
    NULLIF(p_header->>'delivery_date','')::date,NULLIF(p_header->>'customer_pickup_date','')::date,
    NULLIF(p_header->>'shop_date','')::date,NULLIF(p_header->>'shop_date_source',''),v_now,v_now,v_actor,v_actor
  );

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_line_id := COALESCE(NULLIF(v_line->>'line_id','')::uuid, extensions.gen_random_uuid());
    INSERT INTO public.dg_native_job_lines (
      line_id,internal_job_id,line_index,line_status,mode,door_type,config,width,height,custom_slab,
      custom_slab_width,custom_slab_height,hand,prep,glass,jamb_width,jamb_type,sill,weatherstrip,
      hinge_type,notes,qty,ro_width,ro_height,material,door_thickness,rip_jamb,glass_calc_status,
      glass_workorder_detail,vendor_copy_text,glass_warnings,glass_blockers,glass_override,glass_units,
      glass_calc,sidelight_type,sidelight_glass,transom_glass,sidelight_measurement_left,
      sidelight_measurement_right,panel_sidelight_width,panel_sidelights,sidelight_specifications,
      transom_t_bar_size,transom_glass_type_code,transom_custom_glass_description,include_diagram_on_work_order,
      created_at,updated_at,created_by_user_id,updated_by_user_id
    ) VALUES (
      v_line_id,v_job_id,(v_line->>'line_index')::integer,COALESCE(v_line->>'line_status','Active'),v_line->>'mode',
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
      NULLIF(v_line->>'panel_sidelight_width',''),COALESCE(v_line->'panel_sidelights','[]'::jsonb),
      COALESCE(NULLIF(v_line->'sidelight_specifications','null'::jsonb),'[]'::jsonb),
      NULLIF(v_line->>'transom_t_bar_size',''),NULLIF(v_line->>'transom_glass_type_code',''),
      NULLIF(v_line->>'transom_custom_glass_description',''),
      COALESCE((v_line->>'include_diagram_on_work_order')::boolean,true),v_now,v_now,v_actor,v_actor
    );
  END LOOP;
  INSERT INTO public.dg_native_job_create_commands(command_id,actor_user_id,request_fingerprint,internal_job_id,created_at)
    VALUES(p_command_id,v_actor,v_fingerprint,v_job_id,v_now);
  RETURN (SELECT pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),
    'lines',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_index)
      FROM public.dg_native_job_lines AS line WHERE line.internal_job_id=job.internal_job_id),'[]'::jsonb),
    'idempotent_replay',false) FROM public.dg_native_jobs AS job WHERE job.internal_job_id=v_job_id);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING MESSAGE = 'native_job.duplicate_identifier';
  WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
    RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed';
END;
$$;

CREATE OR REPLACE FUNCTION public.dg_update_native_job(
  p_internal_job_id uuid,
  p_expected_revision bigint,
  p_header jsonb,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.dg_create_transferred_native_job(
  p_command_id uuid, p_provenance jsonb, p_header jsonb, p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_job_id uuid:=extensions.gen_random_uuid(); v_now timestamptz:=pg_catalog.clock_timestamp();
  v_kind text; v_value text; v_sales text; v_dg text; v_legacy text; v_visible text; v_visible_kind text;
  v_source_fingerprint text; v_request_fingerprint text; v_receipt public.dg_native_job_create_commands%ROWTYPE;
  v_line jsonb; v_line_id uuid; v_constraint text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles profile WHERE profile.user_id=v_actor AND profile.active=true FOR UPDATE)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions permission WHERE permission.user_id=v_actor
    AND permission.permission_key='jobs' AND permission.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required'; END IF;
  IF p_command_id IS NULL OR pg_catalog.jsonb_typeof(p_provenance)<>'object'
    OR pg_catalog.jsonb_typeof(p_header)<>'object' OR pg_catalog.jsonb_typeof(p_lines)<>'array'
    OR pg_catalog.jsonb_array_length(p_lines)=0
  THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_provenance) key WHERE key<>ALL(ARRAY[
      'direction','source_system','source_job_state','transfer_schema','transfer_version','source_identifier_kind',
      'source_identifier_value','source_saved_at','exported_at','source_fingerprint']::text[]))
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_header) key WHERE key<>ALL(ARRAY[
      'biztrack_sales_order','lifecycle_stage','customer','site_address','phone','email','salesperson','notes','hinge_color',
      'shop_hours','shop_hours_source','po_numbers','fulfillment_plan','delivery_date','customer_pickup_date','shop_date','shop_date_source']::text[]))
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) line CROSS JOIN LATERAL pg_catalog.jsonb_object_keys(line) key
      WHERE key<>ALL(ARRAY['line_id','line_index','line_status','mode','door_type','config','width','height','custom_slab',
      'custom_slab_width','custom_slab_height','hand','prep','glass','jamb_width','jamb_type','sill','weatherstrip','hinge_type',
      'notes','qty','ro_width','ro_height','material','door_thickness','rip_jamb','glass_calc_status','glass_workorder_detail',
      'vendor_copy_text','glass_warnings','glass_blockers','glass_override','glass_units','glass_calc','sidelight_type',
      'sidelight_glass','transom_glass','sidelight_measurement_left','sidelight_measurement_right','panel_sidelight_width',
      'panel_sidelights','sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description','include_diagram_on_work_order']::text[]))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.unsupported_payload'; END IF;


  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE NOT public.dg_validate_direct_dimension_glass_source(line)
  ) THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;

  v_kind:=p_provenance->>'source_identifier_kind'; v_value:=NULLIF(pg_catalog.btrim(p_provenance->>'source_identifier_value'),'');
  v_source_fingerprint:=p_provenance->>'source_fingerprint'; v_sales:=NULLIF(pg_catalog.btrim(p_header->>'biztrack_sales_order'),'');
  IF p_provenance->>'direction'<>'legacy_to_native' OR p_provenance->>'source_system'<>'legacy-doorgo'
    OR p_provenance->>'source_job_state'<>'active' OR p_provenance->>'transfer_schema'<>'doorgo.legacy-job-transfer'
    OR p_provenance->>'transfer_version'<>'1' OR v_kind NOT IN ('biztrack_sales_order','door_go_reference','legacy_job_id')
    OR v_value IS NULL OR v_source_fingerprint !~ '^[0-9a-f]{64}$'
    OR NULLIF(p_provenance->>'source_saved_at','')::timestamptz IS NULL
    OR NULLIF(p_provenance->>'exported_at','')::timestamptz IS NULL
  THEN RAISE EXCEPTION USING MESSAGE='native_job.invalid_transfer_provenance'; END IF;
  IF (v_kind='door_go_reference' AND v_value!~'^DG-[0-9]{6}$')
    OR (v_kind='legacy_job_id' AND v_value!~'^JOB-[0-9]{4,}$')
    OR (v_kind='biztrack_sales_order' AND v_value~'^(DG-|JOB-)')
  THEN RAISE EXCEPTION USING MESSAGE='native_job.invalid_identifier_kind'; END IF;
  IF v_kind='biztrack_sales_order' AND v_sales IS NOT NULL
    AND pg_catalog.lower(v_sales)<>pg_catalog.lower(v_value)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.identifier_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_lines) WITH ORDINALITY item(line,ordinal)
    WHERE COALESCE(line->>'line_status','')<>'Active' OR (line->>'line_id') IS NULL
      OR (line->>'line_id')::uuid IS NULL OR (line->>'line_index')::integer<>ordinal)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed'; END IF;

  IF v_kind='biztrack_sales_order' THEN v_sales:=v_value;
  ELSIF v_kind='door_go_reference' THEN v_dg:=v_value;
  ELSE v_legacy:=v_value; END IF;
  IF v_sales IS NOT NULL THEN v_visible:=v_sales; v_visible_kind:='biztrack_sales_order';
  ELSIF v_dg IS NOT NULL THEN v_visible:=v_dg; v_visible_kind:='door_go_reference';
  ELSE v_visible:=v_legacy; v_visible_kind:='legacy_job_id'; END IF;

  v_request_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('provenance',p_provenance,'header',p_header,'lines',p_lines)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_native_job_create_command:'||p_command_id::text,0));
  SELECT * INTO v_receipt FROM public.dg_native_job_create_commands command WHERE command.command_id=p_command_id;
  IF FOUND THEN
    IF v_receipt.actor_user_id IS DISTINCT FROM v_actor OR v_receipt.request_fingerprint IS DISTINCT FROM v_request_fingerprint
    THEN RAISE EXCEPTION USING MESSAGE='native_job.idempotency_conflict'; END IF;
    RETURN (SELECT pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),'lines',COALESCE((SELECT
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_index) FROM public.dg_native_job_lines line
      WHERE line.internal_job_id=job.internal_job_id),'[]'::jsonb),'idempotent_replay',true)
      FROM public.dg_native_jobs job WHERE job.internal_job_id=v_receipt.internal_job_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.dg_native_jobs job WHERE job.transfer_source_fingerprint=v_source_fingerprint)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_source_fingerprint'; END IF;
  IF v_sales IS NOT NULL AND EXISTS (SELECT 1 FROM public.dg_native_jobs job WHERE pg_catalog.lower(job.biztrack_sales_order)=pg_catalog.lower(v_sales))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_sales_order'; END IF;
  IF v_dg IS NOT NULL AND EXISTS (SELECT 1 FROM public.dg_native_jobs job
    WHERE pg_catalog.lower(job.door_go_reference)=pg_catalog.lower(v_dg))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_door_go_reference'; END IF;
  IF v_legacy IS NOT NULL AND EXISTS (SELECT 1 FROM public.dg_native_jobs job WHERE pg_catalog.lower(job.legacy_job_id)=pg_catalog.lower(v_legacy))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_legacy_job_id'; END IF;

  INSERT INTO public.dg_native_jobs(internal_job_id,biztrack_sales_order,door_go_reference,visible_identifier,
    visible_identifier_kind,origin,legacy_job_id,legacy_identifier_kind,transfer_source_system,transfer_schema,
    transfer_version,transfer_source_identifier_kind,transfer_source_identifier_value,transfer_source_saved_at,
    transfer_exported_at,transfer_source_fingerprint,lifecycle_stage,customer,site_address,phone,email,salesperson,notes,
    hinge_color,shop_hours,shop_hours_source,po_numbers,fulfillment_plan,delivery_date,customer_pickup_date,shop_date,
    shop_date_source,created_at,updated_at,created_by_user_id,updated_by_user_id)
  VALUES(v_job_id,v_sales,v_dg,v_visible,v_visible_kind,'legacy_transfer',v_legacy,v_kind,'legacy-doorgo',
    'doorgo.legacy-job-transfer',1,v_kind,v_value,(p_provenance->>'source_saved_at')::timestamptz,
    (p_provenance->>'exported_at')::timestamptz,v_source_fingerprint,COALESCE(p_header->>'lifecycle_stage','Draft'),
    NULLIF(pg_catalog.btrim(p_header->>'customer'),''),NULLIF(pg_catalog.btrim(p_header->>'site_address'),''),
    NULLIF(pg_catalog.btrim(p_header->>'phone'),''),NULLIF(pg_catalog.btrim(p_header->>'email'),''),
    NULLIF(pg_catalog.btrim(p_header->>'salesperson'),''),NULLIF(p_header->>'notes',''),
    NULLIF(pg_catalog.btrim(p_header->>'hinge_color'),''),NULLIF(p_header->>'shop_hours','')::numeric,
    NULLIF(p_header->>'shop_hours_source',''),COALESCE(p_header->'po_numbers','[]'::jsonb),
    NULLIF(p_header->>'fulfillment_plan',''),NULLIF(p_header->>'delivery_date','')::date,
    NULLIF(p_header->>'customer_pickup_date','')::date,NULLIF(p_header->>'shop_date','')::date,
    NULLIF(p_header->>'shop_date_source',''),v_now,v_now,v_actor,v_actor);

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_line_id:=(v_line->>'line_id')::uuid;
    INSERT INTO public.dg_native_job_lines(line_id,internal_job_id,line_index,line_status,mode,door_type,config,width,height,
      custom_slab,custom_slab_width,custom_slab_height,hand,prep,glass,jamb_width,jamb_type,sill,weatherstrip,hinge_type,
      notes,qty,ro_width,ro_height,material,door_thickness,rip_jamb,glass_calc_status,glass_workorder_detail,vendor_copy_text,
      glass_warnings,glass_blockers,glass_override,glass_units,glass_calc,sidelight_type,sidelight_glass,transom_glass,
      sidelight_measurement_left,sidelight_measurement_right,panel_sidelight_width,panel_sidelights,
      sidelight_specifications,transom_t_bar_size,transom_glass_type_code,transom_custom_glass_description,
      include_diagram_on_work_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
    VALUES(v_line_id,v_job_id,(v_line->>'line_index')::integer,'Active',v_line->>'mode',NULLIF(v_line->>'door_type',''),
      v_line->>'config',v_line->>'width',v_line->>'height',NULLIF(v_line->>'custom_slab',''),
      NULLIF(v_line->>'custom_slab_width',''),NULLIF(v_line->>'custom_slab_height',''),NULLIF(v_line->>'hand',''),
      NULLIF(v_line->>'prep',''),NULLIF(v_line->>'glass',''),NULLIF(v_line->>'jamb_width',''),NULLIF(v_line->>'jamb_type',''),
      NULLIF(v_line->>'sill',''),NULLIF(v_line->>'weatherstrip',''),NULLIF(v_line->>'hinge_type',''),NULLIF(v_line->>'notes',''),
      COALESCE((v_line->>'qty')::integer,1),NULLIF(v_line->>'ro_width',''),NULLIF(v_line->>'ro_height',''),
      NULLIF(v_line->>'material',''),NULLIF(v_line->>'door_thickness',''),NULLIF(v_line->>'rip_jamb',''),
      NULLIF(v_line->>'glass_calc_status',''),NULLIF(v_line->>'glass_workorder_detail',''),NULLIF(v_line->>'vendor_copy_text',''),
      COALESCE(v_line->'glass_warnings','[]'::jsonb),COALESCE(v_line->'glass_blockers','[]'::jsonb),
      NULLIF(v_line->'glass_override','null'::jsonb),COALESCE(v_line->'glass_units','[]'::jsonb),
      NULLIF(v_line->'glass_calc','null'::jsonb),NULLIF(v_line->>'sidelight_type',''),NULLIF(v_line->>'sidelight_glass',''),
      NULLIF(v_line->>'transom_glass',''),NULLIF(v_line->>'sidelight_measurement_left',''),
      NULLIF(v_line->>'sidelight_measurement_right',''),NULLIF(v_line->>'panel_sidelight_width',''),
      COALESCE(v_line->'panel_sidelights','[]'::jsonb),COALESCE(NULLIF(v_line->'sidelight_specifications','null'::jsonb),'[]'::jsonb),
      NULLIF(v_line->>'transom_t_bar_size',''),NULLIF(v_line->>'transom_glass_type_code',''),NULLIF(v_line->>'transom_custom_glass_description',''),
      COALESCE((v_line->>'include_diagram_on_work_order')::boolean,true),
      v_now,v_now,v_actor,v_actor);
  END LOOP;
  INSERT INTO public.dg_native_job_create_commands(command_id,actor_user_id,request_fingerprint,internal_job_id,created_at)
    VALUES(p_command_id,v_actor,v_request_fingerprint,v_job_id,v_now);
  RETURN (SELECT pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),'lines',COALESCE((SELECT
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_index) FROM public.dg_native_job_lines line
    WHERE line.internal_job_id=job.internal_job_id),'[]'::jsonb),'idempotent_replay',false)
    FROM public.dg_native_jobs job WHERE job.internal_job_id=v_job_id);
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint='dg_native_jobs_transfer_fingerprint_unique' THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_source_fingerprint';
  ELSIF v_constraint='dg_native_jobs_sales_order_unique' THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_sales_order';
  ELSIF v_constraint='dg_native_jobs_dg_reference_unique' THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_door_go_reference';
  ELSIF v_constraint='dg_native_jobs_legacy_id_unique' THEN RAISE EXCEPTION USING MESSAGE='native_job.duplicate_legacy_job_id';
  ELSE RAISE EXCEPTION USING MESSAGE='native_job.duplicate_legacy_transfer'; END IF;
WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
  RAISE EXCEPTION USING MESSAGE='native_job.validation_failed';
END;
$$;

ALTER FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) OWNER TO postgres;
ALTER FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) OWNER TO postgres;
ALTER FUNCTION public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb) OWNER TO postgres;
ALTER FUNCTION public.dg_validate_direct_dimension_glass_source(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.dg_validate_direct_dimension_glass_source(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb) TO authenticated;

COMMIT;
