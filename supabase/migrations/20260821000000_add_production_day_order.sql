-- Permanent Calendar: shared Production ordering and atomic destination-bottom moves.
BEGIN;

ALTER TABLE public.dg_production_bookings
  ADD COLUMN day_order bigint;

WITH ranked AS (
  SELECT booking_id,
    pg_catalog.row_number() OVER (
      PARTITION BY production_date
      ORDER BY title ASC NULLS LAST, booking_id ASC
    ) * 1024 AS initialized_order
  FROM public.dg_production_bookings
)
UPDATE public.dg_production_bookings AS booking
SET day_order = ranked.initialized_order
FROM ranked
WHERE ranked.booking_id = booking.booking_id;

ALTER TABLE public.dg_production_bookings
  ALTER COLUMN day_order SET NOT NULL;

CREATE INDEX dg_production_bookings_day_order_idx
  ON public.dg_production_bookings (production_date, day_order, booking_id);

CREATE OR REPLACE FUNCTION public.assign_production_booking_day_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_date date;
BEGIN
  v_date := public.parse_production_booking_date(NEW.production_date);
  IF v_date IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT'
    OR NEW.day_order IS NULL
    OR (
      NEW.production_date IS DISTINCT FROM OLD.production_date
      AND NEW.day_order IS NOT DISTINCT FROM OLD.day_order
    )
  THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('dg_production_day_order:' || v_date::text, 0)
    );
    SELECT COALESCE(pg_catalog.max(booking.day_order), 0) + 1024
      INTO NEW.day_order
    FROM public.dg_production_bookings AS booking
    WHERE public.parse_production_booking_date(booking.production_date) = v_date
      AND booking.booking_id IS DISTINCT FROM NEW.booking_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.assign_production_booking_day_order() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_production_booking_day_order() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dg_production_bookings_assign_day_order
BEFORE INSERT OR UPDATE OF production_date, day_order
ON public.dg_production_bookings
FOR EACH ROW EXECUTE FUNCTION public.assign_production_booking_day_order();

CREATE OR REPLACE FUNCTION public.reorder_production_day(
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
      AND permission.permission_key = 'production'
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

ALTER FUNCTION public.reorder_production_day(date, text[], text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_production_day(date, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_production_day(date, text[], text[]) TO authenticated;

-- Preserve the accepted reschedule signature while assigning destination order atomically.
CREATE OR REPLACE FUNCTION public.reschedule_production_booking(
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
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS permission WHERE permission.user_id = v_actor AND permission.permission_key = 'production' AND permission.access_level = 'use')
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

ALTER FUNCTION public.reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dg_production_bookings FROM anon, authenticated;

COMMIT;
