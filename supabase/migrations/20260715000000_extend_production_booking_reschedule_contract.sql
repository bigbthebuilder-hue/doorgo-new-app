-- Phase 2F-E2B: general production-booking reschedule contract.

BEGIN;

ALTER TABLE public.dg_production_booking_moves
  ADD COLUMN action_type text NULL DEFAULT 'recovery_to_today',
  ADD COLUMN reason text NULL,
  ADD COLUMN destination_was_closed boolean NULL DEFAULT false,
  ADD COLUMN closed_date_override_acknowledged boolean NULL DEFAULT false;

ALTER TABLE public.dg_production_booking_moves
  ALTER COLUMN action_type SET NOT NULL,
  ALTER COLUMN destination_was_closed SET NOT NULL,
  ALTER COLUMN closed_date_override_acknowledged SET NOT NULL,
  DROP CONSTRAINT dg_production_booking_moves_acknowledged,
  ADD CONSTRAINT dg_production_booking_moves_action_type_allowed
    CHECK (action_type IN ('recovery_to_today', 'reschedule', 'backdate')),
  ADD CONSTRAINT dg_production_booking_moves_reason_valid
    CHECK (
      reason IS NULL
      OR (
        reason = pg_catalog.btrim(reason)
        AND pg_catalog.length(reason) BETWEEN 1 AND 500
      )
    ),
  ADD CONSTRAINT dg_production_booking_moves_backdate_reason
    CHECK ((action_type = 'backdate') = (reason IS NOT NULL)),
  ADD CONSTRAINT dg_production_booking_moves_closed_ack_matches
    CHECK (destination_was_closed = closed_date_override_acknowledged),
  ADD CONSTRAINT dg_production_booking_moves_recovery_acknowledged
    CHECK (
      action_type <> 'recovery_to_today'
      OR wholly_unstarted_acknowledged = true
    );

ALTER TABLE public.dg_production_booking_moves
  ALTER COLUMN action_type DROP DEFAULT,
  ALTER COLUMN destination_was_closed DROP DEFAULT,
  ALTER COLUMN closed_date_override_acknowledged DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.reject_production_booking_move_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.actor_user_id IS NOT NULL
    AND NEW.actor_user_id IS NULL
    AND ROW(
      NEW.move_id,
      NEW.command_id,
      NEW.booking_id,
      NEW.from_production_date,
      NEW.to_production_date,
      NEW.shop_hours_snapshot,
      NEW.actor_display_name_snapshot,
      NEW.moved_at,
      NEW.original_updated_at_snapshot,
      NEW.wholly_unstarted_acknowledged,
      NEW.source_system,
      NEW.created_at,
      NEW.action_type,
      NEW.reason,
      NEW.destination_was_closed,
      NEW.closed_date_override_acknowledged
    ) IS NOT DISTINCT FROM ROW(
      OLD.move_id,
      OLD.command_id,
      OLD.booking_id,
      OLD.from_production_date,
      OLD.to_production_date,
      OLD.shop_hours_snapshot,
      OLD.actor_display_name_snapshot,
      OLD.moved_at,
      OLD.original_updated_at_snapshot,
      OLD.wholly_unstarted_acknowledged,
      OLD.source_system,
      OLD.created_at,
      OLD.action_type,
      OLD.reason,
      OLD.destination_was_closed,
      OLD.closed_date_override_acknowledged
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Production booking move history is immutable';
END;
$$;

ALTER FUNCTION public.reject_production_booking_move_mutation()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.reject_production_booking_move_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.move_production_booking_to_today(
  p_command_id uuid,
  p_booking_id text,
  p_expected_production_date date,
  p_wholly_unstarted_acknowledged boolean
)
RETURNS TABLE (
  move_id uuid,
  booking_id text,
  previous_production_date date,
  new_production_date date,
  shop_hours numeric(10,2),
  moved_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.dg_user_profiles%ROWTYPE;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
  v_existing public.dg_production_booking_moves%ROWTYPE;
  v_booking public.dg_production_bookings%ROWTYPE;
  v_current_date date;
  v_destination_was_closed boolean;
  v_move_id uuid := extensions.gen_random_uuid();
  v_moved_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.authentication_required'; END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles AS profile WHERE profile.user_id = v_actor;
  IF NOT FOUND OR NOT v_profile.active OR v_profile.display_name IS NULL
    OR pg_catalog.length(pg_catalog.btrim(v_profile.display_name)) = 0
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.active_profile_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions AS permission
    WHERE permission.user_id = v_actor
      AND permission.permission_key = 'production'
      AND permission.access_level = 'use'
  ) THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.permission_required'; END IF;
  IF p_command_id IS NULL OR p_booking_id IS NULL OR p_expected_production_date IS NULL
    OR p_wholly_unstarted_acknowledged IS NULL
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.invalid_request'; END IF;
  IF pg_catalog.length(pg_catalog.btrim(p_booking_id)) = 0 OR pg_catalog.length(p_booking_id) > 500
    OR p_booking_id IS DISTINCT FROM pg_catalog.btrim(p_booking_id)
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.invalid_booking_id'; END IF;
  IF p_wholly_unstarted_acknowledged IS DISTINCT FROM true
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.acknowledgement_required'; END IF;
  IF p_expected_production_date >= v_today
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.not_past_date'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_command:' || p_command_id::text, 0));
  SELECT * INTO v_existing FROM public.dg_production_booking_moves AS move WHERE move.command_id = p_command_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor
      OR v_existing.booking_id IS DISTINCT FROM p_booking_id
      OR v_existing.from_production_date IS DISTINCT FROM p_expected_production_date
      OR v_existing.wholly_unstarted_acknowledged IS DISTINCT FROM true
      OR v_existing.action_type IS DISTINCT FROM 'recovery_to_today'
      OR v_existing.reason IS NOT NULL
      OR v_existing.destination_was_closed IS DISTINCT FROM false
      OR v_existing.closed_date_override_acknowledged IS DISTINCT FROM false
    THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.command_uuid_collision'; END IF;
    RETURN QUERY SELECT v_existing.move_id, v_existing.booking_id, v_existing.from_production_date,
      v_existing.to_production_date, v_existing.shop_hours_snapshot, v_existing.moved_at, 'moved'::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_booking:' || p_booking_id, 0));
  SELECT EXISTS (
    SELECT 1 FROM public.dg_daily_capacity AS capacity
    WHERE capacity.production_date = v_today AND capacity.is_closed IS TRUE
  ) INTO v_destination_was_closed;
  IF v_destination_was_closed
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.closed_date_override_required'; END IF;

  SELECT * INTO v_booking FROM public.dg_production_bookings AS booking
  WHERE booking.booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.not_found'; END IF;
  v_current_date := public.parse_production_booking_date(v_booking.production_date);
  IF v_current_date IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.ineligible_booking'; END IF;
  IF v_current_date = v_today THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.already_moved'; END IF;
  IF v_current_date IS DISTINCT FROM p_expected_production_date
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.stale_booking'; END IF;
  IF v_current_date > v_today OR v_booking.booking_kind IS DISTINCT FROM 'production'
    OR v_booking.deleted_at IS NOT NULL OR v_booking.cancelled_at IS NOT NULL
    OR v_booking.status IS DISTINCT FROM 'active' OR v_booking.schedule_status IS DISTINCT FROM 'confirmed'
    OR v_booking.board_visible IS NOT DISTINCT FROM false OR v_booking.locked IS NOT DISTINCT FROM true
    OR pg_catalog.length(pg_catalog.btrim(v_booking.booking_id)) = 0 OR v_booking.shop_hours IS NULL
    OR v_booking.shop_hours < 0 OR v_booking.shop_hours > 99999999.99
    OR v_booking.shop_hours <> pg_catalog.trunc(v_booking.shop_hours, 2) OR v_booking.completed_at IS NOT NULL
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_move.ineligible_booking'; END IF;

  UPDATE public.dg_production_bookings AS booking
  SET production_date = pg_catalog.to_char(v_today, 'YYYY-MM-DD'), updated_at = v_moved_at
  WHERE booking.booking_id = p_booking_id;
  INSERT INTO public.dg_production_booking_moves (
    move_id, command_id, booking_id, from_production_date, to_production_date,
    shop_hours_snapshot, actor_user_id, actor_display_name_snapshot, moved_at,
    original_updated_at_snapshot, wholly_unstarted_acknowledged, source_system, created_at,
    action_type, reason, destination_was_closed, closed_date_override_acknowledged
  ) VALUES (
    v_move_id, p_command_id, p_booking_id, v_current_date, v_today,
    v_booking.shop_hours::numeric(10,2), v_actor, pg_catalog.btrim(v_profile.display_name), v_moved_at,
    v_booking.updated_at, true, 'doorgo_native', v_moved_at,
    'recovery_to_today', NULL, false, false
  );
  RETURN QUERY SELECT v_move_id, p_booking_id, v_current_date, v_today,
    v_booking.shop_hours::numeric(10,2), v_moved_at, 'moved'::text;
END;
$$;

ALTER FUNCTION public.move_production_booking_to_today(uuid, text, date, boolean)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.reschedule_production_booking(
  p_command_id uuid,
  p_booking_id text,
  p_expected_production_date date,
  p_destination_production_date date,
  p_wholly_unstarted_acknowledged boolean,
  p_backdate_reason text,
  p_closed_date_override_acknowledged boolean
)
RETURNS TABLE (
  move_id uuid,
  booking_id text,
  previous_production_date date,
  new_production_date date,
  shop_hours numeric(10,2),
  moved_at timestamptz,
  action_type text,
  destination_was_closed boolean,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  v_move_id uuid := extensions.gen_random_uuid();
  v_moved_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.authentication_required'; END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles AS profile WHERE profile.user_id = v_actor;
  IF NOT FOUND OR NOT v_profile.active OR v_profile.display_name IS NULL
    OR pg_catalog.length(pg_catalog.btrim(v_profile.display_name)) = 0
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.active_profile_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions AS permission
    WHERE permission.user_id = v_actor
      AND permission.permission_key = 'production'
      AND permission.access_level = 'use'
  ) THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.permission_required'; END IF;
  IF p_command_id IS NULL OR p_booking_id IS NULL OR p_expected_production_date IS NULL
    OR p_destination_production_date IS NULL OR p_wholly_unstarted_acknowledged IS NULL
    OR p_closed_date_override_acknowledged IS NULL
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_request'; END IF;
  IF pg_catalog.length(pg_catalog.btrim(p_booking_id)) = 0 OR pg_catalog.length(p_booking_id) > 500
    OR p_booking_id IS DISTINCT FROM pg_catalog.btrim(p_booking_id)
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_booking_id'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_command:' || p_command_id::text, 0));
  SELECT * INTO v_existing FROM public.dg_production_booking_moves AS move WHERE move.command_id = p_command_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor
      OR v_existing.booking_id IS DISTINCT FROM p_booking_id
      OR v_existing.from_production_date IS DISTINCT FROM p_expected_production_date
      OR v_existing.to_production_date IS DISTINCT FROM p_destination_production_date
      OR v_existing.wholly_unstarted_acknowledged IS DISTINCT FROM p_wholly_unstarted_acknowledged
      OR v_existing.reason IS DISTINCT FROM v_reason
      OR v_existing.action_type NOT IN ('reschedule', 'backdate')
      OR v_existing.closed_date_override_acknowledged IS DISTINCT FROM p_closed_date_override_acknowledged
    THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.command_uuid_collision'; END IF;
    RETURN QUERY SELECT v_existing.move_id, v_existing.booking_id, v_existing.from_production_date,
      v_existing.to_production_date, v_existing.shop_hours_snapshot, v_existing.moved_at,
      v_existing.action_type, v_existing.destination_was_closed, 'moved'::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_booking:' || p_booking_id, 0));
  SELECT * INTO v_booking FROM public.dg_production_bookings AS booking
  WHERE booking.booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.not_found'; END IF;
  v_today := (pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
  v_current_date := public.parse_production_booking_date(v_booking.production_date);
  IF v_current_date IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.ineligible_booking'; END IF;
  IF v_current_date IS DISTINCT FROM p_expected_production_date
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.stale_booking'; END IF;
  IF v_current_date = p_destination_production_date
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.no_change'; END IF;
  IF p_destination_production_date < v_today THEN
    v_action_type := 'backdate';
  ELSE
    v_action_type := 'reschedule';
  END IF;
  IF v_action_type = 'backdate' THEN
    IF v_reason IS NULL
    THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.backdate_reason_required'; END IF;
    IF pg_catalog.length(v_reason) > 500
    THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_backdate_reason'; END IF;
  ELSE
    IF v_reason IS NOT NULL
    THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_backdate_reason'; END IF;
    v_reason := NULL;
  END IF;
  IF v_booking.booking_kind IS DISTINCT FROM 'production' OR v_booking.deleted_at IS NOT NULL
    OR v_booking.cancelled_at IS NOT NULL OR v_booking.status IS DISTINCT FROM 'active'
    OR v_booking.schedule_status IS DISTINCT FROM 'confirmed' OR v_booking.board_visible IS NOT DISTINCT FROM false
    OR v_booking.locked IS NOT DISTINCT FROM true OR v_booking.completed_at IS NOT NULL
    OR pg_catalog.length(pg_catalog.btrim(v_booking.booking_id)) = 0 OR v_booking.shop_hours IS NULL
    OR v_booking.shop_hours < 0 OR v_booking.shop_hours > 99999999.99
    OR v_booking.shop_hours <> pg_catalog.trunc(v_booking.shop_hours, 2)
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.ineligible_booking'; END IF;
  IF v_current_date <= v_today AND p_wholly_unstarted_acknowledged IS DISTINCT FROM true
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.acknowledgement_required'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.dg_daily_capacity AS capacity
    WHERE capacity.production_date = p_destination_production_date AND capacity.is_closed IS TRUE
  ) INTO v_destination_was_closed;
  IF v_destination_was_closed AND p_closed_date_override_acknowledged IS DISTINCT FROM true
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.closed_date_override_required'; END IF;
  IF NOT v_destination_was_closed AND p_closed_date_override_acknowledged IS DISTINCT FROM false
  THEN RAISE EXCEPTION USING MESSAGE = 'production_booking_reschedule.invalid_request'; END IF;

  UPDATE public.dg_production_bookings AS booking
  SET production_date = pg_catalog.to_char(p_destination_production_date, 'YYYY-MM-DD'), updated_at = v_moved_at
  WHERE booking.booking_id = p_booking_id;
  INSERT INTO public.dg_production_booking_moves (
    move_id, command_id, booking_id, from_production_date, to_production_date,
    shop_hours_snapshot, actor_user_id, actor_display_name_snapshot, moved_at,
    original_updated_at_snapshot, wholly_unstarted_acknowledged, source_system, created_at,
    action_type, reason, destination_was_closed, closed_date_override_acknowledged
  ) VALUES (
    v_move_id, p_command_id, p_booking_id, v_current_date, p_destination_production_date,
    v_booking.shop_hours::numeric(10,2), v_actor, pg_catalog.btrim(v_profile.display_name), v_moved_at,
    v_booking.updated_at, p_wholly_unstarted_acknowledged, 'doorgo_native', v_moved_at,
    v_action_type, v_reason, v_destination_was_closed, p_closed_date_override_acknowledged
  );
  RETURN QUERY SELECT v_move_id, p_booking_id, v_current_date, p_destination_production_date,
    v_booking.shop_hours::numeric(10,2), v_moved_at, v_action_type,
    v_destination_was_closed, 'moved'::text;
END;
$$;

ALTER FUNCTION public.reschedule_production_booking(uuid, text, date, date, boolean, text, boolean)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.move_production_booking_to_today(uuid, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_production_booking_to_today(uuid, text, date, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_production_booking(uuid, text, date, date, boolean, text, boolean) TO authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.dg_production_booking_moves FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dg_production_bookings FROM anon, authenticated;

COMMIT;
