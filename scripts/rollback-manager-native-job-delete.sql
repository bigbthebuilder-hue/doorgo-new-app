-- Removes only the manager delete capability. Permanently deleted data cannot be restored by schema rollback.
BEGIN;
DROP FUNCTION public.dg_delete_native_job(uuid,bigint);

CREATE OR REPLACE FUNCTION public.reject_production_status_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Production status events are immutable; append a correcting event instead';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_production_booking_move_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND ROW(
    NEW.move_id,NEW.command_id,NEW.booking_id,NEW.from_production_date,NEW.to_production_date,NEW.shop_hours_snapshot,
    NEW.actor_display_name_snapshot,NEW.moved_at,NEW.original_updated_at_snapshot,NEW.wholly_unstarted_acknowledged,NEW.source_system,NEW.created_at
  ) IS NOT DISTINCT FROM ROW(
    OLD.move_id,OLD.command_id,OLD.booking_id,OLD.from_production_date,OLD.to_production_date,OLD.shop_hours_snapshot,
    OLD.actor_display_name_snapshot,OLD.moved_at,OLD.original_updated_at_snapshot,OLD.wholly_unstarted_acknowledged,OLD.source_system,OLD.created_at
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Production booking move history is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_production_booking_completion_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND ROW(
    NEW.event_id,NEW.command_id,NEW.booking_id,NEW.production_date,NEW.action_type,NEW.actor_display_name_snapshot,
    NEW.occurred_at,NEW.previous_completed_at,NEW.resulting_completed_at,NEW.reopen_reason,NEW.created_at
  ) IS NOT DISTINCT FROM ROW(
    OLD.event_id,OLD.command_id,OLD.booking_id,OLD.production_date,OLD.action_type,OLD.actor_display_name_snapshot,
    OLD.occurred_at,OLD.previous_completed_at,OLD.resulting_completed_at,OLD.reopen_reason,OLD.created_at
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Production booking completion history is immutable';
END;
$$;
COMMIT;
