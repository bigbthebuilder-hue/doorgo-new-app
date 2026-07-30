-- Forward-only legacy-transfer persistence amendment. Intentionally unapplied.
BEGIN;

ALTER TABLE public.dg_native_jobs
  ADD COLUMN transfer_source_system text NULL,
  ADD COLUMN transfer_schema text NULL,
  ADD COLUMN transfer_version integer NULL,
  ADD COLUMN transfer_source_identifier_kind text NULL,
  ADD COLUMN transfer_source_identifier_value text NULL,
  ADD COLUMN transfer_source_saved_at timestamptz NULL,
  ADD COLUMN transfer_exported_at timestamptz NULL,
  ADD COLUMN transfer_source_fingerprint text NULL;

ALTER TABLE public.dg_native_jobs
  DROP CONSTRAINT dg_native_jobs_identifiers_present,
  DROP CONSTRAINT dg_native_jobs_identifiers_trimmed,
  DROP CONSTRAINT dg_native_jobs_visible_kind,
  DROP CONSTRAINT dg_native_jobs_visible_matches,
  DROP CONSTRAINT dg_native_jobs_legacy_kind,
  DROP CONSTRAINT dg_native_jobs_provenance,
  ADD CONSTRAINT dg_native_jobs_identifiers_present CHECK (
    biztrack_sales_order IS NOT NULL OR door_go_reference IS NOT NULL OR legacy_job_id IS NOT NULL
  ),
  ADD CONSTRAINT dg_native_jobs_identifiers_trimmed CHECK (
    (biztrack_sales_order IS NULL OR (biztrack_sales_order=pg_catalog.btrim(biztrack_sales_order) AND biztrack_sales_order<>''))
    AND (door_go_reference IS NULL OR (door_go_reference=pg_catalog.btrim(door_go_reference) AND door_go_reference<>''))
    AND (legacy_job_id IS NULL OR (legacy_job_id=pg_catalog.btrim(legacy_job_id) AND legacy_job_id<>''))
    AND visible_identifier=pg_catalog.btrim(visible_identifier) AND visible_identifier<>''
    AND (transfer_source_system IS NULL OR transfer_source_system=pg_catalog.btrim(transfer_source_system))
    AND (transfer_schema IS NULL OR transfer_schema=pg_catalog.btrim(transfer_schema))
    AND (transfer_source_identifier_value IS NULL OR transfer_source_identifier_value=pg_catalog.btrim(transfer_source_identifier_value))
  ),
  ADD CONSTRAINT dg_native_jobs_visible_kind CHECK (
    visible_identifier_kind IN ('biztrack_sales_order','door_go_reference','legacy_job_id')
  ),
  ADD CONSTRAINT dg_native_jobs_visible_matches CHECK (
    (biztrack_sales_order IS NOT NULL AND visible_identifier_kind='biztrack_sales_order' AND visible_identifier=biztrack_sales_order)
    OR (biztrack_sales_order IS NULL AND door_go_reference IS NOT NULL AND visible_identifier_kind='door_go_reference' AND visible_identifier=door_go_reference)
    OR (biztrack_sales_order IS NULL AND door_go_reference IS NULL AND legacy_job_id IS NOT NULL
      AND visible_identifier_kind='legacy_job_id' AND visible_identifier=legacy_job_id)
  ),
  ADD CONSTRAINT dg_native_jobs_legacy_kind CHECK (
    legacy_identifier_kind IS NULL OR legacy_identifier_kind IN ('biztrack_sales_order','door_go_reference','legacy_job_id')
  ),
  ADD CONSTRAINT dg_native_jobs_transfer_fingerprint CHECK (
    transfer_source_fingerprint IS NULL OR transfer_source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT dg_native_jobs_provenance CHECK (
    (origin='native' AND legacy_job_id IS NULL AND legacy_identifier_kind IS NULL AND door_go_reference IS NOT NULL
      AND transfer_source_system IS NULL AND transfer_schema IS NULL AND transfer_version IS NULL
      AND transfer_source_identifier_kind IS NULL AND transfer_source_identifier_value IS NULL
      AND transfer_source_saved_at IS NULL AND transfer_exported_at IS NULL AND transfer_source_fingerprint IS NULL)
    OR
    (origin='legacy_transfer' AND legacy_identifier_kind=transfer_source_identifier_kind
      AND transfer_source_system='legacy-doorgo' AND transfer_schema='doorgo.legacy-job-transfer'
      AND transfer_version=1 AND transfer_source_identifier_kind IN ('biztrack_sales_order','door_go_reference','legacy_job_id')
      AND transfer_source_identifier_value IS NOT NULL AND transfer_source_saved_at IS NOT NULL
      AND transfer_exported_at IS NOT NULL AND transfer_source_fingerprint IS NOT NULL
      AND ((transfer_source_identifier_kind='biztrack_sales_order' AND biztrack_sales_order=transfer_source_identifier_value
          AND door_go_reference IS NULL AND legacy_job_id IS NULL)
        OR (transfer_source_identifier_kind='door_go_reference' AND door_go_reference=transfer_source_identifier_value
          AND legacy_job_id IS NULL)
        OR (transfer_source_identifier_kind='legacy_job_id' AND legacy_job_id=transfer_source_identifier_value
          AND door_go_reference IS NULL)))
  );

CREATE UNIQUE INDEX dg_native_jobs_transfer_fingerprint_unique
  ON public.dg_native_jobs (transfer_source_fingerprint) WHERE transfer_source_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX dg_native_jobs_transfer_source_unique
  ON public.dg_native_jobs (pg_catalog.lower(transfer_source_system),transfer_source_identifier_kind,
    pg_catalog.lower(transfer_source_identifier_value)) WHERE transfer_source_identifier_value IS NOT NULL;

CREATE FUNCTION public.dg_enforce_native_job_identity_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF OLD.origin IS DISTINCT FROM NEW.origin
    OR OLD.legacy_job_id IS DISTINCT FROM NEW.legacy_job_id
    OR OLD.legacy_identifier_kind IS DISTINCT FROM NEW.legacy_identifier_kind
    OR OLD.transfer_source_system IS DISTINCT FROM NEW.transfer_source_system
    OR OLD.transfer_schema IS DISTINCT FROM NEW.transfer_schema
    OR OLD.transfer_version IS DISTINCT FROM NEW.transfer_version
    OR OLD.transfer_source_identifier_kind IS DISTINCT FROM NEW.transfer_source_identifier_kind
    OR OLD.transfer_source_identifier_value IS DISTINCT FROM NEW.transfer_source_identifier_value
    OR OLD.transfer_source_saved_at IS DISTINCT FROM NEW.transfer_source_saved_at
    OR OLD.transfer_exported_at IS DISTINCT FROM NEW.transfer_exported_at
    OR OLD.transfer_source_fingerprint IS DISTINCT FROM NEW.transfer_source_fingerprint
  THEN RAISE EXCEPTION USING MESSAGE='native_job.immutable_provenance'; END IF;
  IF NEW.biztrack_sales_order IS NOT NULL THEN
    NEW.visible_identifier:=NEW.biztrack_sales_order; NEW.visible_identifier_kind:='biztrack_sales_order';
  ELSIF NEW.door_go_reference IS NOT NULL THEN
    NEW.visible_identifier:=NEW.door_go_reference; NEW.visible_identifier_kind:='door_go_reference';
  ELSE
    NEW.visible_identifier:=NEW.legacy_job_id; NEW.visible_identifier_kind:='legacy_job_id';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.dg_enforce_native_job_identity_immutability() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_enforce_native_job_identity_immutability() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER dg_native_jobs_identity_immutability
  BEFORE UPDATE ON public.dg_native_jobs FOR EACH ROW
  EXECUTE FUNCTION public.dg_enforce_native_job_identity_immutability();

CREATE FUNCTION public.dg_create_transferred_native_job(
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
      'panel_sidelights','include_diagram_on_work_order']::text[]))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.unsupported_payload'; END IF;

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
      COALESCE(v_line->'panel_sidelights','[]'::jsonb),COALESCE((v_line->>'include_diagram_on_work_order')::boolean,true),
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
ALTER FUNCTION public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.dg_list_native_jobs(
  p_include_archived boolean DEFAULT false,p_limit integer DEFAULT 50,
  p_cursor_updated_at timestamptz DEFAULT NULL,p_cursor_internal_job_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid:=auth.uid(); v_candidates jsonb; v_items jsonb; v_has_more boolean;
  v_next_updated_at timestamptz; v_next_job_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles profile WHERE profile.user_id=v_actor AND profile.active=true)
  THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions permission WHERE permission.user_id=v_actor
    AND permission.permission_key='jobs' AND permission.access_level IN ('view','use'))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required'; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR ((p_cursor_updated_at IS NULL)<>(p_cursor_internal_job_id IS NULL))
  THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed'; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY item_updated_at DESC,item_job_id DESC),'[]'::jsonb) INTO v_candidates FROM(
    SELECT pg_catalog.jsonb_build_object('internal_job_id',job.internal_job_id,'biztrack_sales_order',job.biztrack_sales_order,
      'door_go_reference',job.door_go_reference,'legacy_job_id',job.legacy_job_id,
      'legacy_identifier_kind',job.legacy_identifier_kind,'visible_identifier',job.visible_identifier,
      'visible_identifier_kind',job.visible_identifier_kind,'origin',job.origin,'revision',job.revision,
      'lifecycle_stage',job.lifecycle_stage,'customer',job.customer,'site_address',job.site_address,
      'archived_at',job.archived_at,'created_at',job.created_at,'updated_at',job.updated_at,
      'active_line_count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines line WHERE line.internal_job_id=job.internal_job_id AND line.line_status='Active'),
      'archived_line_count',(SELECT pg_catalog.count(*) FROM public.dg_native_job_lines line WHERE line.internal_job_id=job.internal_job_id AND line.line_status='Archived')) item,
      job.updated_at item_updated_at,job.internal_job_id item_job_id FROM public.dg_native_jobs job
    WHERE job.origin IN ('native','legacy_transfer') AND (COALESCE(p_include_archived,false) OR job.archived_at IS NULL)
      AND (p_cursor_updated_at IS NULL OR job.updated_at<p_cursor_updated_at
        OR (job.updated_at=p_cursor_updated_at AND job.internal_job_id<p_cursor_internal_job_id))
    ORDER BY job.updated_at DESC,job.internal_job_id DESC LIMIT p_limit+1) candidates;
  v_has_more:=pg_catalog.jsonb_array_length(v_candidates)>p_limit;
  SELECT COALESCE(pg_catalog.jsonb_agg(element ORDER BY ordinal),'[]'::jsonb) INTO v_items
    FROM pg_catalog.jsonb_array_elements(v_candidates) WITH ORDINALITY candidate(element,ordinal) WHERE ordinal<=p_limit;
  IF v_has_more THEN v_next_updated_at:=(v_items->(pg_catalog.jsonb_array_length(v_items)-1)->>'updated_at')::timestamptz;
    v_next_job_id:=(v_items->(pg_catalog.jsonb_array_length(v_items)-1)->>'internal_job_id')::uuid; END IF;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'page',pg_catalog.jsonb_build_object('limit',p_limit,
    'has_more',v_has_more,'next_cursor_updated_at',v_next_updated_at,'next_cursor_internal_job_id',v_next_job_id));
END;
$$;
ALTER FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) TO authenticated;

REVOKE ALL ON TABLE public.dg_native_jobs,public.dg_native_job_lines,public.dg_native_job_create_commands
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.dg_native_job_reference_seq FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
