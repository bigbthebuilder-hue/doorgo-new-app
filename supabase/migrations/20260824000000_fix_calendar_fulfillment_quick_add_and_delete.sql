BEGIN;

WITH orphaned AS (
  UPDATE public.dg_calendar_items i SET deleted_at=pg_catalog.clock_timestamp(),revision=i.revision+1,updated_at=pg_catalog.clock_timestamp()
  WHERE i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_type IN('delivery','customer_pickup') AND i.linked_internal_job_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.dg_calendar_item_orders own WHERE own.item_id=i.item_id)
    AND EXISTS(SELECT 1 FROM public.dg_fulfillment_order_portions p JOIN public.dg_calendar_item_orders m ON m.portion_id=p.portion_id JOIN public.dg_calendar_items owner ON owner.item_id=m.item_id JOIN public.dg_native_jobs j ON j.internal_job_id=p.linked_internal_job_id WHERE p.linked_internal_job_id=i.linked_internal_job_id AND p.sales_order=j.biztrack_sales_order AND owner.item_type=i.item_type AND owner.deleted_at IS NULL AND owner.completed_at IS NULL)
  RETURNING i.*
)
INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail)
SELECT extensions.gen_random_uuid(),o.item_id,'delete',o.scheduled_date,o.day_order,COALESCE(o.updated_by_user_id,o.created_by_user_id),pg_catalog.clock_timestamp(),'{"source":"duplicate_fulfillment_cleanup"}'::jsonb FROM orphaned o;

CREATE OR REPLACE FUNCTION public.search_calendar_linkable_jobs(p_query text,p_item_type text,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_query text:=pg_catalog.btrim(p_query);v_limit integer:=COALESCE(p_limit,20);v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true) THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND p.access_level IN('view','use')) THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required';END IF;
  IF v_query='' OR p_item_type NOT IN('production','delivery','customer_pickup','note') OR v_limit<1 OR v_limit>50 THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed';END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(found) ORDER BY found.updated_at DESC,found.internal_job_id DESC),'[]'::jsonb) INTO v_result FROM(
    SELECT j.internal_job_id,j.customer,j.biztrack_sales_order,j.door_go_reference,j.visible_identifier,j.salesperson,j.fulfillment_plan,j.revision,j.updated_at
    FROM public.dg_native_jobs j
    WHERE j.archived_at IS NULL AND j.origin IN('native','legacy_transfer')
      AND (j.customer ILIKE '%'||v_query||'%' OR j.biztrack_sales_order ILIKE '%'||v_query||'%' OR j.door_go_reference ILIKE '%'||v_query||'%' OR j.visible_identifier ILIKE '%'||v_query||'%')
      AND (p_item_type IN('production','note') OR (p_item_type='delivery' AND (j.fulfillment_plan IS NULL OR j.fulfillment_plan='Delivery')) OR (p_item_type='customer_pickup' AND (j.fulfillment_plan IS NULL OR j.fulfillment_plan='Customer Pickup')))
    ORDER BY j.updated_at DESC,j.internal_job_id DESC LIMIT v_limit
  )found;
  RETURN v_result;
END;$$;
ALTER FUNCTION public.search_calendar_linkable_jobs(text,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.search_calendar_linkable_jobs(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_calendar_linkable_jobs(text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_linked_fulfillment_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.linked_internal_job_id IS NULL OR NEW.item_type NOT IN('delivery','customer_pickup') OR NEW.deleted_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN RETURN NEW;END IF;
  IF EXISTS(
    SELECT 1 FROM public.dg_calendar_items i
    WHERE i.linked_internal_job_id=NEW.linked_internal_job_id AND i.item_type=NEW.item_type AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_id<>NEW.item_id
  ) OR EXISTS(
    SELECT 1 FROM public.dg_fulfillment_order_portions p JOIN public.dg_calendar_item_orders m ON m.portion_id=p.portion_id JOIN public.dg_calendar_items i ON i.item_id=m.item_id
    JOIN public.dg_native_jobs j ON j.internal_job_id=p.linked_internal_job_id
    WHERE p.linked_internal_job_id=NEW.linked_internal_job_id AND p.sales_order=j.biztrack_sales_order AND i.item_type=NEW.item_type AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_id<>NEW.item_id
  ) THEN RAISE EXCEPTION USING MESSAGE='calendar_item.duplicate_fulfillment';END IF;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.prevent_duplicate_linked_fulfillment_item() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_duplicate_linked_fulfillment_item() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_calendar_items_prevent_duplicate_linked_fulfillment BEFORE INSERT OR UPDATE OF linked_internal_job_id,item_type,deleted_at,completed_at ON public.dg_calendar_items FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_linked_fulfillment_item();

CREATE OR REPLACE FUNCTION public.schedule_linked_fulfillment(p_command_id uuid,p_linked_internal_job_id uuid,p_item_type text,p_scheduled_date date,p_timing text,p_fulfillment_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_job public.dg_native_jobs%ROWTYPE;v_item public.dg_calendar_items%ROWTYPE;v_portion uuid;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();v_action text;
BEGIN
  IF p_command_id IS NULL OR p_linked_internal_job_id IS NULL OR p_item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND p.access_level='use') THEN RAISE EXCEPTION USING MESSAGE='calendar_item.jobs_permission_required';END IF;
  SELECT * INTO v_job FROM public.dg_native_jobs j WHERE j.internal_job_id=p_linked_internal_job_id AND j.archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.job_not_found';END IF;
  IF (p_item_type='delivery' AND v_job.fulfillment_plan='Customer Pickup') OR (p_item_type='customer_pickup' AND v_job.fulfillment_plan='Delivery') THEN RAISE EXCEPTION USING MESSAGE='calendar_item.fulfillment_mismatch';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||p_linked_internal_job_id::text||':'||COALESCE(public.dg_sales_order_family(v_job.biztrack_sales_order),v_job.biztrack_sales_order),0));
  SELECT p.portion_id INTO v_portion FROM public.dg_fulfillment_order_portions p WHERE p.linked_internal_job_id=p_linked_internal_job_id AND p.sales_order=v_job.biztrack_sales_order FOR UPDATE;
  IF v_portion IS NOT NULL THEN SELECT i.* INTO v_item FROM public.dg_calendar_item_orders m JOIN public.dg_calendar_items i ON i.item_id=m.item_id WHERE m.portion_id=v_portion AND i.deleted_at IS NULL AND i.completed_at IS NULL ORDER BY i.updated_at DESC LIMIT 1 FOR UPDATE;END IF;
  IF v_item.item_id IS NULL THEN SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=p_linked_internal_job_id AND i.item_type=p_item_type AND i.deleted_at IS NULL AND i.completed_at IS NULL ORDER BY i.updated_at DESC LIMIT 1 FOR UPDATE;END IF;
  IF v_item.item_id IS NOT NULL AND v_item.item_type<>p_item_type THEN RAISE EXCEPTION USING MESSAGE='calendar_item.fulfillment_mismatch';END IF;
  IF v_item.item_id IS NOT NULL THEN UPDATE public.dg_calendar_items i SET deleted_at=v_now,revision=i.revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE i.item_id<>v_item.item_id AND i.linked_internal_job_id=p_linked_internal_job_id AND i.item_type=p_item_type AND i.deleted_at IS NULL AND i.completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.dg_calendar_item_orders m WHERE m.item_id=i.item_id);END IF;
  IF v_item.item_id IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(p_scheduled_date,NULL);
    INSERT INTO public.dg_calendar_items(item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
    VALUES(p_item_type,p_scheduled_date,p_linked_internal_job_id,public.dg_sales_order_family(v_job.biztrack_sales_order),COALESCE(NULLIF(pg_catalog.btrim(v_job.customer),''),v_job.visible_identifier),v_job.biztrack_sales_order,v_job.salesperson,NULLIF(pg_catalog.btrim(p_timing),''),COALESCE(NULLIF(pg_catalog.btrim(p_fulfillment_note),''),NULLIF(pg_catalog.btrim(v_job.notes),'')),v_order,v_now,v_now,v_actor,v_actor) RETURNING * INTO v_item;
    v_action:='create';
  ELSE
    IF v_item.scheduled_date IS DISTINCT FROM p_scheduled_date THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(p_scheduled_date,v_item.item_id);ELSE v_order:=v_item.day_order;END IF;
    v_action:=CASE WHEN p_scheduled_date IS NULL THEN 'unschedule' WHEN v_item.scheduled_date IS NULL THEN 'schedule' ELSE 'reschedule' END;
    UPDATE public.dg_calendar_items SET linked_internal_job_id=p_linked_internal_job_id,scheduled_date=p_scheduled_date,day_order=v_order,timing=COALESCE(NULLIF(pg_catalog.btrim(p_timing),''),timing),fulfillment_note=COALESCE(NULLIF(pg_catalog.btrim(p_fulfillment_note),''),fulfillment_note),revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=v_item.item_id;
  END IF;
  UPDATE public.dg_native_jobs SET fulfillment_plan=CASE p_item_type WHEN 'delivery' THEN 'Delivery' ELSE 'Customer Pickup' END,delivery_date=CASE WHEN p_item_type='delivery' THEN p_scheduled_date ELSE NULL END,customer_pickup_date=CASE WHEN p_item_type='customer_pickup' THEN p_scheduled_date ELSE NULL END,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE internal_job_id=p_linked_internal_job_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail) VALUES(p_command_id,v_item.item_id,v_action,v_item.scheduled_date,p_scheduled_date,v_item.day_order,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','quick_add','reused',v_action<>'create'));
  RETURN pg_catalog.jsonb_build_object('record_kind','calendar_item','item_id',v_item.item_id,'scheduled_date',p_scheduled_date,'day_order',v_order,'reused',v_action<>'create');
END;$$;
ALTER FUNCTION public.schedule_linked_fulfillment(uuid,uuid,text,date,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.schedule_linked_fulfillment(uuid,uuid,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.schedule_linked_fulfillment(uuid,uuid,text,date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_calendar_item(p_command_id uuid,p_item_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_job_id uuid;v_base_order text;v_has_orders boolean;v_replacement uuid;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_item_id IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item';END IF;
  IF v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item';END IF;
  SELECT EXISTS(SELECT 1 FROM public.dg_calendar_item_orders m WHERE m.item_id=p_item_id) INTO v_has_orders;
  SELECT p.linked_internal_job_id,j.biztrack_sales_order INTO v_job_id,v_base_order FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id JOIN public.dg_native_jobs j ON j.internal_job_id=p.linked_internal_job_id WHERE m.item_id=p_item_id LIMIT 1;
  UPDATE public.dg_calendar_items SET deleted_at=v_now,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  IF v_has_orders THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:needs_attention',0));v_order:=public.dg_fulfillment_day_order(NULL,NULL);v_replacement:=extensions.gen_random_uuid();
    INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
    VALUES(v_replacement,v_item.item_type,NULL,NULL,v_item.order_family_key,v_item.customer_name,v_item.sales_order,v_item.salesperson,v_item.timing,v_item.fulfillment_note,v_order,v_now,v_now,v_actor,v_actor);
    UPDATE public.dg_calendar_item_orders SET item_id=v_replacement,attached_at=v_now,attached_by_user_id=v_actor WHERE item_id=p_item_id;
    IF EXISTS(SELECT 1 FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id WHERE m.item_id=v_replacement AND p.sales_order=v_base_order) THEN
      UPDATE public.dg_calendar_items SET linked_internal_job_id=v_job_id WHERE item_id=v_replacement;
      UPDATE public.dg_native_jobs SET delivery_date=CASE WHEN v_item.item_type='delivery' THEN NULL ELSE delivery_date END,customer_pickup_date=CASE WHEN v_item.item_type='customer_pickup' THEN NULL ELSE customer_pickup_date END,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE internal_job_id=v_job_id;
    END IF;
  END IF;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail) VALUES(p_command_id,p_item_id,'delete',v_item.scheduled_date,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('replacement_item_id',v_replacement,'preserved_order_portions',v_has_orders));
  IF v_replacement IS NOT NULL THEN INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_day_order,actor_user_id,occurred_at,detail) VALUES(extensions.gen_random_uuid(),v_replacement,'unschedule',v_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','delete_reconciliation','deleted_item_id',p_item_id));END IF;
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'replacement_item_id',v_replacement,'preserved_order_portions',v_has_orders);
END;$$;
ALTER FUNCTION public.delete_calendar_item(uuid,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_calendar_item(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_calendar_item(uuid,uuid,bigint) TO authenticated;

COMMIT;
