-- DoorGo hosted native-job persistence. This migration is intentionally unapplied.
-- Sequence floor inspected 2026-07-28: hosted legacy max 2, local aggregate max 6.

BEGIN;

CREATE SEQUENCE public.dg_native_job_reference_seq
  AS bigint START WITH 7 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.dg_native_job_reference_seq OWNER TO postgres;

CREATE TABLE public.dg_native_jobs (
  internal_job_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  biztrack_sales_order text NULL,
  door_go_reference text NULL,
  visible_identifier text NOT NULL,
  visible_identifier_kind text NOT NULL,
  origin text NOT NULL,
  legacy_job_id text NULL,
  legacy_identifier_kind text NULL,
  revision bigint NOT NULL DEFAULT 1,
  lifecycle_stage text NOT NULL DEFAULT 'Draft',
  customer text NULL,
  site_address text NULL,
  phone text NULL,
  email text NULL,
  salesperson text NULL,
  notes text NULL,
  hinge_color text NULL,
  shop_hours numeric(10,2) NULL,
  shop_hours_source text NULL,
  po_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  fulfillment_plan text NULL,
  delivery_date date NULL,
  customer_pickup_date date NULL,
  shop_date date NULL,
  shop_date_source text NULL,
  archived_at timestamptz NULL,
  archived_by_user_id uuid NULL,
  archive_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  CONSTRAINT dg_native_jobs_created_by_fk FOREIGN KEY (created_by_user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_jobs_updated_by_fk FOREIGN KEY (updated_by_user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_jobs_archived_by_fk FOREIGN KEY (archived_by_user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_jobs_identifiers_present CHECK (
    biztrack_sales_order IS NOT NULL OR door_go_reference IS NOT NULL
  ),
  CONSTRAINT dg_native_jobs_identifiers_trimmed CHECK (
    (biztrack_sales_order IS NULL OR (biztrack_sales_order = pg_catalog.btrim(biztrack_sales_order) AND biztrack_sales_order <> ''))
    AND (door_go_reference IS NULL OR (door_go_reference = pg_catalog.btrim(door_go_reference) AND door_go_reference <> ''))
    AND visible_identifier = pg_catalog.btrim(visible_identifier) AND visible_identifier <> ''
    AND (legacy_job_id IS NULL OR (legacy_job_id = pg_catalog.btrim(legacy_job_id) AND legacy_job_id <> ''))
  ),
  CONSTRAINT dg_native_jobs_dg_format CHECK (
    door_go_reference IS NULL OR door_go_reference ~ '^DG-[0-9]{6}$'
  ),
  CONSTRAINT dg_native_jobs_visible_kind CHECK (
    visible_identifier_kind IN ('biztrack_sales_order', 'door_go_reference')
  ),
  CONSTRAINT dg_native_jobs_visible_matches CHECK (
    (visible_identifier_kind = 'biztrack_sales_order' AND visible_identifier = biztrack_sales_order)
    OR (visible_identifier_kind = 'door_go_reference' AND visible_identifier = door_go_reference)
  ),
  CONSTRAINT dg_native_jobs_origin CHECK (origin IN ('native', 'legacy_transfer')),
  CONSTRAINT dg_native_jobs_legacy_kind CHECK (
    legacy_identifier_kind IS NULL OR legacy_identifier_kind IN ('biztrack_sales_order', 'door_go_reference')
  ),
  CONSTRAINT dg_native_jobs_provenance CHECK (
    (origin = 'native' AND legacy_job_id IS NULL AND legacy_identifier_kind IS NULL AND door_go_reference IS NOT NULL)
    OR
    (origin = 'legacy_transfer' AND legacy_job_id IS NOT NULL AND legacy_identifier_kind IS NOT NULL
      AND visible_identifier = legacy_job_id AND visible_identifier_kind = legacy_identifier_kind
      AND ((legacy_identifier_kind = 'biztrack_sales_order' AND biztrack_sales_order = legacy_job_id AND door_go_reference IS NULL)
        OR (legacy_identifier_kind = 'door_go_reference' AND door_go_reference = legacy_job_id)))
  ),
  CONSTRAINT dg_native_jobs_revision CHECK (revision >= 1),
  CONSTRAINT dg_native_jobs_lifecycle CHECK (lifecycle_stage IN ('Draft', 'Confirmed Job')),
  CONSTRAINT dg_native_jobs_customer_or_site CHECK (
    NULLIF(pg_catalog.btrim(customer), '') IS NOT NULL OR NULLIF(pg_catalog.btrim(site_address), '') IS NOT NULL
  ),
  CONSTRAINT dg_native_jobs_shop_hours CHECK (shop_hours IS NULL OR shop_hours >= 0),
  CONSTRAINT dg_native_jobs_shop_hours_source CHECK (
    shop_hours_source IS NULL OR shop_hours_source IN ('Estimated', 'Estimate incomplete', 'Manual', 'Calculated')
  ),
  CONSTRAINT dg_native_jobs_po_numbers CHECK (pg_catalog.jsonb_typeof(po_numbers) = 'array'),
  CONSTRAINT dg_native_jobs_fulfillment_plan CHECK (
    fulfillment_plan IS NULL OR fulfillment_plan IN ('Delivery', 'Customer Pickup')
  ),
  CONSTRAINT dg_native_jobs_shop_date_source CHECK (
    shop_date_source IS NULL OR shop_date_source IN ('Automatic', 'Manual', 'Calendar Sync')
  ),
  CONSTRAINT dg_native_jobs_archive CHECK (
    (archived_at IS NULL AND archived_by_user_id IS NULL)
    OR (archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL)
  )
);
ALTER TABLE public.dg_native_jobs OWNER TO postgres;

CREATE UNIQUE INDEX dg_native_jobs_sales_order_unique
  ON public.dg_native_jobs (pg_catalog.lower(pg_catalog.btrim(biztrack_sales_order)))
  WHERE biztrack_sales_order IS NOT NULL;
CREATE UNIQUE INDEX dg_native_jobs_dg_reference_unique
  ON public.dg_native_jobs (pg_catalog.lower(pg_catalog.btrim(door_go_reference)))
  WHERE door_go_reference IS NOT NULL;
CREATE UNIQUE INDEX dg_native_jobs_legacy_id_unique
  ON public.dg_native_jobs (pg_catalog.lower(pg_catalog.btrim(legacy_job_id)))
  WHERE legacy_job_id IS NOT NULL;
CREATE UNIQUE INDEX dg_native_jobs_visible_identifier_unique
  ON public.dg_native_jobs (pg_catalog.lower(pg_catalog.btrim(visible_identifier)));
CREATE INDEX dg_native_jobs_archive_updated_idx ON public.dg_native_jobs (archived_at, updated_at DESC);
CREATE INDEX dg_native_jobs_updated_idx ON public.dg_native_jobs (updated_at DESC);
CREATE INDEX dg_native_jobs_created_by_idx ON public.dg_native_jobs (created_by_user_id);

CREATE TABLE public.dg_native_job_lines (
  line_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  internal_job_id uuid NOT NULL,
  line_index integer NOT NULL,
  line_status text NOT NULL DEFAULT 'Active',
  mode text NOT NULL,
  door_type text NULL,
  config text NOT NULL,
  width text NOT NULL,
  height text NOT NULL,
  custom_slab text NULL,
  custom_slab_width text NULL,
  custom_slab_height text NULL,
  hand text NULL,
  prep text NULL,
  glass text NULL,
  jamb_width text NULL,
  jamb_type text NULL,
  sill text NULL,
  weatherstrip text NULL,
  hinge_type text NULL,
  notes text NULL,
  qty integer NOT NULL DEFAULT 1,
  ro_width text NULL,
  ro_height text NULL,
  material text NULL,
  door_thickness text NULL,
  rip_jamb text NULL,
  glass_calc_status text NULL,
  glass_workorder_detail text NULL,
  vendor_copy_text text NULL,
  glass_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  glass_blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  glass_override jsonb NULL,
  glass_units jsonb NOT NULL DEFAULT '[]'::jsonb,
  glass_calc jsonb NULL,
  sidelight_type text NULL,
  sidelight_glass text NULL,
  transom_glass text NULL,
  sidelight_measurement_left text NULL,
  sidelight_measurement_right text NULL,
  panel_sidelight_width text NULL,
  panel_sidelights jsonb NOT NULL DEFAULT '[]'::jsonb,
  include_diagram_on_work_order boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  CONSTRAINT dg_native_job_lines_job_fk FOREIGN KEY (internal_job_id)
    REFERENCES public.dg_native_jobs(internal_job_id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_job_lines_created_by_fk FOREIGN KEY (created_by_user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_job_lines_updated_by_fk FOREIGN KEY (updated_by_user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_job_lines_order_unique UNIQUE (internal_job_id, line_index)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT dg_native_job_lines_index CHECK (line_index >= 1),
  CONSTRAINT dg_native_job_lines_status CHECK (line_status IN ('Active', 'Archived', 'Merged')),
  CONSTRAINT dg_native_job_lines_mode CHECK (mode IN ('Interior', 'Exterior')),
  CONSTRAINT dg_native_job_lines_qty CHECK (qty >= 1),
  CONSTRAINT dg_native_job_lines_glass_status CHECK (
    glass_calc_status IS NULL OR glass_calc_status IN ('Complete', 'Glass Detail Needed', 'Warning',
      'Blocked', 'Manual Override', 'Unsupported', 'Ready', 'Not Needed')
  ),
  CONSTRAINT dg_native_job_lines_warnings CHECK (pg_catalog.jsonb_typeof(glass_warnings) = 'array'),
  CONSTRAINT dg_native_job_lines_blockers CHECK (pg_catalog.jsonb_typeof(glass_blockers) = 'array'),
  CONSTRAINT dg_native_job_lines_units CHECK (pg_catalog.jsonb_typeof(glass_units) = 'array'),
  CONSTRAINT dg_native_job_lines_panels CHECK (pg_catalog.jsonb_typeof(panel_sidelights) = 'array'),
  CONSTRAINT dg_native_job_lines_override CHECK (
    glass_override IS NULL OR pg_catalog.jsonb_typeof(glass_override) = 'object'
  ),
  CONSTRAINT dg_native_job_lines_calc CHECK (
    glass_calc IS NULL OR pg_catalog.jsonb_typeof(glass_calc) = 'object'
  ),
  CONSTRAINT dg_native_job_lines_sidelight_type CHECK (
    sidelight_type IS NULL OR sidelight_type IN ('Glass', 'Panel')
  )
);
ALTER TABLE public.dg_native_job_lines OWNER TO postgres;
CREATE INDEX dg_native_job_lines_job_status_order_idx
  ON public.dg_native_job_lines (internal_job_id, line_status, line_index);
CREATE INDEX dg_native_job_lines_updated_idx ON public.dg_native_job_lines (updated_at);

CREATE TABLE public.dg_native_job_create_commands (
  command_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  request_fingerprint text NOT NULL,
  internal_job_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT dg_native_job_commands_actor_fk FOREIGN KEY (actor_user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_job_commands_job_fk FOREIGN KEY (internal_job_id)
    REFERENCES public.dg_native_jobs(internal_job_id) ON DELETE RESTRICT,
  CONSTRAINT dg_native_job_commands_fingerprint CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.dg_native_job_create_commands OWNER TO postgres;

ALTER TABLE public.dg_native_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_native_job_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_native_job_create_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_native_jobs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dg_native_job_lines NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dg_native_job_create_commands NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dg_native_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dg_native_job_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dg_native_job_create_commands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.dg_native_job_reference_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dg_create_native_job(
  p_command_id uuid,
  p_origin text,
  p_legacy_job_id text,
  p_legacy_identifier_kind text,
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
      'panel_sidelights','include_diagram_on_work_order'
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
      sidelight_measurement_right,panel_sidelight_width,panel_sidelights,include_diagram_on_work_order,
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
ALTER FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) OWNER TO postgres;

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
    SELECT pg_catalog.greatest(COALESCE(pg_catalog.max(line.line_index),0),submitted_bound.max_index) AS max_index
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
      panel_sidelights,include_diagram_on_work_order,created_at,updated_at,created_by_user_id,updated_by_user_id
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
      NULLIF(v_line->>'panel_sidelight_width',''),COALESCE(v_line->'panel_sidelights','[]'::jsonb),
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
      panel_sidelights=EXCLUDED.panel_sidelights,include_diagram_on_work_order=EXCLUDED.include_diagram_on_work_order,
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
ALTER FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.dg_archive_native_job(
  p_internal_job_id uuid,
  p_expected_revision bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_actor uuid:=auth.uid(); v_job public.dg_native_jobs%ROWTYPE; v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles AS profile WHERE profile.user_id=v_actor AND profile.active=true FOR UPDATE)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS permission WHERE permission.user_id=v_actor
    AND permission.permission_key='jobs' AND permission.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required'; END IF;
  SELECT * INTO v_job FROM public.dg_native_jobs AS job WHERE job.internal_job_id=p_internal_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='native_job.not_found'; END IF;
  IF v_job.archived_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.archived'; END IF;
  IF v_job.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='native_job.stale_revision'; END IF;
  UPDATE public.dg_native_jobs AS job SET archived_at=v_now,archived_by_user_id=v_actor,
    archive_reason=NULLIF(pg_catalog.btrim(p_reason),''),revision=job.revision+1,updated_at=v_now,updated_by_user_id=v_actor
  WHERE job.internal_job_id=p_internal_job_id;
  RETURN (SELECT pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),
    'lines',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_index)
      FROM public.dg_native_job_lines AS line WHERE line.internal_job_id=job.internal_job_id),'[]'::jsonb))
    FROM public.dg_native_jobs AS job WHERE job.internal_job_id=p_internal_job_id);
END;
$$;
ALTER FUNCTION public.dg_archive_native_job(uuid,bigint,text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.dg_get_native_job(
  p_internal_job_id uuid,
  p_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_actor uuid:=auth.uid(); v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles AS profile WHERE profile.user_id=v_actor AND profile.active=true)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS permission WHERE permission.user_id=v_actor
    AND permission.permission_key='jobs' AND permission.access_level IN ('view','use'))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required'; END IF;
  SELECT pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),
    'lines',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_index)
      FROM public.dg_native_job_lines AS line WHERE line.internal_job_id=job.internal_job_id),'[]'::jsonb))
    INTO v_result FROM public.dg_native_jobs AS job
    WHERE job.internal_job_id=p_internal_job_id AND (COALESCE(p_include_archived,false) OR job.archived_at IS NULL);
  IF v_result IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.not_found'; END IF;
  RETURN v_result;
END;
$$;
ALTER FUNCTION public.dg_get_native_job(uuid,boolean) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.dg_list_native_jobs(
  p_include_archived boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_internal_job_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_candidates jsonb;
  v_items jsonb;
  v_has_more boolean;
  v_next_updated_at timestamptz;
  v_next_job_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles AS profile WHERE profile.user_id=v_actor AND profile.active=true)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS permission WHERE permission.user_id=v_actor
    AND permission.permission_key='jobs' AND permission.access_level IN ('view','use'))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required'; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100
    OR ((p_cursor_updated_at IS NULL) <> (p_cursor_internal_job_id IS NULL))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed'; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY item_updated_at DESC,item_job_id DESC),'[]'::jsonb)
  INTO v_candidates
  FROM (
    SELECT pg_catalog.jsonb_build_object(
      'internal_job_id',job.internal_job_id,'biztrack_sales_order',job.biztrack_sales_order,
      'door_go_reference',job.door_go_reference,'visible_identifier',job.visible_identifier,
      'visible_identifier_kind',job.visible_identifier_kind,'origin',job.origin,'revision',job.revision,
      'lifecycle_stage',job.lifecycle_stage,'customer',job.customer,'site_address',job.site_address,
      'archived_at',job.archived_at,'created_at',job.created_at,'updated_at',job.updated_at,
      'active_line_count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines AS line
        WHERE line.internal_job_id=job.internal_job_id AND line.line_status='Active'),
      'archived_line_count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines AS line
        WHERE line.internal_job_id=job.internal_job_id AND line.line_status='Archived')
    ) AS item, job.updated_at AS item_updated_at, job.internal_job_id AS item_job_id
    FROM public.dg_native_jobs AS job
    WHERE job.origin IN ('native','legacy_transfer')
      AND (COALESCE(p_include_archived,false) OR job.archived_at IS NULL)
      AND (p_cursor_updated_at IS NULL OR job.updated_at<p_cursor_updated_at
        OR (job.updated_at=p_cursor_updated_at AND job.internal_job_id<p_cursor_internal_job_id))
    ORDER BY job.updated_at DESC,job.internal_job_id DESC
    LIMIT p_limit+1
  ) AS candidates;

  v_has_more:=pg_catalog.jsonb_array_length(v_candidates)>p_limit;
  SELECT COALESCE(pg_catalog.jsonb_agg(element ORDER BY ordinal),'[]'::jsonb) INTO v_items
  FROM pg_catalog.jsonb_array_elements(v_candidates) WITH ORDINALITY AS candidate(element,ordinal)
  WHERE ordinal<=p_limit;
  IF v_has_more THEN
    v_next_updated_at:=(v_items->(pg_catalog.jsonb_array_length(v_items)-1)->>'updated_at')::timestamptz;
    v_next_job_id:=(v_items->(pg_catalog.jsonb_array_length(v_items)-1)->>'internal_job_id')::uuid;
  END IF;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'page',pg_catalog.jsonb_build_object(
    'limit',p_limit,'has_more',v_has_more,'next_cursor_updated_at',v_next_updated_at,
    'next_cursor_internal_job_id',v_next_job_id));
END;
$$;
ALTER FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.dg_archive_native_job(uuid,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.dg_get_native_job(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dg_archive_native_job(uuid,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dg_get_native_job(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) TO authenticated;

COMMIT;
