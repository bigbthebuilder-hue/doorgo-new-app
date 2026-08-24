-- Prevent one order portion from silently belonging to two active fulfillment trips.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_active_fulfillment_order_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.dg_calendar_items i WHERE i.item_id=NEW.item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL)
    AND EXISTS(SELECT 1 FROM public.dg_calendar_item_orders other JOIN public.dg_calendar_items i ON i.item_id=other.item_id WHERE other.portion_id=NEW.portion_id AND other.item_id<>NEW.item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL)
  THEN RAISE EXCEPTION USING MESSAGE='fulfillment.active_order_owner_exists';END IF;
  RETURN NEW;
END;$$;
ALTER FUNCTION public.enforce_active_fulfillment_order_ownership() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_active_fulfillment_order_ownership() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER dg_calendar_item_orders_one_active_owner AFTER INSERT OR UPDATE OF item_id,portion_id ON public.dg_calendar_item_orders DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION public.enforce_active_fulfillment_order_ownership();

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
  IF NOT EXISTS(SELECT 1 FROM public.dg_calendar_item_orders m JOIN public.dg_calendar_items i ON i.item_id=m.item_id WHERE m.portion_id=v_portion AND m.item_id<>NEW.item_id AND i.deleted_at IS NULL AND i.completed_at IS NULL) THEN
    INSERT INTO public.dg_calendar_item_orders(item_id,portion_id,attached_by_user_id)VALUES(NEW.item_id,v_portion,v_actor)ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.dg_calendar_items SET order_family_key=v_family,sales_order=v_job.biztrack_sales_order WHERE item_id=NEW.item_id AND (order_family_key IS DISTINCT FROM v_family OR sales_order IS DISTINCT FROM v_job.biztrack_sales_order);
  RETURN NEW;
END;$$;
ALTER FUNCTION public.ensure_primary_fulfillment_order_membership() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_primary_fulfillment_order_membership() FROM PUBLIC,anon,authenticated;

COMMIT;
