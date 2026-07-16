-- Phase 2F-F1: controlled production-booking completion and reopen contract.

BEGIN;

CREATE TABLE public.dg_production_booking_completion_events (
  event_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  command_id uuid NOT NULL,
  booking_id text NOT NULL,
  production_date date NOT NULL,
  action_type text NOT NULL,
  actor_user_id uuid NULL,
  actor_display_name_snapshot text NOT NULL,
  occurred_at timestamptz NOT NULL,
  previous_completed_at timestamptz NULL,
  resulting_completed_at timestamptz NULL,
  reopen_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT dg_production_booking_completion_events_command_unique
    UNIQUE (command_id),
  CONSTRAINT dg_production_booking_completion_events_booking_fk
    FOREIGN KEY (booking_id)
    REFERENCES public.dg_production_bookings(booking_id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_booking_completion_events_actor_fk
    FOREIGN KEY (actor_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,
  CONSTRAINT dg_production_booking_completion_events_action_allowed
    CHECK (action_type IN ('completed', 'reopened')),
  CONSTRAINT dg_production_booking_completion_events_actor_name_valid
    CHECK (
      actor_display_name_snapshot = pg_catalog.btrim(actor_display_name_snapshot)
      AND pg_catalog.length(actor_display_name_snapshot) BETWEEN 1 AND 500
    ),
  CONSTRAINT dg_production_booking_completion_events_reason_valid
    CHECK (
      reopen_reason IS NULL
      OR (
        reopen_reason = pg_catalog.btrim(reopen_reason)
        AND pg_catalog.length(reopen_reason) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT dg_production_booking_completion_events_transition_valid
    CHECK (
      (
        action_type = 'completed'
        AND previous_completed_at IS NULL
        AND resulting_completed_at IS NOT NULL
        AND reopen_reason IS NULL
      )
      OR (
        action_type = 'reopened'
        AND previous_completed_at IS NOT NULL
        AND resulting_completed_at IS NULL
        AND reopen_reason IS NOT NULL
      )
    )
);

ALTER TABLE public.dg_production_booking_completion_events
  OWNER TO postgres;

CREATE INDEX dg_production_booking_completion_events_booking_occurred_idx
  ON public.dg_production_booking_completion_events (
    booking_id,
    occurred_at DESC
  );

CREATE INDEX dg_production_booking_completion_events_production_date_idx
  ON public.dg_production_booking_completion_events (
    production_date DESC,
    occurred_at DESC
  );

CREATE OR REPLACE FUNCTION public.reject_production_booking_completion_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.actor_user_id IS NOT NULL
    AND NEW.actor_user_id IS NULL
    AND ROW(
      NEW.event_id,
      NEW.command_id,
      NEW.booking_id,
      NEW.production_date,
      NEW.action_type,
      NEW.actor_display_name_snapshot,
      NEW.occurred_at,
      NEW.previous_completed_at,
      NEW.resulting_completed_at,
      NEW.reopen_reason,
      NEW.created_at
    ) IS NOT DISTINCT FROM ROW(
      OLD.event_id,
      OLD.command_id,
      OLD.booking_id,
      OLD.production_date,
      OLD.action_type,
      OLD.actor_display_name_snapshot,
      OLD.occurred_at,
      OLD.previous_completed_at,
      OLD.resulting_completed_at,
      OLD.reopen_reason,
      OLD.created_at
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Production booking completion history is immutable';
END;
$$;

ALTER FUNCTION public.reject_production_booking_completion_event_mutation()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.reject_production_booking_completion_event_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dg_production_booking_completion_events_immutable
BEFORE UPDATE OR DELETE ON public.dg_production_booking_completion_events
FOR EACH ROW
EXECUTE FUNCTION public.reject_production_booking_completion_event_mutation();

CREATE OR REPLACE FUNCTION public.complete_production_booking(
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
        AND permission.permission_key = 'production'
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

ALTER FUNCTION public.complete_production_booking(uuid, text, date)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.reopen_production_booking(
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
        AND permission.permission_key = 'production'
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

ALTER FUNCTION public.reopen_production_booking(uuid, text, date, timestamptz, text)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.complete_production_booking(uuid, text, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_production_booking(uuid, text, date)
  TO authenticated;

REVOKE ALL ON FUNCTION public.reopen_production_booking(uuid, text, date, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_production_booking(uuid, text, date, timestamptz, text)
  TO authenticated;

ALTER TABLE public.dg_production_booking_completion_events
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dg_production_booking_completion_events
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_production_bookings
  FROM anon, authenticated;

COMMIT;
