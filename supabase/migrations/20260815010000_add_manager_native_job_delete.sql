-- Manager-only permanent native-job deletion with explicit job-owned cleanup.
BEGIN;

DO $contract$
BEGIN
  IF pg_catalog.to_regclass('public.dg_native_jobs') IS NULL
    OR pg_catalog.to_regclass('public.dg_native_job_lines') IS NULL
    OR pg_catalog.to_regclass('public.dg_native_job_create_commands') IS NULL
    OR pg_catalog.to_regclass('public.dg_production_bookings') IS NULL
    OR pg_catalog.to_regclass('public.dg_production_booking_moves') IS NULL
    OR pg_catalog.to_regclass('public.dg_production_booking_completion_events') IS NULL
    OR pg_catalog.to_regclass('public.dg_production_status_events') IS NULL
  THEN RAISE EXCEPTION 'native_job_delete.required_relation_missing'; END IF;
END;
$contract$;

-- Preserve append-only history by default. Only the manager delete RPC sets this
-- transaction-local guard, after authenticating and locking the target job.
CREATE OR REPLACE FUNCTION public.reject_production_status_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $guard$
BEGIN
  IF TG_OP = 'DELETE' AND pg_catalog.current_setting('doorgo.manager_job_delete', true) = 'authorized' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Production status events are immutable; append a correcting event instead';
END;
$guard$;

CREATE OR REPLACE FUNCTION public.reject_production_booking_move_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $guard$
BEGIN
  IF TG_OP = 'DELETE' AND pg_catalog.current_setting('doorgo.manager_job_delete', true) = 'authorized' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND ROW(
    NEW.move_id,NEW.command_id,NEW.booking_id,NEW.from_production_date,NEW.to_production_date,NEW.shop_hours_snapshot,
    NEW.actor_display_name_snapshot,NEW.moved_at,NEW.original_updated_at_snapshot,NEW.wholly_unstarted_acknowledged,NEW.source_system,NEW.created_at
  ) IS NOT DISTINCT FROM ROW(
    OLD.move_id,OLD.command_id,OLD.booking_id,OLD.from_production_date,OLD.to_production_date,OLD.shop_hours_snapshot,
    OLD.actor_display_name_snapshot,OLD.moved_at,OLD.original_updated_at_snapshot,OLD.wholly_unstarted_acknowledged,OLD.source_system,OLD.created_at
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Production booking move history is immutable';
END;
$guard$;

CREATE OR REPLACE FUNCTION public.reject_production_booking_completion_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $guard$
BEGIN
  IF TG_OP = 'DELETE' AND pg_catalog.current_setting('doorgo.manager_job_delete', true) = 'authorized' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND ROW(
    NEW.event_id,NEW.command_id,NEW.booking_id,NEW.production_date,NEW.action_type,NEW.actor_display_name_snapshot,
    NEW.occurred_at,NEW.previous_completed_at,NEW.resulting_completed_at,NEW.reopen_reason,NEW.created_at
  ) IS NOT DISTINCT FROM ROW(
    OLD.event_id,OLD.command_id,OLD.booking_id,OLD.production_date,OLD.action_type,OLD.actor_display_name_snapshot,
    OLD.occurred_at,OLD.previous_completed_at,OLD.resulting_completed_at,OLD.reopen_reason,OLD.created_at
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Production booking completion history is immutable';
END;
$guard$;

CREATE OR REPLACE FUNCTION public.dg_delete_native_job(
  p_internal_job_id uuid,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.dg_native_jobs%ROWTYPE;
  v_booking_ids text[] := ARRAY[]::text[];
  v_deleted_bookings integer := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'native_job.authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor AND profile.active = true
  ) THEN RAISE EXCEPTION USING MESSAGE = 'native_job.active_profile_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor AND profile.active = true AND profile.is_manager = true
  ) THEN RAISE EXCEPTION USING MESSAGE = 'native_job.manager_required'; END IF;
  IF p_internal_job_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.validation_failed'; END IF;

  SELECT * INTO v_job FROM public.dg_native_jobs AS job
  WHERE job.internal_job_id = p_internal_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'native_job.not_found'; END IF;
  IF v_job.revision IS DISTINCT FROM p_expected_revision
  THEN RAISE EXCEPTION USING MESSAGE = 'native_job.stale_revision'; END IF;

  PERFORM pg_catalog.set_config('doorgo.manager_job_delete', 'authorized', true);

  SELECT COALESCE(pg_catalog.array_agg(booking.booking_id ORDER BY booking.booking_id), ARRAY[]::text[])
  INTO v_booking_ids
  FROM public.dg_production_bookings AS booking
  WHERE booking.job_id = ANY(ARRAY[
    v_job.internal_job_id::text,
    v_job.visible_identifier,
    v_job.biztrack_sales_order,
    v_job.door_go_reference,
    v_job.legacy_job_id
  ]::text[]);

  DELETE FROM public.dg_production_status_events AS event WHERE event.booking_id = ANY(v_booking_ids);
  DELETE FROM public.dg_production_booking_completion_events AS event WHERE event.booking_id = ANY(v_booking_ids);
  DELETE FROM public.dg_production_booking_moves AS move WHERE move.booking_id = ANY(v_booking_ids);
  DELETE FROM public.dg_production_bookings AS booking WHERE booking.booking_id = ANY(v_booking_ids);
  GET DIAGNOSTICS v_deleted_bookings = ROW_COUNT;

  DELETE FROM public.dg_native_job_create_commands AS command WHERE command.internal_job_id = p_internal_job_id;
  DELETE FROM public.dg_native_job_lines AS line WHERE line.internal_job_id = p_internal_job_id;
  DELETE FROM public.dg_native_jobs AS job WHERE job.internal_job_id = p_internal_job_id;

  RETURN pg_catalog.jsonb_build_object(
    'internal_job_id', p_internal_job_id,
    'visible_identifier', v_job.visible_identifier,
    'deleted_production_bookings', v_deleted_bookings
  );
END;
$function$;

ALTER FUNCTION public.dg_delete_native_job(uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_delete_native_job(uuid,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dg_delete_native_job(uuid,bigint) TO authenticated;

COMMIT;
