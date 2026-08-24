-- First-class BizTrack order portions and fulfillment appointment membership.
BEGIN;

CREATE TABLE public.dg_fulfillment_order_portions (
  portion_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  linked_internal_job_id uuid NOT NULL REFERENCES public.dg_native_jobs(internal_job_id),
  family_key text NOT NULL,
  sales_order text NOT NULL,
  customer_name text NOT NULL,
  salesperson text NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  CHECK (family_key ~ '^[0-9]+[05]$'),
  CHECK (sales_order ~ '^[0-9]+$'),
  CHECK (customer_name=pg_catalog.btrim(customer_name) AND customer_name<>''),
  UNIQUE(linked_internal_job_id,sales_order)
);

CREATE TABLE public.dg_calendar_item_orders (
  item_id uuid NOT NULL REFERENCES public.dg_calendar_items(item_id),
  portion_id uuid NOT NULL REFERENCES public.dg_fulfillment_order_portions(portion_id),
  attached_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  attached_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY(item_id,portion_id)
);
CREATE INDEX dg_calendar_item_orders_portion_idx ON public.dg_calendar_item_orders(portion_id,item_id);
CREATE INDEX dg_fulfillment_order_portions_family_idx ON public.dg_fulfillment_order_portions(linked_internal_job_id,family_key,sales_order);

ALTER TABLE public.dg_fulfillment_order_portions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_calendar_item_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY dg_fulfillment_order_portions_view ON public.dg_fulfillment_order_portions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=auth.uid() AND p.active=true)
  AND EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=auth.uid() AND p.permission_key IN('calendar','jobs') AND p.access_level IN('view','use'))
);
CREATE POLICY dg_calendar_item_orders_view ON public.dg_calendar_item_orders FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=auth.uid() AND p.active=true)
  AND EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=auth.uid() AND p.permission_key IN('calendar','jobs') AND p.access_level IN('view','use'))
);
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.dg_fulfillment_order_portions,public.dg_calendar_item_orders FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.dg_sales_order_family(p_sales_order text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
  SELECT CASE WHEN pg_catalog.btrim(p_sales_order) !~ '^[0-9]+$' THEN NULL
    WHEN pg_catalog.right(pg_catalog.btrim(p_sales_order),1)::integer BETWEEN 0 AND 4 THEN pg_catalog.left(pg_catalog.btrim(p_sales_order),-1)||'0'
    ELSE pg_catalog.left(pg_catalog.btrim(p_sales_order),-1)||'5' END
$$;
ALTER FUNCTION public.dg_sales_order_family(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_sales_order_family(text) FROM PUBLIC,anon,authenticated;

-- Backfill only actual Sales Orders already represented by linked fulfillment items.
INSERT INTO public.dg_fulfillment_order_portions(linked_internal_job_id,family_key,sales_order,customer_name,salesperson,created_at,created_by_user_id)
SELECT DISTINCT ON(i.linked_internal_job_id,i.sales_order) i.linked_internal_job_id,public.dg_sales_order_family(i.sales_order),i.sales_order,i.customer_name,i.salesperson,i.created_at,i.created_by_user_id
FROM public.dg_calendar_items i
WHERE i.item_type IN('delivery','customer_pickup') AND i.deleted_at IS NULL AND i.linked_internal_job_id IS NOT NULL
  AND public.dg_sales_order_family(i.sales_order) IS NOT NULL
ORDER BY i.linked_internal_job_id,i.sales_order,i.created_at;
INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_at,attached_by_user_id)
SELECT i.item_id,p.portion_id,i.created_at,i.created_by_user_id
FROM public.dg_calendar_items i JOIN public.dg_fulfillment_order_portions p
  ON p.linked_internal_job_id=i.linked_internal_job_id AND p.sales_order=i.sales_order
WHERE i.item_type IN('delivery','customer_pickup') AND i.deleted_at IS NULL;
UPDATE public.dg_calendar_items i SET order_family_key=p.family_key
FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id
WHERE m.item_id=i.item_id AND i.order_family_key IS DISTINCT FROM p.family_key;

CREATE OR REPLACE FUNCTION public.ensure_primary_fulfillment_order_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job public.dg_native_jobs%ROWTYPE;v_family text;v_portion uuid;v_actor uuid:=COALESCE(auth.uid(),NEW.updated_by_user_id);
BEGIN
  IF NEW.linked_internal_job_id IS NULL OR NEW.item_type NOT IN('delivery','customer_pickup') OR NEW.deleted_at IS NOT NULL THEN RETURN NEW;END IF;
  SELECT * INTO v_job FROM public.dg_native_jobs j WHERE j.internal_job_id=NEW.linked_internal_job_id;
  v_family:=public.dg_sales_order_family(v_job.biztrack_sales_order);IF v_family IS NULL THEN RETURN NEW;END IF;
  INSERT INTO public.dg_fulfillment_order_portions(linked_internal_job_id,family_key,sales_order,customer_name,salesperson,created_by_user_id)
  VALUES(NEW.linked_internal_job_id,v_family,v_job.biztrack_sales_order,NEW.customer_name,NEW.salesperson,v_actor)
  ON CONFLICT(linked_internal_job_id,sales_order) DO UPDATE SET customer_name=EXCLUDED.customer_name,salesperson=EXCLUDED.salesperson RETURNING portion_id INTO v_portion;
  INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_by_user_id)VALUES(NEW.item_id,v_portion,v_actor)ON CONFLICT DO NOTHING;
  UPDATE public.dg_calendar_items SET order_family_key=v_family,sales_order=v_job.biztrack_sales_order WHERE item_id=NEW.item_id AND (order_family_key IS DISTINCT FROM v_family OR sales_order IS DISTINCT FROM v_job.biztrack_sales_order);
  RETURN NEW;
END;$$;
ALTER FUNCTION public.ensure_primary_fulfillment_order_membership() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_primary_fulfillment_order_membership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_calendar_items_ensure_primary_order AFTER INSERT OR UPDATE OF linked_internal_job_id,item_type,deleted_at ON public.dg_calendar_items FOR EACH ROW EXECUTE FUNCTION public.ensure_primary_fulfillment_order_membership();

DROP INDEX IF EXISTS public.dg_calendar_one_current_fulfillment_job_idx;

CREATE OR REPLACE FUNCTION public.dg_fulfillment_day_order(p_date date,p_exclude uuid DEFAULT NULL)
RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 FROM(
    SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_date AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
    UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_date AND i.deleted_at IS NULL AND i.item_id IS DISTINCT FROM p_exclude
  )x
$$;
ALTER FUNCTION public.dg_fulfillment_day_order(date,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_fulfillment_day_order(date,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.add_fulfillment_backorder(p_command_id uuid,p_linked_internal_job_id uuid,p_sales_order text,p_item_type text,p_scheduled_date date,p_timing text,p_fulfillment_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_job public.dg_native_jobs%ROWTYPE;v_family text;v_sales_order text:=pg_catalog.btrim(p_sales_order);v_portion uuid;v_item uuid:=extensions.gen_random_uuid();v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_linked_internal_job_id IS NULL OR p_item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_request';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND p.access_level='use') THEN RAISE EXCEPTION USING MESSAGE='fulfillment.jobs_permission_required';END IF;
  SELECT * INTO v_job FROM public.dg_native_jobs j WHERE j.internal_job_id=p_linked_internal_job_id AND j.archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.job_not_found';END IF;
  v_family:=public.dg_sales_order_family(v_job.biztrack_sales_order);
  IF v_family IS NULL OR public.dg_sales_order_family(v_sales_order) IS DISTINCT FROM v_family OR v_sales_order=v_family THEN RAISE EXCEPTION USING MESSAGE='fulfillment.wrong_order_family';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||p_linked_internal_job_id::text||':'||v_family,0));
  INSERT INTO public.dg_fulfillment_order_portions(linked_internal_job_id,family_key,sales_order,customer_name,salesperson,created_at,created_by_user_id)
  VALUES(p_linked_internal_job_id,v_family,v_sales_order,COALESCE(NULLIF(pg_catalog.btrim(v_job.customer),''),v_sales_order),v_job.salesperson,v_now,v_actor)
  RETURNING portion_id INTO v_portion;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));
  v_order:=public.dg_fulfillment_day_order(p_scheduled_date,NULL);
  INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
  VALUES(v_item,p_item_type,p_scheduled_date,NULL,v_family,COALESCE(NULLIF(pg_catalog.btrim(v_job.customer),''),v_sales_order),v_sales_order,v_job.salesperson,NULLIF(pg_catalog.btrim(p_timing),''),COALESCE(NULLIF(pg_catalog.btrim(p_fulfillment_note),''),NULLIF(pg_catalog.btrim(v_job.notes),'')),v_order,v_now,v_now,v_actor,v_actor);
  INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_at,attached_by_user_id)VALUES(v_item,v_portion,v_now,v_actor);
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at,detail)
  VALUES(p_command_id,v_item,'create',p_scheduled_date,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','add_backorder','sales_order',v_sales_order));
  RETURN pg_catalog.jsonb_build_object('item_id',v_item,'portion_id',v_portion,'family_key',v_family,'sales_order',v_sales_order,'scheduled_date',p_scheduled_date);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING MESSAGE='fulfillment.sales_order_exists';
END;$$;
ALTER FUNCTION public.add_fulfillment_backorder(uuid,uuid,text,text,date,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_fulfillment_backorder(uuid,uuid,text,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_fulfillment_backorder(uuid,uuid,text,text,date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_fulfillment_included_orders(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_sales_orders text[],p_confirm_reassignment boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_family text;v_job_id uuid;v_requested text[];v_conflicts jsonb;v_now timestamptz:=pg_catalog.clock_timestamp();v_reopened boolean:=false;
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL AND i.item_type IN('delivery','customer_pickup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  v_family:=v_item.order_family_key;SELECT p.linked_internal_job_id INTO v_job_id FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id WHERE m.item_id=p_item_id LIMIT 1;
  IF v_job_id IS NULL THEN v_job_id:=v_item.linked_internal_job_id;END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||v_job_id::text||':'||v_family,0));
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT x ORDER BY x),ARRAY[]::text[]) INTO v_requested FROM pg_catalog.unnest(COALESCE(p_sales_orders,ARRAY[]::text[]))x;
  IF EXISTS(SELECT 1 FROM pg_catalog.unnest(v_requested)x LEFT JOIN public.dg_fulfillment_order_portions p ON p.linked_internal_job_id=v_job_id AND p.family_key=v_family AND p.sales_order=x WHERE p.portion_id IS NULL) THEN RAISE EXCEPTION USING MESSAGE='fulfillment.unknown_order';END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('sales_order',p.sales_order,'item_id',other.item_id,'item_type',i.item_type,'scheduled_date',i.scheduled_date)),'[]'::jsonb) INTO v_conflicts
  FROM public.dg_fulfillment_order_portions p JOIN public.dg_calendar_item_orders other ON other.portion_id=p.portion_id JOIN public.dg_calendar_items i ON i.item_id=other.item_id
  WHERE p.linked_internal_job_id=v_job_id AND p.sales_order=ANY(v_requested) AND other.item_id<>p_item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL;
  IF pg_catalog.jsonb_array_length(v_conflicts)>0 AND NOT p_confirm_reassignment THEN RETURN pg_catalog.jsonb_build_object('confirmation_required',true,'conflicts',v_conflicts);END IF;
  DELETE FROM public.dg_calendar_item_orders m USING public.dg_fulfillment_order_portions p WHERE m.portion_id=p.portion_id AND m.item_id<>p_item_id AND p.linked_internal_job_id=v_job_id AND p.sales_order=ANY(v_requested) AND EXISTS(SELECT 1 FROM public.dg_calendar_items i WHERE i.item_id=m.item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL);
  DELETE FROM public.dg_calendar_item_orders m USING public.dg_fulfillment_order_portions p WHERE m.portion_id=p.portion_id AND m.item_id=p_item_id AND NOT(p.sales_order=ANY(v_requested));
  INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_at,attached_by_user_id) SELECT p_item_id,p.portion_id,v_now,v_actor FROM public.dg_fulfillment_order_portions p WHERE p.linked_internal_job_id=v_job_id AND p.sales_order=ANY(v_requested) ON CONFLICT DO NOTHING;
  IF v_item.completed_at IS NOT NULL AND pg_catalog.cardinality(v_requested)=0 THEN v_reopened:=true;END IF;
  UPDATE public.dg_calendar_items SET completed_at=CASE WHEN v_reopened THEN NULL ELSE completed_at END,completed_by_user_id=CASE WHEN v_reopened THEN NULL ELSE completed_by_user_id END,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail) VALUES(p_command_id,p_item_id,CASE WHEN v_reopened THEN 'reopen' ELSE 'reorder' END,v_item.scheduled_date,v_item.scheduled_date,v_item.day_order,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('included_orders',v_requested,'reassigned',v_conflicts));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'revision',v_item.revision+1,'included_orders',v_requested,'reopened',v_reopened,'conflicts',v_conflicts);
END;$$;
ALTER FUNCTION public.set_fulfillment_included_orders(uuid,uuid,bigint,text[],boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_fulfillment_included_orders(uuid,uuid,bigint,text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_fulfillment_included_orders(uuid,uuid,bigint,text[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_fulfillment_orders(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_fulfilled_sales_orders text[],p_remaining_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_all text[];v_done text[];v_remaining text[];v_new_item uuid;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL AND i.item_type IN('delivery','customer_pickup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.item_not_found';END IF;
  IF v_item.revision<>p_expected_revision OR v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='fulfillment.stale_item';END IF;
  SELECT COALESCE(pg_catalog.array_agg(p.sales_order ORDER BY p.sales_order),ARRAY[]::text[]) INTO v_all FROM public.dg_calendar_item_orders m JOIN public.dg_fulfillment_order_portions p ON p.portion_id=m.portion_id WHERE m.item_id=p_item_id;
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT x ORDER BY x),ARRAY[]::text[]) INTO v_done FROM pg_catalog.unnest(COALESCE(p_fulfilled_sales_orders,ARRAY[]::text[]))x;
  IF pg_catalog.cardinality(v_done)=0 OR NOT(v_all @> v_done) THEN RAISE EXCEPTION USING MESSAGE='fulfillment.invalid_completion';END IF;
  SELECT COALESCE(pg_catalog.array_agg(x ORDER BY x),ARRAY[]::text[]) INTO v_remaining FROM pg_catalog.unnest(v_all)x WHERE NOT(x=ANY(v_done));
  IF pg_catalog.cardinality(v_remaining)>0 THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_remaining_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(p_remaining_date,NULL);v_new_item:=extensions.gen_random_uuid();
    INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
    VALUES(v_new_item,v_item.item_type,p_remaining_date,NULL,v_item.order_family_key,v_item.customer_name,v_remaining[1],v_item.salesperson,v_item.timing,v_item.fulfillment_note,v_order,v_now,v_now,v_actor,v_actor);
    UPDATE public.dg_calendar_item_orders m SET item_id=v_new_item,attached_at=v_now,attached_by_user_id=v_actor FROM public.dg_fulfillment_order_portions p WHERE m.portion_id=p.portion_id AND m.item_id=p_item_id AND p.sales_order=ANY(v_remaining);
    INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,to_scheduled_date,to_day_order,actor_user_id,occurred_at,detail)VALUES(extensions.gen_random_uuid(),v_new_item,'split',p_remaining_date,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('from_item_id',p_item_id,'remaining_orders',v_remaining));
  END IF;
  UPDATE public.dg_calendar_items SET completed_at=v_now,completed_by_user_id=v_actor,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,p_item_id,'complete',v_item.scheduled_date,v_item.scheduled_date,v_item.day_order,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('fulfilled_orders',v_done,'remaining_orders',v_remaining,'split_item_id',v_new_item));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'completed_at',v_now,'revision',v_item.revision+1,'fulfilled_orders',v_done,'remaining_orders',v_remaining,'split_item_id',v_new_item,'remaining_date',p_remaining_date);
END;$$;
ALTER FUNCTION public.complete_fulfillment_orders(uuid,uuid,bigint,text[],date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_fulfillment_orders(uuid,uuid,bigint,text[],date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_fulfillment_orders(uuid,uuid,bigint,text[],date) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_fulfillment_order(p_command_id uuid,p_source_item_id uuid,p_sales_order text,p_destination_date date,p_destination_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_source public.dg_calendar_items%ROWTYPE;v_destination public.dg_calendar_items%ROWTYPE;v_portion public.dg_fulfillment_order_portions%ROWTYPE;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();v_new boolean:=false;
BEGIN
  SELECT * INTO v_source FROM public.dg_calendar_items i WHERE i.item_id=p_source_item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL FOR UPDATE;
  SELECT p.* INTO v_portion FROM public.dg_fulfillment_order_portions p JOIN public.dg_calendar_item_orders m ON m.portion_id=p.portion_id WHERE m.item_id=p_source_item_id AND p.sales_order=p_sales_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='fulfillment.unknown_order';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_fulfillment_family:'||v_portion.linked_internal_job_id::text||':'||v_portion.family_key,0));
  IF p_destination_item_id IS NOT NULL THEN SELECT * INTO v_destination FROM public.dg_calendar_items i WHERE i.item_id=p_destination_item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL FOR UPDATE;END IF;
  IF v_destination.item_id IS NULL THEN
    SELECT * INTO v_destination FROM public.dg_calendar_items i WHERE i.item_id<>p_source_item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL AND i.order_family_key=v_portion.family_key AND i.item_type=v_source.item_type AND i.scheduled_date IS NOT DISTINCT FROM p_destination_date AND (i.timing IS NULL OR v_source.timing IS NULL OR pg_catalog.lower(i.timing)=pg_catalog.lower(v_source.timing)) ORDER BY i.created_at LIMIT 1 FOR UPDATE;
  END IF;
  IF v_destination.item_id IS NOT NULL AND (v_destination.order_family_key IS DISTINCT FROM v_portion.family_key OR v_destination.item_type IS DISTINCT FROM v_source.item_type OR (v_destination.timing IS NOT NULL AND v_source.timing IS NOT NULL AND pg_catalog.lower(v_destination.timing)<>pg_catalog.lower(v_source.timing))) THEN RAISE EXCEPTION USING MESSAGE='fulfillment.incompatible_trip';END IF;
  IF v_destination.item_id IS NULL THEN
    v_new:=true;v_destination.item_id:=extensions.gen_random_uuid();PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_destination_date::text,'needs_attention'),0));v_order:=public.dg_fulfillment_day_order(p_destination_date,NULL);
    INSERT INTO public.dg_calendar_items(item_id,item_type,scheduled_date,linked_internal_job_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,day_order,created_at,updated_at,created_by_user_id,updated_by_user_id)
    VALUES(v_destination.item_id,v_source.item_type,p_destination_date,NULL,v_source.order_family_key,v_source.customer_name,v_portion.sales_order,v_source.salesperson,v_source.timing,v_source.fulfillment_note,v_order,v_now,v_now,v_actor,v_actor);
  ELSE v_order:=v_destination.day_order;IF v_destination.timing IS NULL AND v_source.timing IS NOT NULL THEN UPDATE public.dg_calendar_items SET timing=v_source.timing,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=v_destination.item_id;END IF;END IF;
  UPDATE public.dg_calendar_item_orders SET item_id=v_destination.item_id,attached_at=v_now,attached_by_user_id=v_actor WHERE item_id=p_source_item_id AND portion_id=v_portion.portion_id;
  UPDATE public.dg_calendar_items SET revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_source_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,detail)VALUES(p_command_id,v_destination.item_id,CASE WHEN v_new THEN 'split' ELSE 'merge' END,v_source.scheduled_date,COALESCE(v_destination.scheduled_date,p_destination_date),v_source.day_order,v_order,v_actor,v_now,pg_catalog.jsonb_build_object('source_item_id',p_source_item_id,'sales_order',p_sales_order));
  RETURN pg_catalog.jsonb_build_object('source_item_id',p_source_item_id,'destination_item_id',v_destination.item_id,'sales_order',p_sales_order,'destination_date',COALESCE(v_destination.scheduled_date,p_destination_date),'merged',NOT v_new);
END;$$;
ALTER FUNCTION public.move_fulfillment_order(uuid,uuid,text,date,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.move_fulfillment_order(uuid,uuid,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_fulfillment_order(uuid,uuid,text,date,uuid) TO authenticated;

ALTER TABLE public.dg_calendar_item_events DROP CONSTRAINT dg_calendar_item_events_action_type_check;
ALTER TABLE public.dg_calendar_item_events ADD CONSTRAINT dg_calendar_item_events_action_type_check CHECK(action_type IN('create','schedule','unschedule','reschedule','reorder','complete','reopen','delete','split','merge','included_orders'));

COMMIT;
