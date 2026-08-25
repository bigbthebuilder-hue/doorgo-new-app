-- Calendar-centric fulfillment linkage and exact-item lifecycle corrections.
BEGIN;

-- Fulfillment-only Job edits must not execute Production synchronization work.
DROP TRIGGER IF EXISTS dg_native_jobs_sync_calendar_obligations ON public.dg_native_jobs;
CREATE TRIGGER dg_native_jobs_sync_calendar_obligations
AFTER INSERT OR UPDATE OF shop_date,shop_hours,customer,biztrack_sales_order,salesperson,visible_identifier
ON public.dg_native_jobs FOR EACH ROW EXECUTE FUNCTION public.sync_native_job_calendar_obligations();

CREATE OR REPLACE FUNCTION public.sync_native_job_fulfillment_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=COALESCE(auth.uid(),NEW.updated_by_user_id);v_type text;v_date date;v_item public.dg_calendar_items%ROWTYPE;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();v_event uuid;
BEGIN
  IF NEW.fulfillment_plan NOT IN('Delivery','Customer Pickup') THEN RETURN NEW;END IF;
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
CREATE TRIGGER dg_native_jobs_sync_fulfillment_obligation AFTER INSERT OR UPDATE OF fulfillment_plan,delivery_date,customer_pickup_date ON public.dg_native_jobs FOR EACH ROW EXECUTE FUNCTION public.sync_native_job_fulfillment_obligation();

-- Repair only the audited Kris Stewart native-primary test artifact.
UPDATE public.dg_calendar_items SET linked_internal_job_id='9bb28960-44d1-49e0-baf0-0f31a0ffe3fb',current_portion_id='45ce38e7-e5d3-4e2d-8b1f-0796d1b3dadf',order_family_key='1198765',sales_order='1198765'
WHERE item_id='49a3eae5-f677-4174-8969-8bcc83db2ab1' AND item_type='delivery' AND deleted_at IS NULL AND completed_at IS NULL AND linked_internal_job_id IS NULL AND current_portion_id IS NULL;
UPDATE public.dg_native_jobs SET fulfillment_plan='Delivery',delivery_date='2026-08-19',customer_pickup_date=NULL,revision=revision+1,updated_at=pg_catalog.clock_timestamp()
WHERE internal_job_id='9bb28960-44d1-49e0-baf0-0f31a0ffe3fb' AND fulfillment_plan IS NULL AND delivery_date IS NULL AND customer_pickup_date IS NULL;

CREATE OR REPLACE FUNCTION public.set_fulfillment_item_type(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_item_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_portion public.dg_fulfillment_order_portions%ROWTYPE;v_primary text;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_request';END IF;
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.current_portion_id IS NOT NULL AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;
  IF v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.completed_item';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  SELECT * INTO v_portion FROM public.dg_fulfillment_order_portions p WHERE p.portion_id=v_item.current_portion_id AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.unknown_order';END IF;
  SELECT j.biztrack_sales_order INTO v_primary FROM public.dg_native_jobs j WHERE j.internal_job_id=v_portion.linked_internal_job_id;
  IF v_item.item_type IS DISTINCT FROM p_item_type THEN UPDATE public.dg_calendar_items SET item_type=p_item_type,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;END IF;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,p_item_id,'reschedule',v_item.scheduled_date,v_item.scheduled_date,v_item.day_order,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','type_change','from_type',v_item.item_type,'to_type',p_item_type,'sales_order',v_portion.sales_order));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'item_type',p_item_type,'revision',v_item.revision+CASE WHEN v_item.item_type IS DISTINCT FROM p_item_type THEN 1 ELSE 0 END,'primary_order',v_portion.sales_order=v_primary);
END;$$;
ALTER FUNCTION public.set_fulfillment_item_type(uuid,uuid,bigint,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_fulfillment_item_type(uuid,uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_fulfillment_item_type(uuid,uuid,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_fulfillment_backorder(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_sales_order text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_portion public.dg_fulfillment_order_portions%ROWTYPE;v_primary text;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.current_portion_id IS NOT NULL AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;
  IF v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.completed_item';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  SELECT * INTO v_portion FROM public.dg_fulfillment_order_portions p WHERE p.portion_id=v_item.current_portion_id AND p.sales_order=pg_catalog.btrim(p_sales_order) AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.unknown_order';END IF;
  SELECT j.biztrack_sales_order INTO v_primary FROM public.dg_native_jobs j WHERE j.internal_job_id=v_portion.linked_internal_job_id;
  IF v_portion.sales_order=v_primary THEN RAISE EXCEPTION USING MESSAGE='fulfillment.primary_order_required';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||v_portion.linked_internal_job_id::text||':'||v_portion.family_key,0));
  UPDATE public.dg_fulfillment_order_portions SET deleted_at=v_now,deleted_by_user_id=v_actor WHERE portion_id=v_portion.portion_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,p_item_id,'delete',v_item.scheduled_date,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','delete_backorder_portion','portion_id',v_portion.portion_id,'sales_order',v_portion.sales_order));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'sales_order',v_portion.sales_order,'item_deleted',true,'remaining_orders',ARRAY[]::text[],'revision',v_item.revision+1);
END;$$;
ALTER FUNCTION public.delete_fulfillment_backorder(uuid,uuid,bigint,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_fulfillment_backorder(uuid,uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_fulfillment_backorder(uuid,uuid,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_fulfillment_backorder_auto(p_command_id uuid,p_linked_internal_job_id uuid,p_item_type text,p_scheduled_date date,p_timing text,p_fulfillment_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_job public.dg_native_jobs%ROWTYPE;v_family text;v_sales_order text;v_portion uuid;v_item uuid:=extensions.gen_random_uuid();v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_linked_internal_job_id IS NULL OR p_item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_request';END IF;
  SELECT * INTO v_job FROM public.dg_native_jobs j WHERE j.internal_job_id=p_linked_internal_job_id AND j.archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.job_not_found';END IF;
  v_family:=public.dg_sales_order_family(v_job.biztrack_sales_order);IF v_family IS NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.wrong_order_family';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||p_linked_internal_job_id::text||':'||v_family,0));
  SELECT candidate::text INTO v_sales_order FROM pg_catalog.generate_series(v_job.biztrack_sales_order::bigint+1,v_job.biztrack_sales_order::bigint+4) candidate
    WHERE public.dg_sales_order_family(candidate::text)=v_family AND NOT EXISTS(SELECT 1 FROM public.dg_fulfillment_order_portions p WHERE p.linked_internal_job_id=p_linked_internal_job_id AND p.sales_order=candidate::text AND p.deleted_at IS NULL) ORDER BY candidate LIMIT 1;
  IF v_sales_order IS NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.no_available_backorder';END IF;
  INSERT INTO public.dg_fulfillment_order_portions(linked_internal_job_id,family_key,sales_order,customer_name,salesperson,created_at,created_by_user_id)VALUES(p_linked_internal_job_id,v_family,v_sales_order,COALESCE(NULLIF(pg_catalog.btrim(v_job.customer),''),v_sales_order),v_job.salesperson,v_now,v_actor)RETURNING portion_id INTO v_portion;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(p_scheduled_date,NULL);
  INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,current_portion_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
  VALUES(v_item,p_item_type,p_scheduled_date,NULL,v_portion,v_family,COALESCE(NULLIF(pg_catalog.btrim(v_job.customer),''),v_sales_order),v_sales_order,v_job.salesperson,NULLIF(pg_catalog.btrim(p_timing),''),COALESCE(NULLIF(pg_catalog.btrim(p_fulfillment_note),''),NULLIF(pg_catalog.btrim(v_job.notes),'')),v_order,v_now,v_now,v_actor,v_actor);
  INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_at,attached_by_user_id)VALUES(v_item,v_portion,v_now,v_actor);
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,v_item,'create',p_scheduled_date,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','calendar_add_backorder','sales_order',v_sales_order));
  RETURN pg_catalog.jsonb_build_object('item_id',v_item,'portion_id',v_portion,'family_key',v_family,'sales_order',v_sales_order,'scheduled_date',p_scheduled_date);
END;$$;
ALTER FUNCTION public.add_fulfillment_backorder_auto(uuid,uuid,text,date,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_fulfillment_backorder_auto(uuid,uuid,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_fulfillment_backorder_auto(uuid,uuid,text,date,text,text) TO authenticated;

COMMIT;
