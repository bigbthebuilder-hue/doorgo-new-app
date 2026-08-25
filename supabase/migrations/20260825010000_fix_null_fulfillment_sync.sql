-- Clearing a primary fulfillment obligation must not fall through NULL SQL logic and recreate it as Pickup.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_native_job_fulfillment_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=COALESCE(auth.uid(),NEW.updated_by_user_id);v_type text;v_date date;v_item public.dg_calendar_items%ROWTYPE;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();v_event uuid;
BEGIN
  IF NEW.fulfillment_plan IS NULL OR NEW.fulfillment_plan NOT IN('Delivery','Customer Pickup') THEN RETURN NEW;END IF;
  v_type:=CASE NEW.fulfillment_plan WHEN 'Delivery' THEN 'delivery' ELSE 'customer_pickup' END;
  v_date:=CASE NEW.fulfillment_plan WHEN 'Delivery' THEN NEW.delivery_date ELSE NEW.customer_pickup_date END;
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=NEW.internal_job_id AND i.item_type IN('delivery','customer_pickup') AND i.deleted_at IS NULL AND i.completed_at IS NULL ORDER BY i.updated_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_item.scheduled_date IS DISTINCT FROM v_date THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(v_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(v_date,v_item.item_id);ELSE v_order:=v_item.day_order;END IF;
    IF v_item.item_type IS DISTINCT FROM v_type OR v_item.scheduled_date IS DISTINCT FROM v_date OR v_item.customer_name IS DISTINCT FROM COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),v_item.customer_name) OR v_item.sales_order IS DISTINCT FROM NEW.biztrack_sales_order OR v_item.salesperson IS DISTINCT FROM NEW.salesperson THEN
      UPDATE public.dg_calendar_items SET item_type=v_type,scheduled_date=v_date,day_order=v_order,customer_name=COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),customer_name),sales_order=NEW.biztrack_sales_order,salesperson=NEW.salesperson,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=v_item.item_id;
    END IF;
    IF v_item.item_type IS DISTINCT FROM v_type OR v_item.scheduled_date IS DISTINCT FROM v_date THEN v_event:=extensions.gen_random_uuid();INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail)VALUES(v_event,v_item.item_id,CASE WHEN v_date IS NULL THEN 'unschedule' WHEN v_item.scheduled_date IS NULL THEN 'schedule' ELSE 'reschedule' END,v_item.scheduled_date,v_date,v_item.day_order,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('from_type',v_item.item_type,'to_type',v_type,'source','native_job_fulfillment'));END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(v_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(v_date,NULL);
    INSERT INTO public.dg_calendar_items(item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
    VALUES(v_type,v_date,NEW.internal_job_id,public.dg_sales_order_family(NEW.biztrack_sales_order),COALESCE(NULLIF(pg_catalog.btrim(NEW.customer),''),NEW.visible_identifier),NEW.biztrack_sales_order,NEW.salesperson,v_order,v_now,v_now,v_actor,v_actor) RETURNING * INTO v_item;
    v_event:=extensions.gen_random_uuid();INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at,detail)VALUES(v_event,v_item.item_id,'create',v_date,v_order,v_actor,v_now,'{"source":"native_job_fulfillment"}'::jsonb);
  END IF;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.sync_native_job_fulfillment_obligation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_native_job_fulfillment_obligation() FROM PUBLIC,anon,authenticated;

COMMIT;
