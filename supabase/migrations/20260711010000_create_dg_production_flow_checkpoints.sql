CREATE TABLE IF NOT EXISTS public.dg_production_flow_checkpoints (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  production_date date NOT NULL,
  opening_carry_hours numeric(10,2) NOT NULL,
  checkpoint_status text NOT NULL CHECK (
    checkpoint_status IN ('confirmed', 'superseded', 'voided')
  ),
  revision_number integer NOT NULL,
  supersedes_checkpoint_id uuid NULL,
  superseded_by_checkpoint_id uuid NULL,
  calculated_opening_carry_snapshot numeric(10,2) NULL,
  adjustment_hours_snapshot numeric(10,2) NULL,
  calculation_version text NULL,
  note text NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid NULL,
  actor_type text NOT NULL CHECK (
    actor_type IN ('office_user', 'shop_tablet', 'system_import')
  ),
  confirmed_at timestamptz NULL,
  confirmed_by_user_id uuid NULL,
  source_system text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dg_production_flow_checkpoints_opening_carry_nonnegative
    CHECK (opening_carry_hours >= 0),
  CONSTRAINT dg_production_flow_checkpoints_revision_positive
    CHECK (revision_number > 0),
  CONSTRAINT dg_production_flow_checkpoints_supersedes_fk
    FOREIGN KEY (supersedes_checkpoint_id)
    REFERENCES public.dg_production_flow_checkpoints(checkpoint_id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_flow_checkpoints_superseded_by_fk
    FOREIGN KEY (superseded_by_checkpoint_id)
    REFERENCES public.dg_production_flow_checkpoints(checkpoint_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT dg_production_flow_checkpoints_recorded_by_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_flow_checkpoints_confirmed_by_fk
    FOREIGN KEY (confirmed_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_production_flow_checkpoints_no_self_supersedes
    CHECK (
      supersedes_checkpoint_id IS NULL
      OR supersedes_checkpoint_id <> checkpoint_id
    ),
  CONSTRAINT dg_production_flow_checkpoints_no_self_superseded_by
    CHECK (
      superseded_by_checkpoint_id IS NULL
      OR superseded_by_checkpoint_id <> checkpoint_id
    ),
  CONSTRAINT dg_production_flow_checkpoints_confirmed_not_superseded
    CHECK (
      checkpoint_status <> 'confirmed'
      OR superseded_by_checkpoint_id IS NULL
    ),
  CONSTRAINT dg_production_flow_checkpoints_superseded_has_successor
    CHECK (
      checkpoint_status <> 'superseded'
      OR superseded_by_checkpoint_id IS NOT NULL
    ),
  CONSTRAINT dg_production_flow_checkpoints_revision_link_required
    CHECK (
      (revision_number = 1 AND supersedes_checkpoint_id IS NULL)
      OR (revision_number > 1 AND supersedes_checkpoint_id IS NOT NULL)
    ),
  CONSTRAINT dg_production_flow_checkpoints_series_revision_unique
    UNIQUE (checkpoint_series_id, revision_number)
);

CREATE UNIQUE INDEX dg_production_flow_checkpoints_confirmed_date_uidx
  ON public.dg_production_flow_checkpoints (production_date)
  WHERE checkpoint_status = 'confirmed';

CREATE INDEX dg_production_flow_checkpoints_latest_confirmed_idx
  ON public.dg_production_flow_checkpoints (production_date DESC)
  WHERE checkpoint_status = 'confirmed';

CREATE INDEX dg_production_flow_checkpoints_series_revision_idx
  ON public.dg_production_flow_checkpoints (
    checkpoint_series_id,
    revision_number DESC
  );

CREATE INDEX dg_production_flow_checkpoints_recorded_idx
  ON public.dg_production_flow_checkpoints (recorded_at DESC);

COMMENT ON TABLE public.dg_production_flow_checkpoints IS
  'One checkpoint series per production date. Until the constrained checkpoint RPC exists, ordinary writes remain unavailable. The future RPC must lock the date/current checkpoint and reject a different checkpoint_series_id.';

CREATE OR REPLACE FUNCTION public.validate_production_flow_checkpoint_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior_checkpoint public.dg_production_flow_checkpoints%ROWTYPE;
  next_checkpoint public.dg_production_flow_checkpoints%ROWTYPE;
BEGIN
  IF NEW.supersedes_checkpoint_id IS NOT NULL THEN
    SELECT *
      INTO prior_checkpoint
      FROM public.dg_production_flow_checkpoints
      WHERE checkpoint_id = NEW.supersedes_checkpoint_id;

    IF prior_checkpoint.checkpoint_id IS NULL
      OR prior_checkpoint.checkpoint_series_id IS DISTINCT FROM NEW.checkpoint_series_id
      OR prior_checkpoint.production_date IS DISTINCT FROM NEW.production_date
      OR NEW.revision_number <> prior_checkpoint.revision_number + 1
      OR prior_checkpoint.superseded_by_checkpoint_id IS DISTINCT FROM NEW.checkpoint_id
    THEN
      RAISE EXCEPTION 'A superseded checkpoint link must be reciprocal, adjacent, and in the same series and production date';
    END IF;
  END IF;

  IF NEW.superseded_by_checkpoint_id IS NOT NULL THEN
    SELECT *
      INTO next_checkpoint
      FROM public.dg_production_flow_checkpoints
      WHERE checkpoint_id = NEW.superseded_by_checkpoint_id;

    IF next_checkpoint.checkpoint_id IS NULL
      OR next_checkpoint.checkpoint_series_id IS DISTINCT FROM NEW.checkpoint_series_id
      OR next_checkpoint.production_date IS DISTINCT FROM NEW.production_date
      OR next_checkpoint.revision_number <> NEW.revision_number + 1
      OR next_checkpoint.supersedes_checkpoint_id IS DISTINCT FROM NEW.checkpoint_id
    THEN
      RAISE EXCEPTION 'A successor checkpoint link must be reciprocal, adjacent, and in the same series and production date';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER dg_production_flow_checkpoints_link_consistency
AFTER INSERT OR UPDATE OF
  checkpoint_series_id,
  production_date,
  supersedes_checkpoint_id,
  superseded_by_checkpoint_id
ON public.dg_production_flow_checkpoints
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.validate_production_flow_checkpoint_links();

ALTER TABLE public.dg_production_flow_checkpoints ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_production_flow_checkpoints
  FROM anon, authenticated;
