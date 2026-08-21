-- Permanent operational Calendar items: Delivery, Customer Pickup, Note, and shared ordering.
BEGIN;

CREATE TABLE public.dg_calendar_items (
  item_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('delivery','customer_pickup','note')),
  scheduled_date date NULL,
  linked_internal_job_id uuid NULL REFERENCES public.dg_native_jobs(internal_job_id),
  order_family_key text NULL,
  customer_name text NOT NULL,
  sales_order text NULL,
  salesperson text NULL,
  timing text NULL,
  fulfillment_note text NULL,
  title text NULL,
  details text NULL,
  day_order bigint NOT NULL,
  completed_at timestamptz NULL,
  completed_by_user_id uuid NULL REFERENCES auth.users(id),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at timestamptz NULL,
  deleted_by_user_id uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  updated_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  CHECK (customer_name = pg_catalog.btrim(customer_name) AND customer_name <> ''),
  CHECK (item_type <> 'note' OR (title IS NOT NULL AND pg_catalog.btrim(title) <> '')),
  CHECK (timing IS NULL OR timing = NULLIF(pg_catalog.btrim(timing),'')),
  CHECK (sales_order IS NULL OR sales_order = NULLIF(pg_catalog.btrim(sales_order),''))
);
CREATE INDEX dg_calendar_items_schedule_order_idx ON public.dg_calendar_items(scheduled_date,day_order,item_id) WHERE deleted_at IS NULL;
CREATE INDEX dg_calendar_items_job_idx ON public.dg_calendar_items(linked_internal_job_id) WHERE deleted_at IS NULL;

CREATE TABLE public.dg_calendar_item_events (
  event_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  command_id uuid NOT NULL UNIQUE,
  item_id uuid NOT NULL REFERENCES public.dg_calendar_items(item_id),
  action_type text NOT NULL CHECK (action_type IN ('create','schedule','unschedule','reschedule','reorder','complete','reopen','delete')),
  from_scheduled_date date NULL,
  to_scheduled_date date NULL,
  from_day_order bigint NULL,
  to_day_order bigint NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  destination_was_closed boolean NOT NULL DEFAULT false,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX dg_calendar_item_events_item_idx ON public.dg_calendar_item_events(item_id,occurred_at DESC);

ALTER TABLE public.dg_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_calendar_item_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY dg_calendar_items_view ON public.dg_calendar_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=auth.uid() AND p.active=true)
  AND EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=auth.uid() AND p.permission_key='calendar' AND p.access_level IN ('view','use'))
);
CREATE POLICY dg_calendar_item_events_view ON public.dg_calendar_item_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=auth.uid() AND p.active=true)
  AND EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=auth.uid() AND p.permission_key='calendar' AND p.access_level IN ('view','use'))
);
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.dg_calendar_items,public.dg_calendar_item_events FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.dg_calendar_require_use(p_require_production boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true)
  THEN RAISE EXCEPTION USING MESSAGE='calendar_item.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE='calendar_item.permission_required'; END IF;
  IF p_require_production AND NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='production' AND p.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE='calendar_item.production_permission_required'; END IF;
  RETURN v_actor;
END; $$;
ALTER FUNCTION public.dg_calendar_require_use(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_calendar_require_use(boolean) FROM PUBLIC,anon,authenticated;

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
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));
  SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM (
    SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_scheduled_date AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
    UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND i.deleted_at IS NULL
  ) x;
  IF p_item_type='production' THEN
    v_booking_id:='manual-'||v_id::text;
    INSERT INTO public.dg_production_bookings(booking_id,job_id,title,production_date,shop_hours,salesperson,status,source,created_at,updated_at,raw_booking,
      schedule_status,booking_kind,board_visible,all_day,calendar_sync_state,locked,created_by,updated_by,source_system,day_order)
    VALUES(v_booking_id,CASE WHEN p_linked_internal_job_id IS NULL THEN v_sales_order ELSE v_job.visible_identifier END,v_customer,
      CASE WHEN p_scheduled_date IS NULL THEN NULL ELSE p_scheduled_date::text END,CASE WHEN p_linked_internal_job_id IS NULL THEN p_shop_hours ELSE v_job.shop_hours END,v_salesperson,'active','DoorGo Calendar',v_now,v_now,'{}'::jsonb,
      'confirmed','production',true,true,'native',false,v_actor::text,v_actor::text,'doorgo_native',v_order);
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
END; $$;
ALTER FUNCTION public.create_calendar_item(uuid,text,date,uuid,text,text,text,numeric,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_calendar_item(uuid,text,date,uuid,text,text,text,numeric,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_calendar_item(uuid,text,date,uuid,text,text,text,numeric,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_calendar_item(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_destination_date date,p_closed_acknowledged boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false); v_item public.dg_calendar_items%ROWTYPE; v_order bigint; v_closed boolean:=false; v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_item_id IS NULL OR p_expected_revision IS NULL OR p_closed_acknowledged IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_item:'||p_item_id::text,0));
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found'; END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item'; END IF;
  IF v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item'; END IF;
  IF v_item.scheduled_date IS NOT DISTINCT FROM p_destination_date THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request'; END IF;
  IF p_destination_date IS NOT NULL THEN SELECT EXISTS(SELECT 1 FROM public.dg_daily_capacity c WHERE c.production_date=p_destination_date AND c.is_closed=true) INTO v_closed; END IF;
  IF v_closed AND NOT p_closed_acknowledged THEN RAISE EXCEPTION USING MESSAGE='calendar_item.closed_date_override_required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_destination_date::text,'needs_attention'),0));
  SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM (
    SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_destination_date AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
    UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_destination_date AND i.deleted_at IS NULL AND i.item_id<>p_item_id
  ) x;
  UPDATE public.dg_calendar_items SET scheduled_date=p_destination_date,day_order=v_order,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at,destination_was_closed)
  VALUES(p_command_id,p_item_id,CASE WHEN p_destination_date IS NULL THEN 'unschedule' WHEN v_item.scheduled_date IS NULL THEN 'schedule' ELSE 'reschedule' END,
    v_item.scheduled_date,p_destination_date,v_item.day_order,v_order,v_actor,v_now,v_closed);
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'scheduled_date',p_destination_date,'day_order',v_order,'revision',v_item.revision+1);
END; $$;
ALTER FUNCTION public.move_calendar_item(uuid,uuid,bigint,date,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.move_calendar_item(uuid,uuid,bigint,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_calendar_item(uuid,uuid,bigint,date,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_calendar_item_completion(p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_completed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false); v_item public.dg_calendar_items%ROWTYPE; v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=p_item_id AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found'; END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item'; END IF;
  IF (v_item.completed_at IS NOT NULL)=p_completed THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request'; END IF;
  UPDATE public.dg_calendar_items SET completed_at=CASE WHEN p_completed THEN v_now ELSE NULL END,completed_by_user_id=CASE WHEN p_completed THEN v_actor ELSE NULL END,
    revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at)
  VALUES(p_command_id,p_item_id,CASE WHEN p_completed THEN 'complete' ELSE 'reopen' END,v_item.scheduled_date,v_item.scheduled_date,v_item.day_order,v_item.day_order,v_actor,v_now);
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'completed_at',CASE WHEN p_completed THEN v_now ELSE NULL END,'revision',v_item.revision+1);
END; $$;
ALTER FUNCTION public.set_calendar_item_completion(uuid,uuid,bigint,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_calendar_item_completion(uuid,uuid,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_calendar_item_completion(uuid,uuid,bigint,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_calendar_items(p_scheduled_date date,p_expected_keys text[],p_ordered_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false); v_current text[]; v_key text; v_pos bigint; v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));
  PERFORM 1 FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_scheduled_date AND b.deleted_at IS NULL AND b.cancelled_at IS NULL FOR UPDATE;
  PERFORM 1 FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND i.deleted_at IS NULL FOR UPDATE;
  SELECT COALESCE(pg_catalog.array_agg(x.key ORDER BY x.day_order,x.key),ARRAY[]::text[]) INTO v_current FROM (
    SELECT 'production:'||b.booking_id AS key,b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_scheduled_date AND b.deleted_at IS NULL AND b.cancelled_at IS NULL AND b.status='active' AND b.schedule_status='confirmed' AND b.board_visible IS DISTINCT FROM false
    UNION ALL SELECT 'item:'||i.item_id::text,i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND i.deleted_at IS NULL
  ) x;
  IF v_current IS DISTINCT FROM p_expected_keys THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_order'; END IF;
  IF pg_catalog.cardinality(p_ordered_keys)<>pg_catalog.cardinality(v_current) OR NOT (p_ordered_keys @> v_current AND v_current @> p_ordered_keys)
    OR (SELECT pg_catalog.count(DISTINCT k) FROM pg_catalog.unnest(p_ordered_keys) k)<>pg_catalog.cardinality(v_current)
  THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_order'; END IF;
  IF EXISTS(SELECT 1 FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_scheduled_date AND b.completed_at IS NOT NULL
      AND pg_catalog.array_position(v_current,'production:'||b.booking_id) IS DISTINCT FROM pg_catalog.array_position(p_ordered_keys,'production:'||b.booking_id))
    OR EXISTS(SELECT 1 FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND i.deleted_at IS NULL AND i.completed_at IS NOT NULL
      AND pg_catalog.array_position(v_current,'item:'||i.item_id::text) IS DISTINCT FROM pg_catalog.array_position(p_ordered_keys,'item:'||i.item_id::text))
  THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item'; END IF;
  FOR v_key,v_pos IN SELECT k,ordinality FROM pg_catalog.unnest(p_ordered_keys) WITH ORDINALITY q(k,ordinality) LOOP
    IF v_key LIKE 'production:%' THEN
      IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='production' AND p.access_level='use') THEN RAISE EXCEPTION USING MESSAGE='calendar_item.production_permission_required'; END IF;
      UPDATE public.dg_production_bookings SET day_order=v_pos*1024,updated_at=v_now,updated_by=v_actor::text WHERE booking_id=pg_catalog.substr(v_key,12);
    ELSIF v_key LIKE 'item:%' THEN
      UPDATE public.dg_calendar_items SET day_order=v_pos*1024,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=pg_catalog.substr(v_key,6)::uuid;
    ELSE RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_order'; END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('ordered_keys',p_ordered_keys,'updated_at',v_now);
END; $$;
ALTER FUNCTION public.reorder_calendar_items(date,text[],text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_calendar_items(date,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reorder_calendar_items(date,text[],text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_production_booking_day_order()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_date date;v_order bigint;
BEGIN
  v_date:=public.parse_production_booking_date(NEW.production_date);
  IF TG_OP='INSERT' OR NEW.day_order IS NULL OR (NEW.production_date IS DISTINCT FROM OLD.production_date AND NEW.day_order IS NOT DISTINCT FROM OLD.day_order) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(v_date::text,'needs_attention'),0));
    SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM(
      SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM v_date AND b.booking_id IS DISTINCT FROM NEW.booking_id
      UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM v_date AND i.deleted_at IS NULL)x;
    NEW.day_order:=v_order;
  END IF;RETURN NEW;
END; $$;
ALTER FUNCTION public.assign_production_booking_day_order() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_production_booking_day_order() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_native_job_shop_date_to_production()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_booking public.dg_production_bookings%ROWTYPE;v_actor uuid:=auth.uid();v_now timestamptz:=pg_catalog.clock_timestamp();v_order bigint;v_move uuid:=extensions.gen_random_uuid();v_name text;
BEGIN
  IF NEW.shop_date IS NOT DISTINCT FROM OLD.shop_date THEN RETURN NEW;END IF;
  SELECT * INTO v_booking FROM public.dg_production_bookings b WHERE b.job_id IN(OLD.visible_identifier,NEW.visible_identifier) AND b.booking_kind='production' AND b.deleted_at IS NULL AND b.cancelled_at IS NULL ORDER BY b.updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR public.parse_production_booking_date(v_booking.production_date) IS NOT DISTINCT FROM NEW.shop_date THEN RETURN NEW;END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(NEW.shop_date::text,'needs_attention'),0));
  SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM(SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM NEW.shop_date AND b.booking_id<>v_booking.booking_id UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM NEW.shop_date AND i.deleted_at IS NULL)x;
  SELECT COALESCE(NULLIF(pg_catalog.btrim(p.display_name),''),'DoorGo') INTO v_name FROM public.dg_user_profiles p WHERE p.user_id=v_actor;
  UPDATE public.dg_production_bookings SET job_id=NEW.visible_identifier,production_date=CASE WHEN NEW.shop_date IS NULL THEN NULL ELSE NEW.shop_date::text END,day_order=v_order,updated_at=v_now,updated_by=v_actor::text WHERE booking_id=v_booking.booking_id;
  INSERT INTO public.dg_production_booking_moves(move_id,command_id,booking_id,from_production_date,to_production_date,shop_hours_snapshot,actor_user_id,actor_display_name_snapshot,moved_at,original_updated_at_snapshot,wholly_unstarted_acknowledged,source_system,created_at,action_type,reason,destination_was_closed,closed_date_override_acknowledged)
  VALUES(v_move,v_move,v_booking.booking_id,public.parse_production_booking_date(v_booking.production_date),NEW.shop_date,v_booking.shop_hours,v_actor,COALESCE(v_name,'DoorGo'),v_now,v_booking.updated_at,true,'doorgo_native',v_now,CASE WHEN NEW.shop_date IS NULL THEN 'unschedule' WHEN v_booking.production_date IS NULL THEN 'schedule' ELSE 'reschedule' END,NULL,false,false);
  RETURN NEW;
END; $$;
ALTER FUNCTION public.sync_native_job_shop_date_to_production() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_native_job_shop_date_to_production() FROM PUBLIC,anon,authenticated;

-- Open Production may be placed on any normal working date without an acknowledgement or reason.
CREATE OR REPLACE FUNCTION public.place_production_booking(
  p_command_id uuid,p_booking_id text,p_expected_production_date date,p_destination_production_date date,
  p_wholly_unstarted_acknowledged boolean,p_backdate_reason text,p_closed_date_override_acknowledged boolean
) RETURNS TABLE(move_id uuid,booking_id text,previous_production_date date,new_production_date date,previous_day_order bigint,new_day_order bigint,
  shop_hours numeric(10,2),moved_at timestamptz,action_type text,destination_was_closed boolean,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_profile public.dg_user_profiles%ROWTYPE;v_booking public.dg_production_bookings%ROWTYPE;v_native public.dg_native_jobs%ROWTYPE;
  v_current date;v_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();v_move_id uuid:=extensions.gen_random_uuid();v_closed boolean:=false;v_action text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='production_placement.authentication_required';END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles p WHERE p.user_id=v_actor;
  IF NOT FOUND OR NOT v_profile.active THEN RAISE EXCEPTION USING MESSAGE='production_placement.active_profile_required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='production' AND p.access_level='use') OR NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level='use') THEN RAISE EXCEPTION USING MESSAGE='production_placement.permission_required';END IF;
  IF p_command_id IS NULL OR p_booking_id IS NULL OR p_expected_production_date IS NOT DISTINCT FROM p_destination_production_date OR NULLIF(pg_catalog.btrim(p_backdate_reason),'') IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='production_placement.invalid_request';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_command:'||p_command_id::text,0));
  IF EXISTS(SELECT 1 FROM public.dg_production_booking_moves m WHERE m.command_id=p_command_id)THEN RAISE EXCEPTION USING MESSAGE='production_placement.command_uuid_collision';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_booking:'||p_booking_id,0));
  SELECT * INTO v_booking FROM public.dg_production_bookings b WHERE b.booking_id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='production_placement.not_found';END IF;
  v_current:=public.parse_production_booking_date(v_booking.production_date);
  IF v_current IS DISTINCT FROM p_expected_production_date THEN RAISE EXCEPTION USING MESSAGE='production_placement.stale_booking';END IF;
  IF v_booking.booking_kind IS DISTINCT FROM 'production' OR v_booking.deleted_at IS NOT NULL OR v_booking.cancelled_at IS NOT NULL OR v_booking.status IS DISTINCT FROM 'active' OR v_booking.schedule_status IS DISTINCT FROM 'confirmed' OR v_booking.board_visible IS NOT DISTINCT FROM false OR v_booking.locked IS NOT DISTINCT FROM true OR v_booking.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='production_placement.ineligible_booking';END IF;
  SELECT * INTO v_native FROM public.dg_native_jobs j WHERE j.visible_identifier=v_booking.job_id AND j.archived_at IS NULL FOR UPDATE;
  IF FOUND AND NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND p.access_level='use')THEN RAISE EXCEPTION USING MESSAGE='production_placement.jobs_permission_required';END IF;
  IF p_destination_production_date IS NOT NULL THEN SELECT EXISTS(SELECT 1 FROM public.dg_daily_capacity c WHERE c.production_date=p_destination_production_date AND c.is_closed=true) INTO v_closed;IF v_closed AND p_closed_date_override_acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION USING MESSAGE='production_placement.closed_date_override_required';END IF;END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_destination_production_date::text,'needs_attention'),0));
  SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM(SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_destination_production_date AND b.booking_id<>p_booking_id AND b.deleted_at IS NULL AND b.cancelled_at IS NULL UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_destination_production_date AND i.deleted_at IS NULL)x;
  UPDATE public.dg_production_bookings SET production_date=CASE WHEN p_destination_production_date IS NULL THEN NULL ELSE p_destination_production_date::text END,day_order=v_order,updated_at=v_now,updated_by=v_actor::text WHERE dg_production_bookings.booking_id=p_booking_id;
  IF v_native.internal_job_id IS NOT NULL THEN UPDATE public.dg_native_jobs SET shop_date=p_destination_production_date,shop_date_source=CASE WHEN p_destination_production_date IS NULL THEN NULL ELSE 'Manual' END,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE internal_job_id=v_native.internal_job_id;END IF;
  v_action:=CASE WHEN p_destination_production_date IS NULL THEN 'unschedule' WHEN v_current IS NULL THEN 'schedule' ELSE 'reschedule' END;
  INSERT INTO public.dg_production_booking_moves(move_id,command_id,booking_id,from_production_date,to_production_date,shop_hours_snapshot,actor_user_id,actor_display_name_snapshot,moved_at,original_updated_at_snapshot,wholly_unstarted_acknowledged,source_system,created_at,action_type,reason,destination_was_closed,closed_date_override_acknowledged)
  VALUES(v_move_id,p_command_id,p_booking_id,v_current,p_destination_production_date,v_booking.shop_hours,v_actor,pg_catalog.btrim(v_profile.display_name),v_now,v_booking.updated_at,true,'doorgo_native',v_now,v_action,NULL,v_closed,v_closed);
  RETURN QUERY SELECT v_move_id,p_booking_id,v_current,p_destination_production_date,v_booking.day_order,v_order,v_booking.shop_hours::numeric(10,2),v_now,v_action,v_closed,'moved'::text;
END; $$;
ALTER FUNCTION public.place_production_booking(uuid,text,date,date,boolean,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.place_production_booking(uuid,text,date,date,boolean,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_production_booking(uuid,text,date,date,boolean,text,boolean) TO authenticated;

COMMIT;
