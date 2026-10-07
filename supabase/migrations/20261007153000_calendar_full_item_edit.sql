-- Atomic Calendar operational edits; does not grant general Job or planning access.
BEGIN;
CREATE TABLE public.dg_calendar_edit_events (
 command_id uuid PRIMARY KEY, item_key text NOT NULL, actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 before_values jsonb NOT NULL, after_values jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.dg_calendar_edit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dg_calendar_edit_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.calendar_item_edit_snapshot(p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=public.dg_calendar_require_use(false); b public.dg_production_bookings%ROWTYPE; i public.dg_calendar_items%ROWTYPE; j public.dg_native_jobs%ROWTYPE; jid uuid; result jsonb;
BEGIN
 IF p_key LIKE 'item:%' THEN
  SELECT * INTO i FROM public.dg_calendar_items WHERE item_id=substring(p_key FROM 6)::uuid AND deleted_at IS NULL;
  IF NOT FOUND OR i.item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION 'calendar_edit.not_found'; END IF;
  jid:=i.linked_internal_job_id;
  result:=jsonb_build_object('key',p_key,'kind',i.item_type,'revision',i.revision,'dayOrder',i.day_order,'name',i.customer_name,'salesOrder',i.sales_order,'salesperson',i.salesperson,'date',i.scheduled_date,'timing',i.timing,'fulfillmentNote',i.fulfillment_note,'identityReadOnly',i.current_portion_id IS NOT NULL,'completed',i.completed_at IS NOT NULL);
 ELSE
  SELECT * INTO b FROM public.dg_production_bookings WHERE booking_id=p_key AND deleted_at IS NULL AND cancelled_at IS NULL AND status='active' AND schedule_status='confirmed' AND booking_kind='production';
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar_edit.not_found'; END IF;
  jid:=b.linked_internal_job_id;
  result:=jsonb_build_object('key',p_key,'kind','production','updatedAt',b.updated_at,'dayOrder',b.day_order,'name',b.title,'salesOrder',b.job_id,'salesperson',b.salesperson,'shopHours',b.shop_hours,'date',public.parse_production_booking_date(b.production_date),'identityReadOnly',false,'completed',b.completed_at IS NOT NULL OR b.locked IS TRUE);
 END IF;
 IF jid IS NOT NULL THEN
  SELECT * INTO j FROM public.dg_native_jobs WHERE internal_job_id=jid AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar_edit.job_not_found'; END IF;
  result:=result||jsonb_build_object('linkedJobId',jid,'jobRevision',j.revision,'name',j.customer);
  IF p_key NOT LIKE 'item:%' THEN result:=result||jsonb_build_object('salesOrder',j.biztrack_sales_order,'salesperson',j.salesperson,'shopHours',j.shop_hours,'identityReadOnly',(j.origin='legacy_transfer' AND j.legacy_identifier_kind='biztrack_sales_order') OR EXISTS(SELECT 1 FROM public.dg_fulfillment_order_portions WHERE linked_internal_job_id=jid AND deleted_at IS NULL));
  ELSE result:=result||jsonb_build_object('fulfillmentNote',j.notes); END IF;
 END IF;
 RETURN result;
END;$$;

CREATE FUNCTION public.save_calendar_item_edit(p_command_id uuid,p_expected jsonb,p_values jsonb,p_closed_acknowledged boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=public.dg_calendar_require_use(false); key text:=p_expected->>'key'; b public.dg_production_bookings%ROWTYPE; i public.dg_calendar_items%ROWTYPE; j public.dg_native_jobs%ROWTYPE; jid uuid; old jsonb; result jsonb;
 name text:=NULLIF(btrim(p_values->>'name'),''); so text:=NULLIF(btrim(p_values->>'salesOrder'),''); v_salesperson text:=NULLIF(btrim(p_values->>'salesperson'),''); hours numeric:=NULLIF(p_values->>'shopHours','')::numeric; dest date:=NULLIF(p_values->>'date','')::date; current_date_value date; now_value timestamptz:=clock_timestamp(); identifier text; identifier_kind text;
BEGIN
 IF p_command_id IS NULL OR key IS NULL OR name IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) x WHERE x NOT IN('name','salesOrder','salesperson','shopHours','date','timing','fulfillmentNote')) THEN RAISE EXCEPTION 'calendar_edit.invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar_edit:'||p_command_id::text,0));
 IF EXISTS(SELECT 1 FROM public.dg_calendar_edit_events WHERE command_id=p_command_id) THEN RAISE EXCEPTION 'calendar_edit.duplicate_command'; END IF;
 -- Lock the authoritative Job before its synchronized booking/item, matching Job updates.
 IF key LIKE 'item:%' THEN SELECT linked_internal_job_id INTO jid FROM public.dg_calendar_items WHERE item_id=substring(key FROM 6)::uuid;
 ELSE SELECT linked_internal_job_id INTO jid FROM public.dg_production_bookings WHERE booking_id=key; END IF;
 IF jid IS NOT NULL THEN
  SELECT * INTO j FROM public.dg_native_jobs WHERE internal_job_id=jid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR j.revision IS DISTINCT FROM (p_expected->>'jobRevision')::bigint OR jid IS DISTINCT FROM (p_expected->>'linkedJobId')::uuid THEN RAISE EXCEPTION 'calendar_edit.stale_job'; END IF;
 END IF;
 IF key LIKE 'item:%' THEN
  SELECT * INTO i FROM public.dg_calendar_items WHERE item_id=substring(key FROM 6)::uuid AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR i.item_type NOT IN('delivery','customer_pickup') THEN RAISE EXCEPTION 'calendar_edit.not_found'; END IF;
  IF i.revision IS DISTINCT FROM (p_expected->>'revision')::bigint OR i.linked_internal_job_id IS DISTINCT FROM jid THEN RAISE EXCEPTION 'calendar_edit.stale_item'; END IF;
  IF i.completed_at IS NOT NULL THEN RAISE EXCEPTION 'calendar_edit.completed'; END IF;
  IF i.current_portion_id IS NOT NULL AND so IS DISTINCT FROM i.sales_order THEN RAISE EXCEPTION 'calendar_edit.order_identity_read_only'; END IF;
  current_date_value:=i.scheduled_date;
 ELSE
  SELECT * INTO b FROM public.dg_production_bookings WHERE booking_id=key FOR UPDATE;
  IF NOT FOUND OR b.deleted_at IS NOT NULL OR b.cancelled_at IS NOT NULL OR b.status IS DISTINCT FROM 'active' OR b.schedule_status IS DISTINCT FROM 'confirmed' OR b.booking_kind<>'production' OR b.board_visible IS FALSE THEN RAISE EXCEPTION 'calendar_edit.not_found'; END IF;
  IF b.updated_at IS DISTINCT FROM (p_expected->>'updatedAt')::timestamptz OR b.linked_internal_job_id IS DISTINCT FROM jid THEN RAISE EXCEPTION 'calendar_edit.stale_item'; END IF;
  IF b.completed_at IS NOT NULL OR b.locked IS TRUE THEN RAISE EXCEPTION 'calendar_edit.completed_or_locked'; END IF;
  IF v_salesperson IS NULL OR (hours IS NOT NULL AND (hours<0 OR hours>99999999.99 OR hours<>trunc(hours,2))) THEN RAISE EXCEPTION 'calendar_edit.invalid_request'; END IF;
  current_date_value:=public.parse_production_booking_date(b.production_date);
 END IF;
 old:=public.calendar_item_edit_snapshot(key);
 IF dest IS DISTINCT FROM current_date_value AND dest IS NOT NULL AND EXISTS(SELECT 1 FROM public.dg_daily_capacity WHERE production_date=dest AND is_closed=true) AND p_closed_acknowledged IS NOT TRUE THEN RAISE EXCEPTION 'calendar_edit.closed_acknowledgement_required'; END IF;
 IF key LIKE 'item:%' THEN
  IF dest IS DISTINCT FROM current_date_value THEN PERFORM public.move_calendar_item(extensions.gen_random_uuid(),i.item_id,i.revision,dest,p_closed_acknowledged); END IF;
  IF jid IS NOT NULL THEN UPDATE public.dg_native_jobs SET customer=name,notes=NULLIF(p_values->>'fulfillmentNote',''),revision=revision+1,updated_at=now_value,updated_by_user_id=actor WHERE internal_job_id=jid; END IF;
  UPDATE public.dg_calendar_items SET customer_name=name,sales_order=so,salesperson=v_salesperson,timing=NULLIF(p_values->>'timing',''),fulfillment_note=CASE WHEN jid IS NULL THEN NULLIF(p_values->>'fulfillmentNote','') ELSE NULL END,revision=revision+1,updated_at=now_value,updated_by_user_id=actor WHERE item_id=i.item_id;
 ELSE
  -- Existing placement contract retains date validation, ordering, Shop Date sync and move audit.
  IF dest IS DISTINCT FROM current_date_value THEN PERFORM public.calendar_place_production_booking(extensions.gen_random_uuid(),key,current_date_value,dest,false,NULL,p_closed_acknowledged); END IF;
  IF jid IS NOT NULL THEN
   IF so IS DISTINCT FROM j.biztrack_sales_order AND EXISTS(SELECT 1 FROM public.dg_fulfillment_order_portions WHERE linked_internal_job_id=jid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'calendar_edit.order_identity_read_only';END IF;
   -- Same native Job identifier rules as dg_update_native_job; legacy SO identity is immutable.
   IF j.origin='legacy_transfer' THEN identifier:=j.visible_identifier; identifier_kind:=j.visible_identifier_kind; IF j.legacy_identifier_kind='biztrack_sales_order' THEN IF so IS DISTINCT FROM j.biztrack_sales_order THEN RAISE EXCEPTION 'calendar_edit.order_identity_read_only'; END IF; so:=j.biztrack_sales_order; END IF;
   ELSIF so IS NULL THEN identifier:=j.door_go_reference;identifier_kind:='door_go_reference'; ELSE identifier:=so;identifier_kind:='biztrack_sales_order';END IF;
   IF EXISTS(SELECT 1 FROM public.dg_native_jobs other WHERE other.internal_job_id<>jid AND so IS NOT NULL AND lower(btrim(other.biztrack_sales_order))=lower(so)) THEN RAISE EXCEPTION 'native_job.duplicate_sales_order';END IF;
   UPDATE public.dg_native_jobs SET customer=name,biztrack_sales_order=so,visible_identifier=identifier,visible_identifier_kind=identifier_kind,salesperson=v_salesperson,shop_hours=hours,shop_date=dest,shop_date_source=CASE WHEN dest IS DISTINCT FROM j.shop_date THEN CASE WHEN dest IS NULL THEN NULL ELSE 'Manual' END ELSE j.shop_date_source END,shop_hours_source=CASE WHEN hours IS DISTINCT FROM j.shop_hours THEN CASE WHEN hours IS NULL THEN NULL ELSE 'Manual' END ELSE j.shop_hours_source END,revision=revision+1,updated_at=now_value,updated_by_user_id=actor WHERE internal_job_id=jid;
  ELSE
   -- source prevents the existing inference trigger from turning an unlinked SO edit into a Job link.
   UPDATE public.dg_production_bookings SET title=name,job_id=so,salesperson=v_salesperson,shop_hours=hours,source='DoorGo Calendar',updated_at=now_value,updated_by=actor::text WHERE booking_id=key;
  END IF;
 END IF;
 result:=public.calendar_item_edit_snapshot(key);
 INSERT INTO public.dg_calendar_edit_events(command_id,item_key,actor_user_id,before_values,after_values) VALUES(p_command_id,key,actor,old,result);
 RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.update_calendar_note(
  p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_title text,p_details text,
  p_linked_internal_job_id uuid,p_salesperson text,p_scheduled_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_item public.dg_calendar_items%ROWTYPE;v_job public.dg_native_jobs%ROWTYPE;
  v_title text:=NULLIF(pg_catalog.btrim(p_title),'');v_order bigint;v_from_date date;v_from_order bigint;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_item_id IS NULL OR p_expected_revision IS NULL OR v_title IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
  IF EXISTS(SELECT 1 FROM public.dg_calendar_item_events WHERE command_id=p_command_id) THEN RETURN pg_catalog.jsonb_build_object('item_id',p_item_id);END IF;
  SELECT * INTO v_item FROM public.dg_calendar_items WHERE item_id=p_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_item.item_type<>'note' THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found';END IF;
  IF v_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item';END IF;
  IF v_item.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item';END IF;
  v_from_date:=v_item.scheduled_date;v_from_order:=v_item.day_order;
  IF p_linked_internal_job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.dg_native_jobs WHERE internal_job_id=p_linked_internal_job_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='calendar_item.job_not_found';END IF;
  END IF;
  IF v_item.scheduled_date IS DISTINCT FROM p_scheduled_date THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));
    SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM (
      SELECT day_order FROM public.dg_production_bookings WHERE public.parse_production_booking_date(production_date) IS NOT DISTINCT FROM p_scheduled_date AND deleted_at IS NULL AND cancelled_at IS NULL
      UNION ALL SELECT day_order FROM public.dg_calendar_items WHERE scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND deleted_at IS NULL AND item_id<>p_item_id
    )x;
  ELSE v_order:=v_item.day_order;END IF;
  UPDATE public.dg_calendar_items SET title=v_title,customer_name=v_title,details=NULLIF(pg_catalog.btrim(p_details),''),linked_internal_job_id=p_linked_internal_job_id,
    sales_order=CASE WHEN p_linked_internal_job_id IS NULL THEN NULL ELSE v_job.biztrack_sales_order END,
    salesperson=NULLIF(pg_catalog.btrim(p_salesperson),''),
    scheduled_date=p_scheduled_date,day_order=v_order,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id RETURNING * INTO v_item;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,to_scheduled_date,from_day_order,to_day_order,actor_user_id,occurred_at)
    VALUES(p_command_id,p_item_id,'edit',v_from_date,p_scheduled_date,v_from_order,v_order,v_actor,v_now);
  RETURN pg_catalog.jsonb_build_object('item_id',p_item_id,'revision',v_item.revision);
END;$$;
CREATE OR REPLACE FUNCTION public.search_calendar_linkable_jobs(p_query text,p_item_type text,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_query text:=pg_catalog.btrim(p_query);v_limit integer:=COALESCE(p_limit,20);v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='native_job.authentication_required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true) THEN RAISE EXCEPTION USING MESSAGE='native_job.active_profile_required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND ((p.permission_key='jobs' AND p.access_level IN('view','use')) OR (p.permission_key='calendar' AND p.access_level='use'))) THEN RAISE EXCEPTION USING MESSAGE='native_job.permission_required';END IF;
  IF v_query='' OR p_item_type NOT IN('production','delivery','customer_pickup','note') OR v_limit<1 OR v_limit>50 THEN RAISE EXCEPTION USING MESSAGE='native_job.validation_failed';END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) ORDER BY candidate.updated_at DESC,candidate.internal_job_id DESC),'[]'::jsonb) INTO v_result FROM(
    SELECT j.internal_job_id,j.customer,j.biztrack_sales_order,j.door_go_reference,j.visible_identifier,j.salesperson,j.fulfillment_plan,j.revision,j.updated_at
    FROM public.dg_native_jobs j
    WHERE j.archived_at IS NULL AND j.origin IN('native','legacy_transfer')
      AND (j.customer ILIKE '%'||v_query||'%' OR j.biztrack_sales_order ILIKE '%'||v_query||'%' OR j.door_go_reference ILIKE '%'||v_query||'%' OR j.visible_identifier ILIKE '%'||v_query||'%')
      AND (p_item_type IN('production','note') OR (p_item_type='delivery' AND (j.fulfillment_plan IS NULL OR j.fulfillment_plan='Delivery')) OR (p_item_type='customer_pickup' AND (j.fulfillment_plan IS NULL OR j.fulfillment_plan='Customer Pickup')))
    ORDER BY j.updated_at DESC,j.internal_job_id DESC LIMIT v_limit
  )candidate;
  RETURN v_result;
END;$$;
ALTER FUNCTION public.calendar_item_edit_snapshot(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_item_edit_snapshot(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calendar_item_edit_snapshot(text) TO authenticated;
ALTER FUNCTION public.save_calendar_item_edit(uuid,jsonb,jsonb,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_calendar_item_edit(uuid,jsonb,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_calendar_item_edit(uuid,jsonb,jsonb,boolean) TO authenticated;
COMMIT;
