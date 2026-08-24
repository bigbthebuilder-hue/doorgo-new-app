-- Automatic backorder allocation, fulfillment disposition, and recoverable portion deletion.
BEGIN;

ALTER TABLE public.dg_fulfillment_order_portions
  ADD COLUMN deleted_at timestamptz NULL,
  ADD COLUMN deleted_by_user_id uuid NULL REFERENCES auth.users(id);
ALTER TABLE public.dg_calendar_item_orders
  ADD COLUMN send_on_completion boolean NOT NULL DEFAULT true;

ALTER TABLE public.dg_fulfillment_order_portions
  DROP CONSTRAINT dg_fulfillment_order_portions_linked_internal_job_id_sales__key;
CREATE UNIQUE INDEX dg_fulfillment_order_portions_current_order_idx
  ON public.dg_fulfillment_order_portions(linked_internal_job_id,sales_order)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_primary_fulfillment_order_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job public.dg_native_jobs%ROWTYPE;v_family text;v_portion uuid;v_actor uuid:=COALESCE(auth.uid(),NEW.updated_by_user_id);
BEGIN
  IF NEW.linked_internal_job_id IS NULL OR NEW.item_type NOT IN('delivery','customer_pickup') OR NEW.deleted_at IS NOT NULL THEN RETURN NEW;END IF;
  SELECT * INTO v_job FROM public.dg_native_jobs j WHERE j.internal_job_id=NEW.linked_internal_job_id;v_family:=public.dg_sales_order_family(v_job.biztrack_sales_order);IF v_family IS NULL THEN RETURN NEW;END IF;
  SELECT p.portion_id INTO v_portion FROM public.dg_fulfillment_order_portions p WHERE p.linked_internal_job_id=NEW.linked_internal_job_id AND p.sales_order=v_job.biztrack_sales_order AND p.deleted_at IS NULL FOR UPDATE;
  IF v_portion IS NULL THEN INSERT INTO public.dg_fulfillment_order_portions(linked_internal_job_id,family_key,sales_order,customer_name,salesperson,created_by_user_id)VALUES(NEW.linked_internal_job_id,v_family,v_job.biztrack_sales_order,NEW.customer_name,NEW.salesperson,v_actor)RETURNING portion_id INTO v_portion;
  ELSE UPDATE public.dg_fulfillment_order_portions SET customer_name=NEW.customer_name,salesperson=NEW.salesperson WHERE portion_id=v_portion;END IF;
  INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_by_user_id)VALUES(NEW.item_id,v_portion,v_actor)ON CONFLICT DO NOTHING;
  UPDATE public.dg_calendar_items SET order_family_key=v_family,sales_order=v_job.biztrack_sales_order WHERE item_id=NEW.item_id AND (order_family_key IS DISTINCT FROM v_family OR sales_order IS DISTINCT FROM v_job.biztrack_sales_order);RETURN NEW;
END;$$;
ALTER FUNCTION public.ensure_primary_fulfillment_order_membership() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_primary_fulfillment_order_membership() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.add_fulfillment_backorder_auto(p_command_id uuid,p_linked_internal_job_id uuid,p_item_type text,p_scheduled_date date,p_timing text,p_fulfillment_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_job public.dg_native_jobs%ROWTYPE;v_family text;v_sales_order text;v_portion uuid;v_item uuid:=extensions.gen_random_uuid();v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_linked_internal_job_id IS NULL OR p_item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_request';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND p.access_level='use') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.jobs_permission_required';END IF;
  SELECT * INTO v_job FROM public.dg_native_jobs j WHERE j.internal_job_id=p_linked_internal_job_id AND j.archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.job_not_found';END IF;
  v_family:=public.dg_sales_order_family(v_job.biztrack_sales_order);
  IF v_family IS NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.wrong_order_family';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||p_linked_internal_job_id::text||':'||v_family,0));
  SELECT candidate::text INTO v_sales_order FROM pg_catalog.generate_series(v_job.biztrack_sales_order::bigint+1,v_job.biztrack_sales_order::bigint+4) candidate
    WHERE public.dg_sales_order_family(candidate::text)=v_family AND NOT EXISTS(SELECT 1 FROM public.dg_fulfillment_order_portions p WHERE p.linked_internal_job_id=p_linked_internal_job_id AND p.sales_order=candidate::text AND p.deleted_at IS NULL)
    ORDER BY candidate LIMIT 1;
  IF v_sales_order IS NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.no_available_backorder';END IF;
  INSERT INTO public.dg_fulfillment_order_portions(linked_internal_job_id,family_key,sales_order,customer_name,salesperson,created_at,created_by_user_id)
  VALUES(p_linked_internal_job_id,v_family,v_sales_order,COALESCE(NULLIF(pg_catalog.btrim(v_job.customer),''),v_sales_order),v_job.salesperson,v_now,v_actor) RETURNING portion_id INTO v_portion;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(p_scheduled_date,NULL);
  INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
  VALUES(v_item,p_item_type,p_scheduled_date,NULL,v_family,COALESCE(NULLIF(pg_catalog.btrim(v_job.customer),''),v_sales_order),v_sales_order,v_job.salesperson,NULLIF(pg_catalog.btrim(p_timing),''),COALESCE(NULLIF(pg_catalog.btrim(p_fulfillment_note),''),NULLIF(pg_catalog.btrim(v_job.notes),'')),v_order,v_now,v_now,v_actor,v_actor);
  INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_at,attached_by_user_id)VALUES(v_item,v_portion,v_now,v_actor);
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,v_item,'create',p_scheduled_date,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','add_backorder_auto','sales_order',v_sales_order));
  RETURN pg_catalog.jsonb_build_object('item_id',v_item,'portion_id',v_portion,'family_key',v_family,'sales_order',v_sales_order,'scheduled_date',p_scheduled_date);
END;$$;
ALTER FUNCTION public.add_fulfillment_backorder_auto(uuid,uuid,text,date,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_fulfillment_backorder_auto(uuid,uuid,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_fulfillment_backorder_auto(uuid,uuid,text,date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_fulfillment_order_dispositions(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_send_sales_orders text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_all text[];v_send text[];v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_type IN('delivery','customer_pickup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  SELECT COALESCE(pg_catalog.array_agg(p.sales_order ORDER BY p.sales_order),ARRAY[]::text[]) INTO v_all FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id WHERE m.item_id=p_item_id AND p.deleted_at IS NULL;
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT x ORDER BY x),ARRAY[]::text[]) INTO v_send FROM pg_catalog.unnest(COALESCE(p_send_sales_orders,ARRAY[]::text[]))x;
  IF NOT(v_all @> v_send) THEN RAISE EXCEPTION USING MESSAGE='fulfillment.unknown_order';END IF;
  UPDATE public.dg_calendar_item_orders m SET send_on_completion=(p.sales_order=ANY(v_send)),attached_at=v_now,attached_by_user_id=v_actor FROM public.dg_fulfillment_order_portions p WHERE m.item_id=p_item_id AND m.portion_id=p.portion_id AND p.deleted_at IS NULL;
  UPDATE public.dg_calendar_items SET revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,p_item_id,'reorder',v_item.scheduled_date,v_item.scheduled_date,v_item.day_order,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('send_orders',v_send,'dont_send_orders',(SELECT COALESCE(pg_catalog.jsonb_agg(x),'[]'::jsonb) FROM pg_catalog.unnest(v_all)x WHERE NOT(x=ANY(v_send)))));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'revision',v_item.revision+1,'send_orders',v_send);
END;$$;
ALTER FUNCTION public.set_fulfillment_order_dispositions(uuid,uuid,bigint,text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_fulfillment_order_dispositions(uuid,uuid,bigint,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_fulfillment_order_dispositions(uuid,uuid,bigint,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_fulfillment_orders(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_fulfilled_sales_orders text[],p_remaining_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_all text[];v_done text[];v_remaining text[];v_new_item uuid;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL AND i.item_type IN('delivery','customer_pickup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;
  IF v_item.revision<>p_expected_revision OR v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  SELECT COALESCE(pg_catalog.array_agg(p.sales_order ORDER BY p.sales_order),ARRAY[]::text[]) INTO v_all FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id WHERE m.item_id=p_item_id AND p.deleted_at IS NULL;
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT x ORDER BY x),ARRAY[]::text[]) INTO v_done FROM pg_catalog.unnest(COALESCE(p_fulfilled_sales_orders,ARRAY[]::text[]))x;
  IF pg_catalog.cardinality(v_done)=0 OR NOT(v_all @> v_done) THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_completion';END IF;
  SELECT COALESCE(pg_catalog.array_agg(x ORDER BY x),ARRAY[]::text[]) INTO v_remaining FROM pg_catalog.unnest(v_all)x WHERE NOT(x=ANY(v_done));
  IF pg_catalog.cardinality(v_remaining)>0 THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:needs_attention',0));v_order:=public.dg_fulfillment_day_order(NULL,NULL);v_new_item:=extensions.gen_random_uuid();
    INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)VALUES(v_new_item,v_item.item_type,NULL,NULL,v_item.order_family_key,v_item.customer_name,v_remaining[1],v_item.salesperson,v_item.timing,v_item.fulfillment_note,v_order,v_now,v_now,v_actor,v_actor);
    UPDATE public.dg_calendar_item_orders m SET item_id=v_new_item,send_on_completion=true,attached_at=v_now,attached_by_user_id=v_actor FROM public.dg_fulfillment_order_portions p WHERE m.portion_id=p.portion_id AND m.item_id=p_item_id AND p.sales_order=ANY(v_remaining) AND p.deleted_at IS NULL;
    INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_day_order,actor_user_id,occurred_at,detail)VALUES(extensions.gen_random_uuid(),v_new_item,'split',v_order,v_actor,v_now,pg_catalog.jsonb_build_object('from_item_id',p_item_id,'remaining_orders',v_remaining,'destination','needs_attention'));
  END IF;
  UPDATE public.dg_calendar_items SET completed_at=v_now,completed_by_user_id=v_actor,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,p_item_id,'complete',v_item.scheduled_date,v_item.scheduled_date,v_item.day_order,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('fulfilled_orders',v_done,'remaining_orders',v_remaining,'split_item_id',v_new_item));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'completed_at',v_now,'revision',v_item.revision+1,'fulfilled_orders',v_done,'remaining_orders',v_remaining,'split_item_id',v_new_item,'remaining_date',NULL);
END;$$;
ALTER FUNCTION public.complete_fulfillment_orders(uuid,uuid,bigint,text[],date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_fulfillment_orders(uuid,uuid,bigint,text[],date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_fulfillment_orders(uuid,uuid,bigint,text[],date) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_fulfillment_backorder(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_sales_order text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_portion public.dg_fulfillment_order_portions%ROWTYPE;v_primary text;v_remaining text[];v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_type IN('delivery','customer_pickup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  SELECT p.* INTO v_portion FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id WHERE m.item_id=p_item_id AND p.sales_order=pg_catalog.btrim(p_sales_order) AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.unknown_order';END IF;
  SELECT j.biztrack_sales_order INTO v_primary FROM public.dg_native_jobs j WHERE j.internal_job_id=v_portion.linked_internal_job_id;
  IF v_portion.sales_order=v_primary THEN RAISE EXCEPTION USING MESSAGE='fulfillment.primary_order_required';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||v_portion.linked_internal_job_id::text||':'||v_portion.family_key,0));
  UPDATE public.dg_fulfillment_order_portions SET deleted_at=v_now,deleted_by_user_id=v_actor WHERE portion_id=v_portion.portion_id;
  SELECT COALESCE(pg_catalog.array_agg(p.sales_order ORDER BY p.sales_order),ARRAY[]::text[]) INTO v_remaining FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id WHERE m.item_id=p_item_id AND p.deleted_at IS NULL;
  IF pg_catalog.cardinality(v_remaining)=0 THEN UPDATE public.dg_calendar_items SET deleted_at=v_now,deleted_by_user_id=v_actor,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  ELSE UPDATE public.dg_calendar_items SET sales_order=v_remaining[1],revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;END IF;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,p_item_id,'delete',v_item.scheduled_date,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','delete_backorder_portion','portion_id',v_portion.portion_id,'sales_order',v_portion.sales_order,'remaining_orders',v_remaining));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'sales_order',v_portion.sales_order,'item_deleted',pg_catalog.cardinality(v_remaining)=0,'remaining_orders',v_remaining,'revision',v_item.revision+1);
END;$$;
ALTER FUNCTION public.delete_fulfillment_backorder(uuid,uuid,bigint,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_fulfillment_backorder(uuid,uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_fulfillment_backorder(uuid,uuid,bigint,text) TO authenticated;

COMMIT;
