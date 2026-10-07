-- Calendar operational authorization. Planning RPCs remain unchanged.
BEGIN;

-- Based on 20260821030000_add_operational_calendar_items.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.calendar_place_production_booking(
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
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key = 'calendar' AND p.access_level='use') OR NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level='use') THEN RAISE EXCEPTION USING MESSAGE='production_placement.permission_required';END IF;
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
ALTER FUNCTION public.calendar_place_production_booking(uuid,text,date,date,boolean,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_place_production_booking(uuid,text,date,date,boolean,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_place_production_booking(uuid,text,date,date,boolean,text,boolean) TO authenticated;

-- Based on 20260716000000_create_production_booking_completion_contract.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.calendar_complete_production_booking(
  p_command_id uuid,
  p_booking_id text,
  p_expected_production_date date
)
RETURNS TABLE (
  event_id uuid,
  booking_id text,
  production_date date,
  previous_completed_at timestamptz,
  resulting_completed_at timestamptz,
  occurred_at timestamptz,
  action_type text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.dg_user_profiles%ROWTYPE;
  v_existing public.dg_production_booking_completion_events%ROWTYPE;
  v_booking public.dg_production_bookings%ROWTYPE;
  v_current_date date;
  v_event_id uuid := extensions.gen_random_uuid();
  v_occurred_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.authentication_required';
  END IF;

  SELECT *
    INTO v_profile
    FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor;

  IF NOT FOUND
    OR NOT v_profile.active
    OR v_profile.display_name IS NULL
    OR pg_catalog.length(pg_catalog.btrim(v_profile.display_name)) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.active_profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.dg_user_permissions AS permission
      WHERE permission.user_id = v_actor
        AND permission.permission_key = 'calendar'
        AND permission.access_level = 'use'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.permission_required';
  END IF;

  IF p_command_id IS NULL
    OR p_booking_id IS NULL
    OR p_expected_production_date IS NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.invalid_request';
  END IF;

  IF p_booking_id IS DISTINCT FROM pg_catalog.btrim(p_booking_id)
    OR pg_catalog.length(p_booking_id) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.invalid_booking_id';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dg_production_booking_completion_command:' || p_command_id::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dg_production_booking_move_booking:' || p_booking_id,
      0
    )
  );

  SELECT *
    INTO v_existing
    FROM public.dg_production_booking_completion_events AS completion_event
    WHERE completion_event.command_id = p_command_id;

  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor
      OR v_existing.booking_id IS DISTINCT FROM p_booking_id
      OR v_existing.production_date IS DISTINCT FROM p_expected_production_date
      OR v_existing.action_type IS DISTINCT FROM 'completed'
      OR v_existing.previous_completed_at IS NOT NULL
      OR v_existing.resulting_completed_at IS NULL
      OR v_existing.reopen_reason IS NOT NULL
    THEN
      RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.command_uuid_collision';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.event_id,
      v_existing.booking_id,
      v_existing.production_date,
      v_existing.previous_completed_at,
      v_existing.resulting_completed_at,
      v_existing.occurred_at,
      v_existing.action_type,
      'completed'::text;
    RETURN;
  END IF;

  SELECT *
    INTO v_booking
    FROM public.dg_production_bookings AS booking
    WHERE booking.booking_id = p_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.not_found';
  END IF;

  v_current_date := public.parse_production_booking_date(v_booking.production_date);
  IF v_current_date IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.ineligible_booking';
  END IF;
  IF v_current_date IS DISTINCT FROM p_expected_production_date THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.stale_booking';
  END IF;
  IF v_booking.booking_kind IS DISTINCT FROM 'production'
    OR v_booking.deleted_at IS NOT NULL
    OR v_booking.cancelled_at IS NOT NULL
    OR v_booking.status IS DISTINCT FROM 'active'
    OR v_booking.schedule_status IS DISTINCT FROM 'confirmed'
    OR v_booking.board_visible IS NOT DISTINCT FROM false
    OR v_booking.locked IS NOT DISTINCT FROM true
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.ineligible_booking';
  END IF;
  IF v_booking.completed_at IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.already_completed';
  END IF;

  v_occurred_at := pg_catalog.clock_timestamp();

  UPDATE public.dg_production_bookings AS booking
  SET completed_at = v_occurred_at
  WHERE booking.booking_id = p_booking_id;

  INSERT INTO public.dg_production_booking_completion_events (
    event_id,
    command_id,
    booking_id,
    production_date,
    action_type,
    actor_user_id,
    actor_display_name_snapshot,
    occurred_at,
    previous_completed_at,
    resulting_completed_at,
    reopen_reason,
    created_at
  ) VALUES (
    v_event_id,
    p_command_id,
    p_booking_id,
    v_current_date,
    'completed',
    v_actor,
    pg_catalog.btrim(v_profile.display_name),
    v_occurred_at,
    NULL,
    v_occurred_at,
    NULL,
    v_occurred_at
  );

  RETURN QUERY
  SELECT
    v_event_id,
    p_booking_id,
    v_current_date,
    NULL::timestamptz,
    v_occurred_at,
    v_occurred_at,
    'completed'::text,
    'completed'::text;
END;
$$;
ALTER FUNCTION public.calendar_complete_production_booking(uuid, text, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_complete_production_booking(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_complete_production_booking(uuid, text, date) TO authenticated;

-- Based on 20260716000000_create_production_booking_completion_contract.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.calendar_reopen_production_booking(
  p_command_id uuid,
  p_booking_id text,
  p_expected_production_date date,
  p_expected_completed_at timestamptz,
  p_reason text
)
RETURNS TABLE (
  event_id uuid,
  booking_id text,
  production_date date,
  previous_completed_at timestamptz,
  resulting_completed_at timestamptz,
  occurred_at timestamptz,
  action_type text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.dg_user_profiles%ROWTYPE;
  v_reason text := NULLIF(pg_catalog.btrim(p_reason), '');
  v_existing public.dg_production_booking_completion_events%ROWTYPE;
  v_booking public.dg_production_bookings%ROWTYPE;
  v_current_date date;
  v_event_id uuid := extensions.gen_random_uuid();
  v_occurred_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.authentication_required';
  END IF;

  SELECT *
    INTO v_profile
    FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor;

  IF NOT FOUND
    OR NOT v_profile.active
    OR v_profile.display_name IS NULL
    OR pg_catalog.length(pg_catalog.btrim(v_profile.display_name)) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.active_profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.dg_user_permissions AS permission
      WHERE permission.user_id = v_actor
        AND permission.permission_key = 'calendar'
        AND permission.access_level = 'use'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.permission_required';
  END IF;

  IF p_command_id IS NULL
    OR p_booking_id IS NULL
    OR p_expected_production_date IS NULL
    OR p_expected_completed_at IS NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.invalid_request';
  END IF;

  IF p_booking_id IS DISTINCT FROM pg_catalog.btrim(p_booking_id)
    OR pg_catalog.length(p_booking_id) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.invalid_booking_id';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.reason_required';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.invalid_reason';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dg_production_booking_completion_command:' || p_command_id::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dg_production_booking_move_booking:' || p_booking_id,
      0
    )
  );

  SELECT *
    INTO v_existing
    FROM public.dg_production_booking_completion_events AS completion_event
    WHERE completion_event.command_id = p_command_id;

  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor
      OR v_existing.booking_id IS DISTINCT FROM p_booking_id
      OR v_existing.production_date IS DISTINCT FROM p_expected_production_date
      OR v_existing.action_type IS DISTINCT FROM 'reopened'
      OR v_existing.previous_completed_at IS DISTINCT FROM p_expected_completed_at
      OR v_existing.resulting_completed_at IS NOT NULL
      OR v_existing.reopen_reason IS DISTINCT FROM v_reason
    THEN
      RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.command_uuid_collision';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.event_id,
      v_existing.booking_id,
      v_existing.production_date,
      v_existing.previous_completed_at,
      v_existing.resulting_completed_at,
      v_existing.occurred_at,
      v_existing.action_type,
      'reopened'::text;
    RETURN;
  END IF;

  SELECT *
    INTO v_booking
    FROM public.dg_production_bookings AS booking
    WHERE booking.booking_id = p_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.not_found';
  END IF;

  v_current_date := public.parse_production_booking_date(v_booking.production_date);
  IF v_current_date IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.ineligible_booking';
  END IF;
  IF v_current_date IS DISTINCT FROM p_expected_production_date THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.stale_booking';
  END IF;
  IF v_booking.booking_kind IS DISTINCT FROM 'production'
    OR v_booking.deleted_at IS NOT NULL
    OR v_booking.cancelled_at IS NOT NULL
    OR v_booking.status IS DISTINCT FROM 'active'
    OR v_booking.schedule_status IS DISTINCT FROM 'confirmed'
    OR v_booking.board_visible IS NOT DISTINCT FROM false
    OR v_booking.locked IS NOT DISTINCT FROM true
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.ineligible_booking';
  END IF;
  IF v_booking.completed_at IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.not_completed';
  END IF;
  IF v_booking.completed_at IS DISTINCT FROM p_expected_completed_at THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_completion.stale_booking';
  END IF;

  v_occurred_at := pg_catalog.clock_timestamp();

  UPDATE public.dg_production_bookings AS booking
  SET completed_at = NULL
  WHERE booking.booking_id = p_booking_id;

  INSERT INTO public.dg_production_booking_completion_events (
    event_id,
    command_id,
    booking_id,
    production_date,
    action_type,
    actor_user_id,
    actor_display_name_snapshot,
    occurred_at,
    previous_completed_at,
    resulting_completed_at,
    reopen_reason,
    created_at
  ) VALUES (
    v_event_id,
    p_command_id,
    p_booking_id,
    v_current_date,
    'reopened',
    v_actor,
    pg_catalog.btrim(v_profile.display_name),
    v_occurred_at,
    v_booking.completed_at,
    NULL,
    v_reason,
    v_occurred_at
  );

  RETURN QUERY
  SELECT
    v_event_id,
    p_booking_id,
    v_current_date,
    v_booking.completed_at,
    NULL::timestamptz,
    v_occurred_at,
    'reopened'::text,
    'reopened'::text;
END;
$$;
ALTER FUNCTION public.calendar_reopen_production_booking(uuid, text, date, timestamptz, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_reopen_production_booking(uuid, text, date, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_reopen_production_booking(uuid, text, date, timestamptz, text) TO authenticated;

-- Based on 20260821000000_add_production_day_order.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.calendar_reschedule_production_booking(
  p_command_id uuid, p_booking_id text, p_expected_production_date date,
  p_destination_production_date date, p_wholly_unstarted_acknowledged boolean,
  p_backdate_reason text, p_closed_date_override_acknowledged boolean
)
RETURNS TABLE (
  move_id uuid, booking_id text, previous_production_date date,
  new_production_date date, shop_hours numeric(10,2), moved_at timestamptz,
  action_type text, destination_was_closed boolean, status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.dg_user_profiles%ROWTYPE;
  v_today date;
  v_reason text := NULLIF(pg_catalog.btrim(p_backdate_reason), '');
  v_action_type text;
  v_destination_was_closed boolean;
  v_existing public.dg_production_booking_moves%ROWTYPE;
  v_booking public.dg_production_bookings%ROWTYPE;
  v_current_date date;
  v_destination_order bigint;
  v_move_id uuid := extensions.gen_random_uuid();
  v_moved_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.authentication_required'; END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles AS profile WHERE profile.user_id = v_actor;
  IF NOT FOUND OR NOT v_profile.active OR v_profile.display_name IS NULL OR pg_catalog.length(pg_catalog.btrim(v_profile.display_name)) = 0
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS permission WHERE permission.user_id = v_actor AND permission.permission_key = 'calendar' AND permission.access_level = 'use')
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.permission_required'; END IF;
  IF p_command_id IS NULL OR p_booking_id IS NULL OR p_expected_production_date IS NULL OR p_destination_production_date IS NULL OR p_wholly_unstarted_acknowledged IS NULL OR p_closed_date_override_acknowledged IS NULL
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_request'; END IF;
  IF pg_catalog.length(pg_catalog.btrim(p_booking_id)) = 0 OR pg_catalog.length(p_booking_id) > 500 OR p_booking_id IS DISTINCT FROM pg_catalog.btrim(p_booking_id)
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_booking_id'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_command:' || p_command_id::text, 0));
  SELECT * INTO v_existing FROM public.dg_production_booking_moves AS move WHERE move.command_id = p_command_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor OR v_existing.booking_id IS DISTINCT FROM p_booking_id OR v_existing.from_production_date IS DISTINCT FROM p_expected_production_date OR v_existing.to_production_date IS DISTINCT FROM p_destination_production_date OR v_existing.wholly_unstarted_acknowledged IS DISTINCT FROM p_wholly_unstarted_acknowledged OR v_existing.reason IS DISTINCT FROM v_reason OR v_existing.action_type NOT IN ('reschedule', 'backdate') OR v_existing.closed_date_override_acknowledged IS DISTINCT FROM p_closed_date_override_acknowledged
    THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.command_uuid_collision'; END IF;
    RETURN QUERY SELECT v_existing.move_id, v_existing.booking_id, v_existing.from_production_date, v_existing.to_production_date, v_existing.shop_hours_snapshot, v_existing.moved_at, v_existing.action_type, v_existing.destination_was_closed, 'moved'::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_booking:' || p_booking_id, 0));
  IF p_expected_production_date <= p_destination_production_date THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_day_order:' || p_expected_production_date::text, 0));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_day_order:' || p_destination_production_date::text, 0));
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_day_order:' || p_destination_production_date::text, 0));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_day_order:' || p_expected_production_date::text, 0));
  END IF;
  SELECT * INTO v_booking FROM public.dg_production_bookings AS booking WHERE booking.booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.not_found'; END IF;
  v_today := (pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
  v_current_date := public.parse_production_booking_date(v_booking.production_date);
  IF v_current_date IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.ineligible_booking'; END IF;
  IF v_current_date IS DISTINCT FROM p_expected_production_date THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.stale_booking'; END IF;
  IF v_current_date = p_destination_production_date THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.no_change'; END IF;
  v_action_type := CASE WHEN p_destination_production_date < v_today THEN 'backdate' ELSE 'reschedule' END;
  IF v_action_type = 'backdate' THEN
    IF v_reason IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.backdate_reason_required'; END IF;
    IF pg_catalog.length(v_reason) > 500 THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_backdate_reason'; END IF;
  ELSIF v_reason IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_backdate_reason';
  ELSE v_reason := NULL; END IF;
  IF v_booking.booking_kind IS DISTINCT FROM 'production' OR v_booking.deleted_at IS NOT NULL OR v_booking.cancelled_at IS NOT NULL OR v_booking.status IS DISTINCT FROM 'active' OR v_booking.schedule_status IS DISTINCT FROM 'confirmed' OR v_booking.board_visible IS NOT DISTINCT FROM false OR v_booking.locked IS NOT DISTINCT FROM true OR v_booking.completed_at IS NOT NULL OR pg_catalog.length(pg_catalog.btrim(v_booking.booking_id)) = 0 OR v_booking.shop_hours IS NULL OR v_booking.shop_hours < 0 OR v_booking.shop_hours > 99999999.99 OR v_booking.shop_hours <> pg_catalog.trunc(v_booking.shop_hours, 2)
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.ineligible_booking'; END IF;
  IF v_current_date <= v_today AND p_wholly_unstarted_acknowledged IS DISTINCT FROM true
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.acknowledgement_required'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.dg_daily_capacity AS capacity WHERE capacity.production_date = p_destination_production_date AND capacity.is_closed IS TRUE) INTO v_destination_was_closed;
  IF v_destination_was_closed AND p_closed_date_override_acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.closed_date_override_required'; END IF;
  IF NOT v_destination_was_closed AND p_closed_date_override_acknowledged IS DISTINCT FROM false THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_request'; END IF;

  SELECT COALESCE(pg_catalog.max(booking.day_order), 0) + 1024 INTO v_destination_order
  FROM public.dg_production_bookings AS booking
  WHERE public.parse_production_booking_date(booking.production_date) = p_destination_production_date;
  UPDATE public.dg_production_bookings AS booking
  SET production_date = pg_catalog.to_char(p_destination_production_date, 'YYYY-MM-DD'), day_order = v_destination_order, updated_at = v_moved_at
  WHERE booking.booking_id = p_booking_id;
  INSERT INTO public.dg_production_booking_moves (move_id, command_id, booking_id, from_production_date, to_production_date, shop_hours_snapshot, actor_user_id, actor_display_name_snapshot, moved_at, original_updated_at_snapshot, wholly_unstarted_acknowledged, source_system, created_at, action_type, reason, destination_was_closed, closed_date_override_acknowledged)
  VALUES (v_move_id, p_command_id, p_booking_id, v_current_date, p_destination_production_date, v_booking.shop_hours::numeric(10,2), v_actor, pg_catalog.btrim(v_profile.display_name), v_moved_at, v_booking.updated_at, p_wholly_unstarted_acknowledged, 'doorgo_native', v_moved_at, v_action_type, v_reason, v_destination_was_closed, p_closed_date_override_acknowledged);
  RETURN QUERY SELECT v_move_id, p_booking_id, v_current_date, p_destination_production_date, v_booking.shop_hours::numeric(10,2), v_moved_at, v_action_type, v_destination_was_closed, 'moved'::text;
END;
$$;
ALTER FUNCTION public.calendar_reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) TO authenticated;

-- Based on 20260821000000_add_production_day_order.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.calendar_reorder_production_day(
  p_production_date date,
  p_expected_booking_ids text[],
  p_ordered_booking_ids text[]
)
RETURNS TABLE (booking_id text, day_order bigint, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_current_ids text[];
  v_distinct_count bigint;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_day_order.authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor AND profile.active = true
  ) THEN RAISE EXCEPTION USING MESSAGE = 'production_day_order.active_profile_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions AS permission
    WHERE permission.user_id = v_actor
      AND permission.permission_key = 'calendar'
      AND permission.access_level = 'use'
  ) THEN RAISE EXCEPTION USING MESSAGE = 'production_day_order.permission_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions AS permission
    WHERE permission.user_id = v_actor
      AND permission.permission_key = 'calendar'
      AND permission.access_level = 'use'
  ) THEN RAISE EXCEPTION USING MESSAGE = 'production_day_order.permission_required'; END IF;
  IF p_production_date IS NULL OR p_expected_booking_ids IS NULL OR p_ordered_booking_ids IS NULL
  THEN RAISE EXCEPTION USING MESSAGE = 'production_day_order.invalid_request'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dg_production_day_order:' || p_production_date::text, 0)
  );
  PERFORM 1 FROM public.dg_production_bookings AS booking
  WHERE public.parse_production_booking_date(booking.production_date) = p_production_date
    AND booking.booking_kind = 'production'
    AND booking.deleted_at IS NULL AND booking.cancelled_at IS NULL
    AND booking.status = 'active' AND booking.schedule_status = 'confirmed'
    AND booking.board_visible IS DISTINCT FROM false
  FOR UPDATE;

  SELECT COALESCE(pg_catalog.array_agg(booking.booking_id ORDER BY booking.day_order, booking.title ASC NULLS LAST, booking.booking_id), ARRAY[]::text[])
    INTO v_current_ids
  FROM public.dg_production_bookings AS booking
  WHERE public.parse_production_booking_date(booking.production_date) = p_production_date
    AND booking.booking_kind = 'production'
    AND booking.deleted_at IS NULL AND booking.cancelled_at IS NULL
    AND booking.status = 'active' AND booking.schedule_status = 'confirmed'
    AND booking.board_visible IS DISTINCT FROM false;

  IF v_current_ids IS DISTINCT FROM p_expected_booking_ids
  THEN RAISE EXCEPTION USING MESSAGE = 'production_day_order.stale_day'; END IF;
  SELECT pg_catalog.count(DISTINCT item) INTO v_distinct_count
  FROM pg_catalog.unnest(p_ordered_booking_ids) AS requested(item);
  IF pg_catalog.cardinality(p_ordered_booking_ids) <> pg_catalog.cardinality(v_current_ids)
    OR v_distinct_count <> pg_catalog.cardinality(v_current_ids)
    OR NOT (p_ordered_booking_ids @> v_current_ids AND v_current_ids @> p_ordered_booking_ids)
  THEN RAISE EXCEPTION USING MESSAGE = 'production_day_order.invalid_order'; END IF;

  UPDATE public.dg_production_bookings AS booking
  SET day_order = requested.ordinality * 1024,
      updated_at = v_changed_at
  FROM pg_catalog.unnest(p_ordered_booking_ids) WITH ORDINALITY AS requested(booking_id, ordinality)
  WHERE booking.booking_id = requested.booking_id;

  RETURN QUERY
  SELECT booking.booking_id, booking.day_order, booking.updated_at
  FROM public.dg_production_bookings AS booking
  WHERE public.parse_production_booking_date(booking.production_date) = p_production_date
    AND booking.booking_kind = 'production'
    AND booking.deleted_at IS NULL AND booking.cancelled_at IS NULL
    AND booking.status = 'active' AND booking.schedule_status = 'confirmed'
    AND booking.board_visible IS DISTINCT FROM false
  ORDER BY booking.day_order, booking.title ASC NULLS LAST, booking.booking_id;
END;
$$;
ALTER FUNCTION public.calendar_reorder_production_day(date, text[], text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_reorder_production_day(date, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_reorder_production_day(date, text[], text[]) TO authenticated;

-- Based on 20260821010000_add_production_needs_attention.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.calendar_reorder_production_needs_attention(
  p_expected_booking_ids text[], p_ordered_booking_ids text[]
) RETURNS TABLE (booking_id text, day_order bigint, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=auth.uid(); v_current_ids text[]; v_distinct_count bigint; v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='production_needs_attention.authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true)
  THEN RAISE EXCEPTION USING MESSAGE='production_needs_attention.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key = 'calendar' AND p.access_level='use')
    OR NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE='production_needs_attention.permission_required'; END IF;
  IF p_expected_booking_ids IS NULL OR p_ordered_booking_ids IS NULL THEN RAISE EXCEPTION USING MESSAGE='production_needs_attention.invalid_request'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_needs_attention_order',0));
  PERFORM 1 FROM public.dg_production_bookings b WHERE b.production_date IS NULL AND b.booking_kind='production'
    AND b.deleted_at IS NULL AND b.cancelled_at IS NULL AND b.status='active' AND b.schedule_status='confirmed'
    AND b.board_visible IS DISTINCT FROM false FOR UPDATE;
  SELECT COALESCE(pg_catalog.array_agg(b.booking_id ORDER BY b.day_order,b.title ASC NULLS LAST,b.booking_id),ARRAY[]::text[])
  INTO v_current_ids FROM public.dg_production_bookings b WHERE b.production_date IS NULL AND b.booking_kind='production'
    AND b.deleted_at IS NULL AND b.cancelled_at IS NULL AND b.status='active' AND b.schedule_status='confirmed' AND b.board_visible IS DISTINCT FROM false;
  IF v_current_ids IS DISTINCT FROM p_expected_booking_ids THEN RAISE EXCEPTION USING MESSAGE='production_needs_attention.stale_order'; END IF;
  SELECT pg_catalog.count(DISTINCT item) INTO v_distinct_count FROM pg_catalog.unnest(p_ordered_booking_ids) item;
  IF pg_catalog.cardinality(p_ordered_booking_ids)<>pg_catalog.cardinality(v_current_ids) OR v_distinct_count<>pg_catalog.cardinality(v_current_ids)
    OR NOT (p_ordered_booking_ids @> v_current_ids AND v_current_ids @> p_ordered_booking_ids)
  THEN RAISE EXCEPTION USING MESSAGE='production_needs_attention.invalid_order'; END IF;
  UPDATE public.dg_production_bookings b SET day_order=requested.ordinality*1024,updated_at=v_now
  FROM pg_catalog.unnest(p_ordered_booking_ids) WITH ORDINALITY requested(booking_id,ordinality) WHERE b.booking_id=requested.booking_id;
  RETURN QUERY SELECT b.booking_id,b.day_order,b.updated_at FROM public.dg_production_bookings b
    WHERE b.production_date IS NULL AND b.booking_id=ANY(p_ordered_booking_ids) ORDER BY b.day_order;
END; $$;
ALTER FUNCTION public.calendar_reorder_production_needs_attention(text[],text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_reorder_production_needs_attention(text[],text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_reorder_production_needs_attention(text[],text[]) TO authenticated;

-- Based on 20260902010000_fix_calendar_production_native_link_inference.sql; Calendar authorization changes only.
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
  v_actor:=public.dg_calendar_require_use(false);
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
  IF p_item_type='production' AND p_linked_internal_job_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.dg_production_bookings b
    WHERE b.linked_internal_job_id=p_linked_internal_job_id
      AND b.booking_kind='production' AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
      AND b.completed_at IS NULL AND b.status='active' AND b.schedule_status='confirmed'
      AND b.board_visible IS DISTINCT FROM false
  ) THEN RAISE EXCEPTION USING MESSAGE='calendar_item.production_already_scheduled'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_calendar_order:'||COALESCE(p_scheduled_date::text,'needs_attention'),0));
  SELECT COALESCE(pg_catalog.max(x.day_order),0)+1024 INTO v_order FROM (
    SELECT b.day_order FROM public.dg_production_bookings b WHERE public.parse_production_booking_date(b.production_date) IS NOT DISTINCT FROM p_scheduled_date AND b.deleted_at IS NULL AND b.cancelled_at IS NULL
    UNION ALL SELECT i.day_order FROM public.dg_calendar_items i WHERE i.scheduled_date IS NOT DISTINCT FROM p_scheduled_date AND i.deleted_at IS NULL
  ) x;
  IF p_item_type='production' THEN
    v_booking_id:='manual-'||v_id::text;
    INSERT INTO public.dg_production_bookings(booking_id,job_id,title,production_date,shop_hours,salesperson,status,source,created_at,updated_at,raw_booking,
      schedule_status,booking_kind,board_visible,all_day,calendar_sync_state,locked,created_by,updated_by,source_system,day_order,linked_internal_job_id)
    VALUES(v_booking_id,CASE WHEN p_linked_internal_job_id IS NULL THEN v_sales_order ELSE v_job.visible_identifier END,v_customer,
      CASE WHEN p_scheduled_date IS NULL THEN NULL ELSE p_scheduled_date::text END,CASE WHEN p_linked_internal_job_id IS NULL THEN p_shop_hours ELSE v_job.shop_hours END,v_salesperson,'active','DoorGo Calendar',v_now,v_now,'{}'::jsonb,
      'confirmed','production',true,true,'native',false,v_actor::text,v_actor::text,'doorgo_native',v_order,p_linked_internal_job_id);
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
END;$$;

-- Based on 20260821030000_add_operational_calendar_items.sql; Calendar authorization changes only.
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
      UPDATE public.dg_production_bookings SET day_order=v_pos*1024,updated_at=v_now,updated_by=v_actor::text WHERE booking_id=pg_catalog.substr(v_key,12);
    ELSIF v_key LIKE 'item:%' THEN
      UPDATE public.dg_calendar_items SET day_order=v_pos*1024,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=pg_catalog.substr(v_key,6)::uuid;
    ELSE RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_order'; END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('ordered_keys',p_ordered_keys,'updated_at',v_now);
END; $$;

-- Based on 20260825000000_unified_active_calendar_item_delete.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.delete_calendar_production_booking(p_command_id uuid,p_booking_id text,p_expected_production_date date,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_profile public.dg_user_profiles%ROWTYPE;v_booking public.dg_production_bookings%ROWTYPE;v_existing public.dg_production_booking_delete_events%ROWTYPE;v_date date;v_now timestamptz:=pg_catalog.clock_timestamp();
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

-- Based on 20260902000000_complete_first_class_calendar_notes.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.convert_calendar_note(
  p_command_id uuid,p_item_id uuid,p_expected_revision bigint,p_destination text,p_scheduled_date date,
  p_linked_internal_job_id uuid,p_name text,p_sales_order text,p_salesperson text,p_shop_hours numeric,p_timing text,
  p_staff_id uuid,p_end_date date,p_away_mode text,p_partial_drag_hours numeric,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=public.dg_calendar_require_use(false);v_note public.dg_calendar_items%ROWTYPE;v_result jsonb;v_now timestamptz:=pg_catalog.clock_timestamp();v_note_command uuid:=extensions.gen_random_uuid();
BEGIN
  IF p_command_id IS NULL OR p_item_id IS NULL OR p_expected_revision IS NULL OR p_destination NOT IN('production','delivery','customer_pickup','staff_away') THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
  IF EXISTS(SELECT 1 FROM public.dg_calendar_item_events WHERE command_id=p_command_id) THEN RETURN pg_catalog.jsonb_build_object('converted',true);END IF;
  SELECT * INTO v_note FROM public.dg_calendar_items WHERE item_id=p_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_note.item_type<>'note' THEN RAISE EXCEPTION USING MESSAGE='calendar_item.not_found';END IF;
  IF v_note.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='calendar_item.stale_item';END IF;
  IF v_note.completed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.completed_item';END IF;
  IF p_destination='staff_away' THEN
    IF p_scheduled_date IS NULL THEN RAISE EXCEPTION USING MESSAGE='calendar_item.invalid_request';END IF;
    v_result:=public.save_staff_away_period(v_note_command,NULL,NULL,p_staff_id,p_scheduled_date,COALESCE(p_end_date,p_scheduled_date),p_away_mode,p_partial_drag_hours,COALESCE(NULLIF(pg_catalog.btrim(p_reason),''),v_note.details,v_note.title));
  ELSIF p_linked_internal_job_id IS NOT NULL AND p_destination IN('delivery','customer_pickup') THEN
    v_result:=public.schedule_linked_fulfillment(v_note_command,p_linked_internal_job_id,p_destination,p_scheduled_date,p_timing,COALESCE(v_note.details,v_note.title));
  ELSE
    v_result:=public.create_calendar_item(v_note_command,p_destination,p_scheduled_date,p_linked_internal_job_id,COALESCE(NULLIF(pg_catalog.btrim(p_name),''),v_note.title),p_sales_order,p_salesperson,p_shop_hours,p_timing,COALESCE(v_note.details,v_note.title),v_note.title,v_note.details);
  END IF;
  UPDATE public.dg_calendar_items SET deleted_at=v_now,deleted_by_user_id=v_actor,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE item_id=p_item_id;
  INSERT INTO public.dg_calendar_item_events(command_id,item_id,action_type,from_scheduled_date,from_day_order,actor_user_id,occurred_at,detail)
    VALUES(p_command_id,p_item_id,'convert',v_note.scheduled_date,v_note.day_order,v_actor,v_now,pg_catalog.jsonb_build_object('destination',p_destination,'result',v_result));
  RETURN v_result||pg_catalog.jsonb_build_object('converted_from',p_item_id,'destination',p_destination);
END;$$;

-- Based on 20260825040000_add_staff_away_operations.sql; Calendar authorization changes only.
CREATE OR REPLACE FUNCTION public.dg_staff_away_scope(p_require_use boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.authentication_required';END IF;
  SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''),'default') INTO v_location
  FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true;
  IF v_location IS NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.active_profile_required';END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.dg_user_permissions p
    WHERE p.user_id=v_actor AND ((p_require_use AND p.permission_key='calendar' AND p.access_level='use')
        OR (NOT p_require_use AND p.permission_key IN ('calendar','production') AND p.access_level IN ('view','use')))
  ) THEN RAISE EXCEPTION USING MESSAGE='staff_away.permission_required';END IF;
  RETURN v_location;
END $$;

COMMIT;
