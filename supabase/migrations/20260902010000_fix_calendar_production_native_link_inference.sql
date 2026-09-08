BEGIN;

CREATE OR REPLACE FUNCTION public.assign_native_production_job_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.linked_internal_job_id IS NULL
    AND NEW.booking_kind='production'
    AND NEW.job_id IS NOT NULL
    AND NEW.source IS DISTINCT FROM 'DoorGo Calendar'
  THEN
    SELECT j.internal_job_id INTO NEW.linked_internal_job_id
    FROM public.dg_native_jobs j
    WHERE j.visible_identifier=NEW.job_id AND j.archived_at IS NULL;
  END IF;
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.create_calendar_item(
  p_command_id uuid,p_item_type text,p_scheduled_date date,p_linked_internal_job_id uuid,
  p_customer_name text,p_sales_order text,p_salesperson text,p_shop_hours numeric,
  p_timing text,p_fulfillment_note text,p_title text,p_details text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_job public.dg_native_jobs%ROWTYPE; v_order bigint; v_now timestamptz:=pg_catalog.clock_timestamp();
  v_id uuid:=extensions.gen_random_uuid(); v_booking_id text; v_customer text:=NULLIF(pg_catalog.btrim(p_customer_name),'');
  v_sales_order text:=NULLIF(pg_catalog.btrim(p_sales_order),''); v_salesperson text:=NULLIF(pg_catalog.btrim(p_salesperson),'');
BEGIN
  IF p_command_id IS NULL OR p_item_type NOT IN ('production','delivery','customer_pickup','note')
  THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request'; END IF;
  v_actor:=public.dg_calendar_require_use(p_item_type='production');
  IF p_linked_internal_job_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND (p.access_level='use' OR (p_item_type<>'production' AND p.access_level='view')))
    THEN RAISE EXCEPTION USING MESSAGE='calendar_item.jobs_permission_required'; END IF;
    SELECT * INTO v_job FROM public.dg_native_jobs j WHERE j.internal_job_id=p_linked_internal_job_id AND j.archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.job_not_found'; END IF;
    v_customer:=NULLIF(pg_catalog.btrim(v_job.customer),'');
    v_sales_order:=NULLIF(pg_catalog.btrim(v_job.biztrack_sales_order),'');
    v_salesperson:=NULLIF(pg_catalog.btrim(v_job.salesperson),'');
  END IF;
  IF p_item_type='note' THEN
    v_customer:=COALESCE(NULLIF(pg_catalog.btrim(p_title),''),v_customer);
  ELSIF v_customer IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.name_required'; END IF;
  IF p_item_type='production' AND v_salesperson IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.salesperson_required'; END IF;
  IF p_item_type='production' AND p_linked_internal_job_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.dg_production_bookings b
    WHERE b.linked_internal_job_id=p_linked_internal_job_id
      AND b.booking_kind='production' AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
      AND b.completed_at IS NULL AND b.status='active' AND b.schedule_status='confirmed'
      AND b.board_visible IS DISTINCT FROM false
  ) THEN RAISE EXCEPTION USING MESSAGE='calendar_item.production_already_scheduled'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));
  SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM (
    SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_scheduled_date AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
    UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND i.deleted_at IS NULL
  ) x;
  IF p_item_type='production' THEN
    v_booking_id:='manual-'||v_id::text;
    INSERT INTO public.dg_production_bookings(booking_id,job_id,title,production_date,shop_hours,salesperson,status,source,created_at,updated_at,raw_booking,
      schedule_status,booking_kind,board_visible,all_day,calendar_sync_state,locked,created_by,updated_by,source_system,day_order,linked_internal_job_id)
    VALUES(v_booking_id,CASE WHEN p_linked_internal_job_id IS NULL THEN v_sales_order ELSE v_job.visible_identifier END,v_customer,
      CASE WHEN p_scheduled_date IS NULL THEN NULL ELSE p_scheduled_date::text END,CASE WHEN p_linked_internal_job_id IS NULL THEN p_shop_hours ELSE v_job.shop_hours END,v_salesperson,'active','DoorGo Calendar',v_now,v_now,'{}'::jsonb,
      'confirmed','production',true,true,'native',false,v_actor::text,v_actor::text,'doorgo_native',v_order,p_linked_internal_job_id);
    UPDATE public.dg_production_bookings SET day_order=v_order WHERE booking_id=v_booking_id;
    IF p_linked_internal_job_id IS NOT NULL THEN UPDATE public.dg_native_jobs SET shop_date=p_scheduled_date,shop_date_source=CASE WHEN p_scheduled_date IS NULL THEN NULL ELSE 'Manual' END,
      revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE internal_job_id=p_linked_internal_job_id; END IF;
    RETURN pg_catalog.jsonb_build_object('record_kind','production','id',v_booking_id,'scheduled_date',p_scheduled_date,'day_order',v_order);
  END IF;
  INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,
    fulfillment_note,title,details,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
  VALUES(v_id,p_item_type,p_scheduled_date,p_linked_internal_job_id,COALESCE(v_sales_order,CASE WHEN p_linked_internal_job_id IS NULL THEN NULL ELSE v_job.visible_identifier END),
    v_customer,v_sales_order,v_salesperson,NULLIF(pg_catalog.btrim(p_timing),''),NULLIF(pg_catalog.btrim(p_fulfillment_note),''),
    CASE WHEN p_item_type='note' THEN NULLIF(pg_catalog.btrim(p_title),'') ELSE NULL END,NULLIF(pg_catalog.btrim(p_details),''),v_order,v_now,v_now,v_actor,v_actor);
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at)
  VALUES(p_command_id,v_id,'create',p_scheduled_date,v_order,v_actor,v_now);
  RETURN pg_catalog.jsonb_build_object('record_kind','calendar_item','id',v_id,'scheduled_date',p_scheduled_date,'day_order',v_order);
END;$$;

ALTER FUNCTION public.assign_native_production_job_link() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_native_production_job_link() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.create_calendar_item(uuid,text,date,uuid,text,text,text,numeric,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_calendar_item(uuid,text,date,uuid,text,text,text,numeric,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_calendar_item(uuid,text,date,uuid,text,text,text,numeric,text,text,text,text) TO authenticated;

COMMIT;
