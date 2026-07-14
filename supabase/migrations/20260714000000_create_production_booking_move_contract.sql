-- Phase 2F-D2: Supabase-native whole-production-booking recovery moves.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.dg_production_bookings AS booking
    WHERE booking.booking_kind IS NULL
      OR booking.booking_kind NOT IN ('production', 'placeholder')
  ) THEN
    RAISE EXCEPTION 'production_booking_move.invalid_booking_kind_vocabulary';
  END IF;
END;
$$;

ALTER TABLE public.dg_production_bookings
  ALTER COLUMN booking_kind SET NOT NULL;

ALTER TABLE public.dg_production_bookings
  ADD CONSTRAINT dg_production_bookings_booking_kind_allowed
  CHECK (booking_kind IN ('production', 'placeholder'));

CREATE TABLE public.dg_production_booking_moves (
  move_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  command_id uuid NOT NULL,
  booking_id text NOT NULL,
  from_production_date date NOT NULL,
  to_production_date date NOT NULL,
  shop_hours_snapshot numeric(10,2) NOT NULL,
  actor_user_id uuid NULL,
  actor_display_name_snapshot text NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  original_updated_at_snapshot timestamptz NULL,
  wholly_unstarted_acknowledged boolean NOT NULL,
  source_system text NOT NULL DEFAULT 'doorgo_native',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT dg_production_booking_moves_command_uidx
    UNIQUE (command_id),
  CONSTRAINT dg_production_booking_moves_booking_fk
    FOREIGN KEY (booking_id)
    REFERENCES public.dg_production_bookings(booking_id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_booking_moves_actor_fk
    FOREIGN KEY (actor_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,
  CONSTRAINT dg_production_booking_moves_dates_differ
    CHECK (to_production_date <> from_production_date),
  CONSTRAINT dg_production_booking_moves_hours_valid
    CHECK (
      shop_hours_snapshot >= 0
      AND shop_hours_snapshot <= 99999999.99
      AND shop_hours_snapshot = pg_catalog.trunc(shop_hours_snapshot, 2)
    ),
  CONSTRAINT dg_production_booking_moves_actor_display_name_not_empty
    CHECK (pg_catalog.length(pg_catalog.btrim(actor_display_name_snapshot)) > 0),
  CONSTRAINT dg_production_booking_moves_acknowledged
    CHECK (wholly_unstarted_acknowledged = true),
  CONSTRAINT dg_production_booking_moves_source_not_empty
    CHECK (pg_catalog.length(pg_catalog.btrim(source_system)) > 0)
);

CREATE INDEX dg_production_booking_moves_booking_moved_idx
  ON public.dg_production_booking_moves (booking_id, moved_at DESC);

CREATE INDEX dg_production_booking_moves_from_date_idx
  ON public.dg_production_booking_moves (from_production_date DESC, moved_at DESC);

CREATE OR REPLACE FUNCTION public.parse_production_booking_date(
  p_value text
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_date date;
BEGIN
  IF p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_date := p_value::date;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN NULL;
  END;

  IF pg_catalog.to_char(v_date, 'YYYY-MM-DD') IS DISTINCT FROM p_value THEN
    RETURN NULL;
  END IF;

  RETURN v_date;
END;
$$;

ALTER FUNCTION public.parse_production_booking_date(text)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.parse_production_booking_date(text)
  FROM PUBLIC, anon, authenticated;

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
      NEW.created_at
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
      OLD.created_at
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

CREATE TRIGGER dg_production_booking_moves_immutable
BEFORE UPDATE OR DELETE ON public.dg_production_booking_moves
FOR EACH ROW
EXECUTE FUNCTION public.reject_production_booking_move_mutation();

CREATE OR REPLACE FUNCTION public.read_recent_production_recovery_bookings(
  p_start_date date,
  p_end_date date,
  p_limit integer
)
RETURNS TABLE (
  booking_id text,
  production_date date,
  shop_hours numeric(10,2),
  display_title text,
  job_id text,
  sales_order text,
  booking_kind text,
  schedule_status text,
  booking_origin text,
  explicitly_completed boolean,
  locked boolean,
  legacy_calendar_linked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.dg_user_profiles%ROWTYPE;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_read.authentication_required';
  END IF;

  SELECT *
    INTO v_profile
    FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor;

  IF NOT FOUND OR NOT v_profile.active THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_read.active_profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dg_user_permissions AS permission
    WHERE permission.user_id = v_actor
      AND permission.permission_key = 'production'
      AND permission.access_level IN ('view', 'use')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_read.permission_required';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_limit IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_read.invalid_request';
  END IF;

  IF p_start_date > p_end_date
    OR p_end_date >= v_today
    OR p_end_date - p_start_date > 93
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_read.invalid_date_range';
  END IF;

  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_read.invalid_limit';
  END IF;

  RETURN QUERY
  SELECT
    booking.booking_id,
    parsed.production_date,
    booking.shop_hours::numeric(10,2),
    COALESCE(
      NULLIF(pg_catalog.btrim(booking.title), ''),
      booking.booking_id
    ),
    booking.job_id,
    NULLIF(pg_catalog.btrim(booking.raw_booking ->> 'salesOrder'), ''),
    booking.booking_kind,
    booking.schedule_status,
    booking.source_system,
    false,
    COALESCE(booking.locked, false),
    booking.calendar_id IS NOT NULL OR booking.calendar_event_id IS NOT NULL
  FROM public.dg_production_bookings AS booking
  CROSS JOIN LATERAL (
    SELECT public.parse_production_booking_date(booking.production_date)
      AS production_date
  ) AS parsed
  WHERE parsed.production_date IS NOT NULL
    AND parsed.production_date BETWEEN p_start_date AND p_end_date
    AND parsed.production_date < v_today
    AND booking.booking_kind = 'production'
    AND booking.deleted_at IS NULL
    AND booking.cancelled_at IS NULL
    AND booking.status = 'active'
    AND booking.schedule_status = 'confirmed'
    AND booking.board_visible IS DISTINCT FROM false
    AND booking.locked IS DISTINCT FROM true
    AND pg_catalog.length(pg_catalog.btrim(booking.booking_id)) > 0
    AND booking.shop_hours IS NOT NULL
    AND booking.shop_hours >= 0
    AND booking.shop_hours <= 99999999.99
    AND booking.shop_hours = pg_catalog.trunc(booking.shop_hours, 2)
    AND booking.completed_at IS NULL
  ORDER BY
    parsed.production_date DESC,
    COALESCE(NULLIF(pg_catalog.btrim(booking.title), ''), booking.booking_id),
    booking.booking_id
  LIMIT p_limit;
END;
$$;

ALTER FUNCTION public.read_recent_production_recovery_bookings(date, date, integer)
  OWNER TO postgres;

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
  v_move_id uuid := extensions.gen_random_uuid();
  v_moved_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.authentication_required';
  END IF;

  SELECT *
    INTO v_profile
    FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor;

  IF NOT FOUND OR NOT v_profile.active THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.active_profile_required';
  END IF;

  IF v_profile.display_name IS NULL
    OR pg_catalog.length(pg_catalog.btrim(v_profile.display_name)) = 0
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.active_profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dg_user_permissions AS permission
    WHERE permission.user_id = v_actor
      AND permission.permission_key = 'production'
      AND permission.access_level = 'use'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.permission_required';
  END IF;

  IF p_command_id IS NULL
    OR p_booking_id IS NULL
    OR p_expected_production_date IS NULL
    OR p_wholly_unstarted_acknowledged IS NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.invalid_request';
  END IF;

  IF pg_catalog.length(pg_catalog.btrim(p_booking_id)) = 0
    OR pg_catalog.length(p_booking_id) > 500
    OR p_booking_id IS DISTINCT FROM pg_catalog.btrim(p_booking_id)
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.invalid_booking_id';
  END IF;

  IF p_wholly_unstarted_acknowledged IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.acknowledgement_required';
  END IF;

  IF p_expected_production_date >= v_today THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.not_past_date';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dg_production_booking_move_command:' || p_command_id::text,
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
    FROM public.dg_production_booking_moves AS move
    WHERE move.command_id = p_command_id;

  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor
      OR v_existing.booking_id IS DISTINCT FROM p_booking_id
      OR v_existing.from_production_date IS DISTINCT FROM p_expected_production_date
      OR v_existing.wholly_unstarted_acknowledged IS DISTINCT FROM true
    THEN
      RAISE EXCEPTION USING MESSAGE = 'production_booking_move.command_uuid_collision';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.move_id,
      v_existing.booking_id,
      v_existing.from_production_date,
      v_existing.to_production_date,
      v_existing.shop_hours_snapshot,
      v_existing.moved_at,
      'moved'::text;
    RETURN;
  END IF;

  SELECT *
    INTO v_booking
    FROM public.dg_production_bookings AS booking
    WHERE booking.booking_id = p_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.not_found';
  END IF;

  v_current_date := public.parse_production_booking_date(v_booking.production_date);

  IF v_current_date IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.ineligible_booking';
  END IF;

  IF v_current_date = v_today THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.already_moved';
  END IF;

  IF v_current_date IS DISTINCT FROM p_expected_production_date THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.stale_booking';
  END IF;

  IF v_current_date > v_today
    OR v_booking.booking_kind IS DISTINCT FROM 'production'
    OR v_booking.deleted_at IS NOT NULL
    OR v_booking.cancelled_at IS NOT NULL
    OR v_booking.status IS DISTINCT FROM 'active'
    OR v_booking.schedule_status IS DISTINCT FROM 'confirmed'
    OR v_booking.board_visible IS NOT DISTINCT FROM false
    OR v_booking.locked IS NOT DISTINCT FROM true
    OR pg_catalog.length(pg_catalog.btrim(v_booking.booking_id)) = 0
    OR v_booking.shop_hours IS NULL
    OR v_booking.shop_hours < 0
    OR v_booking.shop_hours > 99999999.99
    OR v_booking.shop_hours <> pg_catalog.trunc(v_booking.shop_hours, 2)
    OR v_booking.completed_at IS NOT NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'production_booking_move.ineligible_booking';
  END IF;

  UPDATE public.dg_production_bookings AS booking
  SET
    production_date = pg_catalog.to_char(v_today, 'YYYY-MM-DD'),
    updated_at = v_moved_at
  WHERE booking.booking_id = p_booking_id;

  INSERT INTO public.dg_production_booking_moves (
    move_id,
    command_id,
    booking_id,
    from_production_date,
    to_production_date,
    shop_hours_snapshot,
    actor_user_id,
    actor_display_name_snapshot,
    moved_at,
    original_updated_at_snapshot,
    wholly_unstarted_acknowledged,
    source_system,
    created_at
  ) VALUES (
    v_move_id,
    p_command_id,
    p_booking_id,
    v_current_date,
    v_today,
    v_booking.shop_hours::numeric(10,2),
    v_actor,
    pg_catalog.btrim(v_profile.display_name),
    v_moved_at,
    v_booking.updated_at,
    true,
    'doorgo_native',
    v_moved_at
  );

  RETURN QUERY
  SELECT
    v_move_id,
    p_booking_id,
    v_current_date,
    v_today,
    v_booking.shop_hours::numeric(10,2),
    v_moved_at,
    'moved'::text;
END;
$$;

ALTER FUNCTION public.move_production_booking_to_today(uuid, text, date, boolean)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.read_recent_production_recovery_bookings(date, date, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_recent_production_recovery_bookings(date, date, integer)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.read_recent_production_recovery_bookings(date, date, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.move_production_booking_to_today(uuid, text, date, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_production_booking_to_today(uuid, text, date, boolean)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.move_production_booking_to_today(uuid, text, date, boolean)
  TO authenticated;

ALTER TABLE public.dg_production_booking_moves ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_production_booking_moves
  FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_production_bookings
  FROM anon, authenticated;

COMMIT;
