-- Keep native Job scheduling fields and current Calendar obligations synchronized.
BEGIN;

ALTER TABLE public.dg_production_bookings
  ADD COLUMN linked_internal_job_id uuid NULL REFERENCES public.dg_native_jobs(internal_job_id);

UPDATE public.dg_production_bookings AS booking
SET linked_internal_job_id=job.internal_job_id
FROM public.dg_native_jobs AS job
WHERE booking.linked_internal_job_id IS NULL
  AND booking.job_id=job.visible_identifier
  AND booking.booking_kind='production'
  AND booking.deleted_at IS NULL AND booking.cancelled_at IS NULL;

CREATE INDEX dg_production_bookings_linked_job_idx
  ON public.dg_production_bookings(linked_internal_job_id)
  WHERE linked_internal_job_id IS NOT NULL;
CREATE UNIQUE INDEX dg_production_one_current_linked_job_idx
  ON public.dg_production_bookings(linked_internal_job_id)
  WHERE linked_internal_job_id IS NOT NULL AND booking_kind='production'
    AND deleted_at IS NULL AND cancelled_at IS NULL AND completed_at IS NULL
    AND status='active' AND schedule_status='confirmed' AND board_visible IS DISTINCT FROM false;
CREATE UNIQUE INDEX dg_calendar_one_current_fulfillment_job_idx
  ON public.dg_calendar_items(linked_internal_job_id)
  WHERE linked_internal_job_id IS NOT NULL AND item_type IN ('delivery','customer_pickup')
    AND deleted_at IS NULL AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.assign_native_production_job_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.linked_internal_job_id IS NULL AND NEW.booking_kind='production' AND NEW.job_id IS NOT NULL THEN SELECT j.internal_job_id INTO NEW.linked_internal_job_id FROM public.dg_native_jobs j WHERE j.visible_identifier=NEW.job_id AND j.archived_at IS NULL;END IF;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.assign_native_production_job_link() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_native_production_job_link() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_production_bookings_assign_native_link BEFORE INSERT OR UPDATE OF job_id ON public.dg_production_bookings FOR EACH ROW EXECUTE FUNCTION public.assign_native_production_job_link();

CREATE OR REPLACE FUNCTION public.sync_native_job_calendar_obligations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=COALESCE(auth.uid(),NEW.updated_by_user_id);v_now timestamptz:=pg_catalog.clock_timestamp();v_order bigint;v_booking public.dg_production_bookings%ROWTYPE;
  v_item public.dg_calendar_items%ROWTYPE;v_date date;v_type text;v_event uuid;
BEGIN
  -- A positive-hours Job first becomes a Production obligation when Shop Date is set. Once present, clearing the date keeps it in Needs Attention.
  SELECT * INTO v_booking FROM public.dg_production_bookings b WHERE b.linked_internal_job_id=NEW.internal_job_id AND b.booking_kind='production'
    AND b.deleted_at IS NULL AND b.cancelled_at IS NULL AND b.completed_at IS NULL AND b.status='active' AND b.schedule_status='confirmed'
    AND b.board_visible IS DISTINCT FROM false ORDER BY b.updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_booking FROM public.dg_production_bookings b WHERE b.job_id=NEW.visible_identifier AND b.booking_kind='production'
      AND b.deleted_at IS NULL AND b.cancelled_at IS NULL AND b.completed_at IS NULL AND b.status='active' AND b.schedule_status='confirmed'
      AND b.board_visible IS DISTINCT FROM false ORDER BY b.updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
    IF FOUND THEN UPDATE public.dg_production_bookings SET linked_internal_job_id=NEW.internal_job_id WHERE booking_id=v_booking.booking_id;END IF;
  END IF;
  IF FOUND THEN
    IF public.parse_production_booking_date(v_booking.production_date) IS DISTINCT FROM NEW.shop_date THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(NEW.shop_date::text,'needs_attention'),0));
      SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM(SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM NEW.shop_date AND b.booking_id<>v_booking.booking_id UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM NEW.shop_date AND i.deleted_at IS NULL)x;
      v_event:=extensions.gen_random_uuid();
      UPDATE public.dg_production_bookings SET job_id=NEW.visible_identifier,title=COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),title),production_date=NEW.shop_date::text,
        shop_hours=NEW.shop_hours,salesperson=NEW.salesperson,day_order=v_order,updated_at=v_now,updated_by=v_actor::text WHERE booking_id=v_booking.booking_id;
      INSERT INTO public.dg_production_booking_moves(move_id,command_id,booking_id,from_production_date,to_production_date,shop_hours_snapshot,actor_user_id,actor_display_name_snapshot,moved_at,original_updated_at_snapshot,wholly_unstarted_acknowledged,source_system,created_at,action_type,reason,destination_was_closed,closed_date_override_acknowledged)
      VALUES(v_event,v_event,v_booking.booking_id,public.parse_production_booking_date(v_booking.production_date),NEW.shop_date,NEW.shop_hours,v_actor,'DoorGo Jobs',v_now,v_booking.updated_at,true,'doorgo_native',v_now,CASE WHEN NEW.shop_date IS NULL THEN 'unschedule' WHEN v_booking.production_date IS NULL THEN 'schedule' ELSE 'reschedule' END,NULL,false,false);
    ELSE UPDATE public.dg_production_bookings SET job_id=NEW.visible_identifier,title=COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),title),shop_hours=NEW.shop_hours,salesperson=NEW.salesperson,updated_at=v_now,updated_by=v_actor::text WHERE booking_id=v_booking.booking_id;END IF;
  ELSIF NEW.shop_date IS NOT NULL AND COALESCE(NEW.shop_hours,0)>0 THEN
    INSERT INTO public.dg_production_bookings(booking_id,job_id,title,production_date,shop_hours,salesperson,status,source,created_at,updated_at,raw_booking,schedule_status,booking_kind,board_visible,all_day,calendar_sync_state,locked,created_by,updated_by,source_system,linked_internal_job_id)
    VALUES('native-'||NEW.internal_job_id::text,NEW.visible_identifier,COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),NEW.visible_identifier),NEW.shop_date::text,NEW.shop_hours,NEW.salesperson,'active','DoorGo Jobs',v_now,v_now,'{}'::jsonb,'confirmed','production',true,true,'native',false,v_actor::text,v_actor::text,'doorgo_native',NEW.internal_job_id);
  END IF;

  IF NEW.fulfillment_plan IN ('Delivery','Customer Pickup') THEN
    v_type:=CASE NEW.fulfillment_plan WHEN 'Delivery' THEN 'delivery' ELSE 'customer_pickup' END;
    v_date:=CASE NEW.fulfillment_plan WHEN 'Delivery' THEN NEW.delivery_date ELSE NEW.customer_pickup_date END;
    SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=NEW.internal_job_id AND i.item_type IN('delivery','customer_pickup') AND i.deleted_at IS NULL AND i.completed_at IS NULL ORDER BY i.updated_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF v_item.scheduled_date IS DISTINCT FROM v_date THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(v_date::text,'needs_attention'),0));
        SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM(SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM v_date UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM v_date AND i.deleted_at IS NULL AND i.item_id<>v_item.item_id)x;
      ELSE v_order:=v_item.day_order;END IF;
      IF v_item.item_type IS DISTINCT FROM v_type OR v_item.scheduled_date IS DISTINCT FROM v_date OR v_item.customer_name IS DISTINCT FROM COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),v_item.customer_name) OR v_item.sales_order IS DISTINCT FROM NEW.biztrack_sales_order OR v_item.salesperson IS DISTINCT FROM NEW.salesperson THEN
        UPDATE public.dg_calendar_items SET item_type=v_type,scheduled_date=v_date,day_order=v_order,customer_name=COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),customer_name),sales_order=NEW.biztrack_sales_order,salesperson=NEW.salesperson,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=v_item.item_id;
      END IF;
      IF v_item.item_type IS DISTINCT FROM v_type OR v_item.scheduled_date IS DISTINCT FROM v_date THEN v_event:=extensions.gen_random_uuid();INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail) VALUES(v_event,v_item.item_id,CASE WHEN v_date IS NULL THEN 'unschedule' WHEN v_item.scheduled_date IS NULL THEN 'schedule' ELSE 'reschedule' END,v_item.scheduled_date,v_date,v_item.day_order,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('from_type',v_item.item_type,'to_type',v_type,'source','native_job'));END IF;
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(v_date::text,'needs_attention'),0));
      SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM(SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM v_date UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM v_date AND i.deleted_at IS NULL)x;
      INSERT INTO public.dg_calendar_items(item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
      VALUES(v_type,v_date,NEW.internal_job_id,COALESCE(NEW.biztrack_sales_order,NEW.visible_identifier),COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),NEW.visible_identifier),NEW.biztrack_sales_order,NEW.salesperson,v_order,v_now,v_now,v_actor,v_actor) RETURNING * INTO v_item;
      v_event:=extensions.gen_random_uuid();INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at,detail) VALUES(v_event,v_item.item_id,'create',v_date,v_order,v_actor,v_now,'{"source":"native_job"}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.sync_native_job_calendar_obligations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_native_job_calendar_obligations() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS dg_native_jobs_sync_shop_date_to_production ON public.dg_native_jobs;
CREATE TRIGGER dg_native_jobs_sync_calendar_obligations AFTER INSERT OR UPDATE OF shop_date,shop_hours,customer,biztrack_sales_order,salesperson,fulfillment_plan,delivery_date,customer_pickup_date,visible_identifier ON public.dg_native_jobs FOR EACH ROW EXECUTE FUNCTION public.sync_native_job_calendar_obligations();

CREATE OR REPLACE FUNCTION public.sync_calendar_fulfillment_to_native_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF NEW.linked_internal_job_id IS NULL OR NEW.item_type NOT IN('delivery','customer_pickup') OR NEW.completed_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND NEW.item_type IS NOT DISTINCT FROM OLD.item_type AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date THEN RETURN NEW;END IF;
  UPDATE public.dg_native_jobs SET fulfillment_plan=CASE NEW.item_type WHEN 'delivery' THEN 'Delivery' ELSE 'Customer Pickup' END,
    delivery_date=CASE WHEN NEW.item_type='delivery' THEN NEW.scheduled_date ELSE NULL END,customer_pickup_date=CASE WHEN NEW.item_type='customer_pickup' THEN NEW.scheduled_date ELSE NULL END,
    revision=revision+1,updated_at=v_now,updated_by_user_id=COALESCE(auth.uid(),NEW.updated_by_user_id) WHERE internal_job_id=NEW.linked_internal_job_id;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.sync_calendar_fulfillment_to_native_job() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_calendar_fulfillment_to_native_job() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_calendar_items_sync_fulfillment_to_job AFTER INSERT OR UPDATE OF item_type,scheduled_date,completed_at,deleted_at ON public.dg_calendar_items FOR EACH ROW EXECUTE FUNCTION public.sync_calendar_fulfillment_to_native_job();

COMMIT;
