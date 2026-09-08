BEGIN;

ALTER TABLE public.dg_calendar_item_events DROP CONSTRAINT dg_calendar_item_events_action_type_check;
ALTER TABLE public.dg_calendar_item_events ADD CONSTRAINT dg_calendar_item_events_action_type_check
  CHECK (action_type IN ('create','schedule','unschedule','reschedule','reorder','complete','reopen','delete','split','merge','included_orders','edit','convert'));

CREATE OR REPLACE FUNCTION public.update_calendar_note(
  p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_title text,p_details text,
  p_linked_internal_job_id uuid,p_salesperson text,p_scheduled_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_job public.dg_native_jobs%ROWTYPE;
  v_title text:=NULLIF(pg_catalog.btrim(p_title),'');v_order bigint;v_from_date date;v_from_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_item_id IS NULL OR p_expected_revision IS NULL OR v_title IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
  IF EXISTS(SELECT 1 FROM public.dg_calendar_item_events WHERE command_id=p_command_id) THEN RETURN pg_catalog.jsonb_build_object('item_id',p_item_id);END IF;
  SELECT * INTO v_item FROM public.dg_calendar_items WHERE item_id=p_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_item.item_type<>'note' THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item';END IF;
  IF v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item';END IF;
  v_from_date:=v_item.scheduled_date;v_from_order:=v_item.day_order;
  IF p_linked_internal_job_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions WHERE user_id=v_actor AND permission_key='jobs' AND access_level IN('view','use')) THEN RAISE EXCEPTION USING MESSAGE='calendar_item.jobs_permission_required';END IF;
    SELECT * INTO v_job FROM public.dg_native_jobs WHERE internal_job_id=p_linked_internal_job_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.job_not_found';END IF;
  END IF;
  IF v_item.scheduled_date IS DISTINCT FROM p_scheduled_date THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));
    SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM (
      SELECT day_order FROM public.dg_production_bookings WHERE public.parse_production_booking_date(production_date) IS NOT DISTINCT FROM p_scheduled_date AND deleted_at IS NULL AND cancelled_at IS NULL
      UNION ALL SELECT day_order FROM public.dg_calendar_items WHERE scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND deleted_at IS NULL AND item_id<>p_item_id
    )x;
  ELSE v_order:=v_item.day_order;END IF;
  UPDATE public.dg_calendar_items SET title=v_title,customer_name=v_title,details=NULLIF(pg_catalog.btrim(p_details),''),linked_internal_job_id=p_linked_internal_job_id,
    sales_order=CASE WHEN p_linked_internal_job_id IS NULL THEN NULL ELSE v_job.biztrack_sales_order END,
    salesperson=NULLIF(pg_catalog.btrim(p_salesperson),''),
    scheduled_date=p_scheduled_date,day_order=v_order,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id RETURNING * INTO v_item;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at)
    VALUES(p_command_id,p_item_id,'edit',v_from_date,p_scheduled_date,v_from_order,v_order,v_actor,v_now);
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'revision',v_item.revision);
END;$$;

CREATE OR REPLACE FUNCTION public.convert_calendar_note(
  p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_destination text,p_scheduled_date date,
  p_linked_internal_job_id uuid,p_name text,p_sales_order text,p_salesperson text,p_shop_hours numeric,p_timing text,
  p_staff_id uuid,p_end_date date,p_away_mode text,p_partial_drag_hours numeric,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(p_destination IN('production','staff_away'));v_note public.dg_calendar_items%ROWTYPE;v_result jsonb;v_now timestamptz:=pg_catalog.clock_timestamp();v_note_command uuid:=extensions.gen_random_uuid();
BEGIN
  IF p_command_id IS NULL OR p_item_id IS NULL OR p_expected_revision IS NULL OR p_destination NOT IN('production','delivery','customer_pickup','staff_away') THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
  IF EXISTS(SELECT 1 FROM public.dg_calendar_item_events WHERE command_id=p_command_id) THEN RETURN pg_catalog.jsonb_build_object('converted',true);END IF;
  SELECT * INTO v_note FROM public.dg_calendar_items WHERE item_id=p_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_note.item_type<>'note' THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found';END IF;
  IF v_note.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item';END IF;
  IF v_note.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item';END IF;
  IF p_destination='staff_away' THEN
    IF p_scheduled_date IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
    v_result:=public.save_staff_away_period(v_note_command,NULL,NULL,p_staff_id,p_scheduled_date,COALESCE(p_end_date,p_scheduled_date),p_away_mode,p_partial_drag_hours,COALESCE(NULLIF(pg_catalog.btrim(p_reason),''),v_note.details,v_note.title));
  ELSIF p_linked_internal_job_id IS NOT NULL AND p_destination IN('delivery','customer_pickup') THEN
    v_result:=public.schedule_linked_fulfillment(v_note_command,p_linked_internal_job_id,p_destination,p_scheduled_date,p_timing,COALESCE(v_note.details,v_note.title));
  ELSE
    v_result:=public.create_calendar_item(v_note_command,p_destination,p_scheduled_date,p_linked_internal_job_id,COALESCE(NULLIF(pg_catalog.btrim(p_name),''),v_note.title),p_sales_order,p_salesperson,p_shop_hours,p_timing,COALESCE(v_note.details,v_note.title),v_note.title,v_note.details);
  END IF;
  UPDATE public.dg_calendar_items SET deleted_at=v_now,deleted_by_user_id=v_actor,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail)
    VALUES(p_command_id,p_item_id,'convert',v_note.scheduled_date,v_note.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('destination',p_destination,'result',v_result));
  RETURN v_result||pg_catalog.jsonb_build_object('converted_from',p_item_id,'destination',p_destination);
END;$$;

ALTER FUNCTION public.update_calendar_note(uuid,uuid,bigint,text,text,uuid,text,date) OWNER TO postgres;
ALTER FUNCTION public.convert_calendar_note(uuid,uuid,bigint,text,date,uuid,text,text,text,numeric,text,uuid,date,text,numeric,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_calendar_note(uuid,uuid,bigint,text,text,uuid,text,date),public.convert_calendar_note(uuid,uuid,bigint,text,date,uuid,text,text,text,numeric,text,uuid,date,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_calendar_note(uuid,uuid,bigint,text,text,uuid,text,date),public.convert_calendar_note(uuid,uuid,bigint,text,date,uuid,text,text,text,numeric,text,uuid,date,text,numeric,text) TO authenticated;

COMMIT;
