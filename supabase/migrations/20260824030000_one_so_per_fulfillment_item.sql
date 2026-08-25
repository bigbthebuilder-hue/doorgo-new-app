-- One exact Sales Order per current operational fulfillment item; historical memberships remain intact.
BEGIN;

ALTER TABLE public.dg_calendar_items ADD COLUMN current_portion_id uuid NULL REFERENCES public.dg_fulfillment_order_portions(portion_id);

CREATE TEMP TABLE dg_fulfillment_normalization_source ON COMMIT DROP AS
SELECT DISTINCT ON(p.portion_id) p.portion_id,p.linked_internal_job_id,p.family_key,p.sales_order,i.item_id,i.item_type,i.scheduled_date,i.customer_name,i.salesperson,i.timing,i.fulfillment_note,i.day_order,i.created_by_user_id
FROM public.dg_fulfillment_order_portions p JOIN public.dg_calendar_item_orders m ON m.portion_id=p.portion_id JOIN public.dg_calendar_items i ON i.item_id=m.item_id
WHERE p.deleted_at IS NULL AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_type IN('delivery','customer_pickup')
ORDER BY p.portion_id,(i.sales_order=p.sales_order) DESC,i.updated_at DESC,i.item_id;

-- Primary linked items remain the sole source of native Job fulfillment synchronization.
UPDATE public.dg_calendar_items i SET current_portion_id=p.portion_id,order_family_key=p.family_key,sales_order=p.sales_order
FROM public.dg_native_jobs j JOIN public.dg_fulfillment_order_portions p ON p.linked_internal_job_id=j.internal_job_id AND p.sales_order=j.biztrack_sales_order AND p.deleted_at IS NULL
WHERE i.linked_internal_job_id=j.internal_job_id AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_type IN('delivery','customer_pickup');

-- Prefer an existing exact-SO item for each remaining portion.
WITH candidates AS(
  SELECT DISTINCT ON(p.portion_id) p.portion_id,i.item_id,p.family_key,p.sales_order
  FROM public.dg_fulfillment_order_portions p JOIN public.dg_calendar_items i ON i.sales_order=p.sales_order AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_type IN('delivery','customer_pickup')
  WHERE p.deleted_at IS NULL AND i.current_portion_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.dg_calendar_items owner WHERE owner.current_portion_id=p.portion_id AND owner.deleted_at IS NULL AND owner.completed_at IS NULL)
  ORDER BY p.portion_id,(i.order_family_key=p.family_key) DESC,i.updated_at DESC,i.item_id
)
UPDATE public.dg_calendar_items i SET current_portion_id=c.portion_id,order_family_key=c.family_key,sales_order=c.sales_order,linked_internal_job_id=NULL FROM candidates c WHERE i.item_id=c.item_id;

-- A displaced current membership receives its own item with the same operational state.
WITH displaced AS(
  SELECT s.*,extensions.gen_random_uuid() new_item_id FROM dg_fulfillment_normalization_source s
  WHERE NOT EXISTS(SELECT 1 FROM public.dg_calendar_items i WHERE i.current_portion_id=s.portion_id AND i.deleted_at IS NULL AND i.completed_at IS NULL)
), inserted AS(
  INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,current_portion_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
  SELECT d.new_item_id,d.item_type,d.scheduled_date,NULL,d.portion_id,d.family_key,d.customer_name,d.sales_order,d.salesperson,d.timing,d.fulfillment_note,d.day_order,pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp(),d.created_by_user_id,d.created_by_user_id FROM displaced d RETURNING item_id,current_portion_id
)
INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at,detail)
SELECT extensions.gen_random_uuid(),i.item_id,'split',i.scheduled_date,i.day_order,i.created_by_user_id,pg_catalog.clock_timestamp(),pg_catalog.jsonb_build_object('source','one_so_normalization','portion_id',i.current_portion_id) FROM public.dg_calendar_items i JOIN inserted x ON x.item_id=i.item_id;

-- Preserve but retire exact active duplicates not selected as the current owner.
WITH duplicates AS(
  UPDATE public.dg_calendar_items i SET deleted_at=pg_catalog.clock_timestamp(),revision=revision+1,updated_at=pg_catalog.clock_timestamp()
  WHERE i.deleted_at IS NULL AND i.completed_at IS NULL AND i.item_type IN('delivery','customer_pickup') AND i.current_portion_id IS NULL AND i.sales_order IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.dg_fulfillment_order_portions p JOIN public.dg_calendar_items owner ON owner.current_portion_id=p.portion_id WHERE p.deleted_at IS NULL AND p.sales_order=i.sales_order AND owner.deleted_at IS NULL AND owner.completed_at IS NULL AND owner.item_id<>i.item_id)
  RETURNING i.*
)
INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail)
SELECT extensions.gen_random_uuid(),d.item_id,'delete',d.scheduled_date,d.day_order,COALESCE(d.updated_by_user_id,d.created_by_user_id),pg_catalog.clock_timestamp(),'{"source":"one_so_duplicate_normalization"}'::jsonb FROM duplicates d;

CREATE UNIQUE INDEX dg_calendar_items_one_current_portion_idx ON public.dg_calendar_items(current_portion_id) WHERE current_portion_id IS NOT NULL AND deleted_at IS NULL AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_current_fulfillment_portion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_portion public.dg_fulfillment_order_portions%ROWTYPE;v_primary text;
BEGIN
  IF NEW.current_portion_id IS NULL OR NEW.deleted_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN RETURN NEW;END IF;
  IF NEW.item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_request';END IF;
  SELECT * INTO v_portion FROM public.dg_fulfillment_order_portions p WHERE p.portion_id=NEW.current_portion_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.unknown_order';END IF;
  SELECT j.biztrack_sales_order INTO v_primary FROM public.dg_native_jobs j WHERE j.internal_job_id=v_portion.linked_internal_job_id;
  IF NEW.sales_order IS DISTINCT FROM v_portion.sales_order OR NEW.order_family_key IS DISTINCT FROM v_portion.family_key THEN RAISE EXCEPTION USING MESSAGE='fulfillment.current_order_mismatch';END IF;
  IF v_portion.sales_order=v_primary AND NEW.linked_internal_job_id IS DISTINCT FROM v_portion.linked_internal_job_id THEN RAISE EXCEPTION USING MESSAGE='fulfillment.primary_job_link_required';END IF;
  IF v_portion.sales_order<>v_primary AND NEW.linked_internal_job_id IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.backorder_job_link_forbidden';END IF;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.enforce_current_fulfillment_portion() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_current_fulfillment_portion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_calendar_items_enforce_current_portion BEFORE INSERT OR UPDATE OF current_portion_id,item_type,linked_internal_job_id,order_family_key,sales_order,deleted_at,completed_at ON public.dg_calendar_items FOR EACH ROW EXECUTE FUNCTION public.enforce_current_fulfillment_portion();

-- Existing authoritative creation paths attach the exact portion membership. Convert that
-- attachment into current ownership while retaining the membership as immutable history.
CREATE OR REPLACE FUNCTION public.assign_current_fulfillment_portion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_portion public.dg_fulfillment_order_portions%ROWTYPE;v_primary text;v_item public.dg_calendar_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=NEW.item_id FOR UPDATE;
  IF NOT FOUND OR v_item.deleted_at IS NOT NULL OR v_item.completed_at IS NOT NULL OR v_item.item_type NOT IN('delivery','customer_pickup') THEN RETURN NEW;END IF;
  SELECT * INTO v_portion FROM public.dg_fulfillment_order_portions p WHERE p.portion_id=NEW.portion_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW;END IF;
  IF v_item.current_portion_id IS NOT NULL AND v_item.current_portion_id<>v_portion.portion_id THEN RAISE EXCEPTION USING MESSAGE='fulfillment.one_order_per_item';END IF;
  SELECT j.biztrack_sales_order INTO v_primary FROM public.dg_native_jobs j WHERE j.internal_job_id=v_portion.linked_internal_job_id;
  UPDATE public.dg_calendar_items SET current_portion_id=v_portion.portion_id,order_family_key=v_portion.family_key,sales_order=v_portion.sales_order,
    linked_internal_job_id=CASE WHEN v_portion.sales_order=v_primary THEN v_portion.linked_internal_job_id ELSE NULL END
  WHERE item_id=NEW.item_id;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.assign_current_fulfillment_portion() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_current_fulfillment_portion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_calendar_item_orders_assign_current AFTER INSERT OR UPDATE OF portion_id ON public.dg_calendar_item_orders FOR EACH ROW EXECUTE FUNCTION public.assign_current_fulfillment_portion();

CREATE OR REPLACE FUNCTION public.retire_deleted_fulfillment_portion_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.dg_calendar_items SET deleted_at=NEW.deleted_at,deleted_by_user_id=NEW.deleted_by_user_id,revision=revision+1,updated_at=NEW.deleted_at,updated_by_user_id=NEW.deleted_by_user_id
    WHERE current_portion_id=NEW.portion_id AND deleted_at IS NULL AND completed_at IS NULL;
  END IF;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.retire_deleted_fulfillment_portion_item() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.retire_deleted_fulfillment_portion_item() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_fulfillment_portions_retire_current_item AFTER UPDATE OF deleted_at ON public.dg_fulfillment_order_portions FOR EACH ROW EXECUTE FUNCTION public.retire_deleted_fulfillment_portion_item();

CREATE OR REPLACE FUNCTION public.set_fulfillment_item_type(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_item_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_request';END IF;
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.current_portion_id IS NOT NULL AND i.deleted_at IS NULL AND i.completed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  UPDATE public.dg_calendar_items SET item_type=p_item_type,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,p_item_id,'reschedule',v_item.scheduled_date,v_item.scheduled_date,v_item.day_order,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','type_change','from_type',v_item.item_type,'to_type',p_item_type));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'item_type',p_item_type,'revision',v_item.revision+1);
END;$$;
ALTER FUNCTION public.set_fulfillment_item_type(uuid,uuid,bigint,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_fulfillment_item_type(uuid,uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_fulfillment_item_type(uuid,uuid,bigint,text) TO authenticated;

-- Multi-order live mutation entrypoints are retained for historical interpretation but retired from clients.
REVOKE EXECUTE ON FUNCTION public.set_fulfillment_included_orders(uuid,uuid,bigint,text[],boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_fulfillment_order_dispositions(uuid,uuid,bigint,text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_fulfillment_orders(uuid,uuid,bigint,text[],date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.move_fulfillment_order(uuid,uuid,text,date,uuid) FROM authenticated;

COMMIT;
