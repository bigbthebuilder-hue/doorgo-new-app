-- Unified active Calendar-item deletion with type-specific authoritative consequences.
BEGIN;

CREATE TABLE public.dg_production_booking_delete_events (
  event_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  command_id uuid NOT NULL UNIQUE,
  booking_id text NOT NULL REFERENCES public.dg_production_bookings(booking_id) ON DELETE RESTRICT,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_display_name_snapshot text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  production_date date NULL,
  shop_hours_snapshot numeric(10,2) NULL,
  original_updated_at_snapshot timestamptz NOT NULL,
  linked_internal_job_id uuid NULL REFERENCES public.dg_native_jobs(internal_job_id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (actor_display_name_snapshot=pg_catalog.btrim(actor_display_name_snapshot) AND pg_catalog.length(actor_display_name_snapshot) BETWEEN 1 AND 500),
  CHECK (jsonb_typeof(detail)='object')
);
ALTER TABLE public.dg_production_booking_delete_events OWNER TO postgres;
CREATE INDEX dg_production_booking_delete_events_booking_idx ON public.dg_production_booking_delete_events(booking_id,occurred_at DESC);
ALTER TABLE public.dg_production_booking_delete_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY dg_production_booking_delete_events_view ON public.dg_production_booking_delete_events FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=auth.uid() AND p.active=true)
  AND EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=auth.uid() AND p.permission_key='production' AND p.access_level IN('view','use'))
);
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.dg_production_booking_delete_events FROM anon,authenticated;
GRANT SELECT ON public.dg_production_booking_delete_events TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_production_booking_delete_event_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION USING MESSAGE='production_booking_delete.history_immutable';RETURN NULL;END;$$;
ALTER FUNCTION public.reject_production_booking_delete_event_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_production_booking_delete_event_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dg_production_booking_delete_events_immutable BEFORE UPDATE OR DELETE ON public.dg_production_booking_delete_events FOR EACH ROW EXECUTE FUNCTION public.reject_production_booking_delete_event_mutation();

CREATE OR REPLACE FUNCTION public.delete_calendar_item(p_command_id uuid,p_item_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_portion public.dg_fulfillment_order_portions%ROWTYPE;v_job_id uuid;v_primary text;v_kind text:='ordinary';v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_item_id IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item';END IF;
  IF v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item';END IF;
  IF v_item.current_portion_id IS NOT NULL THEN
    SELECT * INTO v_portion FROM public.dg_fulfillment_order_portions p WHERE p.portion_id=v_item.current_portion_id AND p.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.fulfillment_portion_missing';END IF;
    SELECT j.biztrack_sales_order INTO v_primary FROM public.dg_native_jobs j WHERE j.internal_job_id=v_portion.linked_internal_job_id FOR UPDATE;
    IF v_portion.sales_order IS DISTINCT FROM v_primary THEN RAISE EXCEPTION USING MESSAGE='calendar_item.backorder_delete_required';END IF;
    v_job_id:=v_portion.linked_internal_job_id;v_kind:='primary_fulfillment';
  ELSIF v_item.linked_internal_job_id IS NOT NULL AND v_item.item_type IN('delivery','customer_pickup') THEN
    v_job_id:=v_item.linked_internal_job_id;v_kind:='linked_fulfillment';
    PERFORM 1 FROM public.dg_native_jobs j WHERE j.internal_job_id=v_job_id FOR UPDATE;
  END IF;
  UPDATE public.dg_calendar_items SET deleted_at=v_now,deleted_by_user_id=v_actor,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  IF v_job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=v_job_id AND i.item_type IN('delivery','customer_pickup') AND i.deleted_at IS NULL AND i.completed_at IS NULL) THEN
    UPDATE public.dg_native_jobs SET fulfillment_plan=NULL,delivery_date=NULL,customer_pickup_date=NULL,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE internal_job_id=v_job_id;
  END IF;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail)
  VALUES(p_command_id,p_item_id,'delete',v_item.scheduled_date,v_item.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('source','unified_active_delete','delete_kind',v_kind,'current_portion_id',v_item.current_portion_id,'linked_internal_job_id',v_job_id));
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'delete_kind',v_kind,'deleted_at',v_now,'linked_internal_job_id',v_job_id);
END;$$;
ALTER FUNCTION public.delete_calendar_item(uuid,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_calendar_item(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_calendar_item(uuid,uuid,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_calendar_production_booking(p_command_id uuid,p_booking_id text,p_expected_production_date date,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(true);v_profile public.dg_user_profiles%ROWTYPE;v_booking public.dg_production_bookings%ROWTYPE;v_existing public.dg_production_booking_delete_events%ROWTYPE;v_date date;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_booking_id IS NULL OR p_expected_updated_at IS NULL OR pg_catalog.btrim(p_booking_id)='' OR pg_catalog.length(p_booking_id)>500 OR p_booking_id IS DISTINCT FROM pg_catalog.btrim(p_booking_id) THEN RAISE EXCEPTION USING MESSAGE='production_booking_delete.invalid_request';END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles p WHERE p.user_id=v_actor;
  IF NOT FOUND OR NOT v_profile.active OR NULLIF(pg_catalog.btrim(v_profile.display_name),'') IS NULL THEN RAISE EXCEPTION USING MESSAGE='production_booking_delete.active_profile_required';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_delete_command:'||p_command_id::text,0));
  SELECT * INTO v_existing FROM public.dg_production_booking_delete_events e WHERE e.command_id=p_command_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor OR v_existing.booking_id IS DISTINCT FROM p_booking_id OR v_existing.production_date IS DISTINCT FROM p_expected_production_date OR v_existing.original_updated_at_snapshot IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING MESSAGE='production_booking_delete.command_uuid_collision';END IF;
    RETURN pg_catalog.jsonb_build_object('booking_id',v_existing.booking_id,'production_date',v_existing.production_date,'deleted_at',v_existing.occurred_at,'status','deleted');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_delete_booking:'||p_booking_id,0));
  SELECT * INTO v_booking FROM public.dg_production_bookings b WHERE b.booking_id=p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.deleted_at IS NOT NULL OR v_booking.cancelled_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='production_booking_delete.not_found';END IF;
  v_date:=public.parse_production_booking_date(v_booking.production_date);
  IF v_booking.booking_kind IS DISTINCT FROM 'production' OR v_booking.status IS DISTINCT FROM 'active' OR v_booking.schedule_status IS DISTINCT FROM 'confirmed' OR v_booking.board_visible IS NOT DISTINCT FROM false THEN RAISE EXCEPTION USING MESSAGE='production_booking_delete.ineligible_booking';END IF;
  IF v_booking.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='production_booking_delete.completed_booking';END IF;
  IF v_date IS DISTINCT FROM p_expected_production_date OR v_booking.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING MESSAGE='production_booking_delete.stale_booking';END IF;
  UPDATE public.dg_production_bookings SET deleted_at=v_now,updated_at=v_now,updated_by=v_actor::text WHERE booking_id=p_booking_id;
  IF v_booking.linked_internal_job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dg_production_bookings b WHERE b.linked_internal_job_id=v_booking.linked_internal_job_id AND b.booking_kind='production' AND b.deleted_at IS NULL AND b.cancelled_at IS NULL AND b.completed_at IS NULL AND b.status='active' AND b.schedule_status='confirmed' AND b.board_visible IS DISTINCT FROM false) THEN
    UPDATE public.dg_native_jobs SET shop_date=NULL,shop_date_source=NULL,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE internal_job_id=v_booking.linked_internal_job_id AND shop_date IS NOT DISTINCT FROM v_date;
  END IF;
  INSERT INTO public.dg_production_booking_delete_events(command_id,booking_id,actor_user_id,actor_display_name_snapshot,occurred_at,production_date,shop_hours_snapshot,original_updated_at_snapshot,linked_internal_job_id,detail)
  VALUES(p_command_id,p_booking_id,v_actor,pg_catalog.btrim(v_profile.display_name),v_now,v_date,v_booking.shop_hours,v_booking.updated_at,v_booking.linked_internal_job_id,pg_catalog.jsonb_build_object('source','calendar','prior_status',v_booking.status,'prior_schedule_status',v_booking.schedule_status,'prior_day_order',v_booking.day_order));
  RETURN pg_catalog.jsonb_build_object('booking_id',p_booking_id,'production_date',v_date,'deleted_at',v_now,'status','deleted');
END;$$;
ALTER FUNCTION public.delete_calendar_production_booking(uuid,text,date,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_calendar_production_booking(uuid,text,date,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_calendar_production_booking(uuid,text,date,timestamptz) TO authenticated;

COMMIT;
