CREATE TABLE IF NOT EXISTS public.dg_production_status_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'completion_confirmed',
      'completion_reopened',
      'completion_voided'
    )
  ),
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid NULL,
  actor_type text NOT NULL CHECK (
    actor_type IN ('office_user', 'shop_tablet', 'system_import')
  ),
  source_system text NOT NULL,
  note text NULL,
  supersedes_event_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dg_production_status_events_booking_fk
    FOREIGN KEY (booking_id)
    REFERENCES public.dg_production_bookings(booking_id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_status_events_recorded_by_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_status_events_supersedes_fk
    FOREIGN KEY (supersedes_event_id)
    REFERENCES public.dg_production_status_events(event_id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_status_events_no_self_supersession
    CHECK (supersedes_event_id IS NULL OR supersedes_event_id <> event_id),
  CONSTRAINT dg_production_status_events_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX dg_production_status_events_source_idempotency_uidx
  ON public.dg_production_status_events (source_system, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX dg_production_status_events_booking_effective_idx
  ON public.dg_production_status_events (
    booking_id,
    effective_at DESC,
    recorded_at DESC
  );

CREATE INDEX dg_production_status_events_booking_recorded_idx
  ON public.dg_production_status_events (booking_id, recorded_at DESC);

CREATE INDEX dg_production_status_events_type_effective_idx
  ON public.dg_production_status_events (event_type, effective_at DESC);

CREATE OR REPLACE FUNCTION public.validate_production_status_event_supersession()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  superseded_booking_id text;
BEGIN
  IF NEW.supersedes_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT booking_id
    INTO superseded_booking_id
    FROM public.dg_production_status_events
    WHERE event_id = NEW.supersedes_event_id;

  IF superseded_booking_id IS NULL OR superseded_booking_id IS DISTINCT FROM NEW.booking_id THEN
    RAISE EXCEPTION 'A production status event may supersede only an event for the same booking';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER dg_production_status_events_same_booking_supersession
AFTER INSERT OR UPDATE OF booking_id, supersedes_event_id
ON public.dg_production_status_events
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.validate_production_status_event_supersession();

CREATE OR REPLACE FUNCTION public.reject_production_status_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Production status events are immutable; append a correcting event instead';
END;
$$;

CREATE TRIGGER dg_production_status_events_immutable
BEFORE UPDATE OR DELETE ON public.dg_production_status_events
FOR EACH ROW
EXECUTE FUNCTION public.reject_production_status_event_mutation();

ALTER TABLE public.dg_production_status_events ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_production_status_events
  FROM anon, authenticated;
