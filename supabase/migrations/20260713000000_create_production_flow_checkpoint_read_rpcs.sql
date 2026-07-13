-- Phase 2F-C4A: permission-scoped production-flow checkpoint reads.

BEGIN;

CREATE OR REPLACE FUNCTION public.read_production_flow_checkpoint_day(
  p_production_date date
)
RETURNS TABLE (
  checkpoint_id uuid,
  production_date date,
  revision_number integer,
  status text,
  calculated_opening_carry_hours numeric(10,2),
  actual_opening_carry_hours numeric(10,2),
  adjustment_hours numeric(10,2),
  note text,
  removal_reason text,
  recorded_at timestamptz,
  recorded_by_display_name text
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
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.authentication_required';
  END IF;

  SELECT *
    INTO v_profile
    FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor;

  IF NOT FOUND OR NOT v_profile.active THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.active_profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.dg_user_permissions AS permission
      WHERE permission.user_id = v_actor
        AND permission.permission_key = 'production_checkpoints'
        AND permission.access_level IN ('view', 'use')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.permission_required';
  END IF;

  IF p_production_date IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.invalid_date';
  END IF;

  IF p_production_date > v_today THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.future_date_not_allowed';
  END IF;

  RETURN QUERY
  SELECT
    checkpoint.checkpoint_id,
    checkpoint.production_date,
    checkpoint.revision_number,
    CASE
      WHEN checkpoint.confirmed_at IS NULL THEN 'removed'
      WHEN checkpoint.checkpoint_status = 'confirmed' THEN 'confirmed'
      ELSE 'revised'
    END,
    checkpoint.calculated_opening_carry_snapshot,
    checkpoint.opening_carry_hours,
    checkpoint.adjustment_hours_snapshot,
    CASE WHEN checkpoint.confirmed_at IS NOT NULL THEN checkpoint.note ELSE NULL END,
    CASE WHEN checkpoint.confirmed_at IS NULL THEN checkpoint.note ELSE NULL END,
    checkpoint.recorded_at,
    recorder.display_name
  FROM public.dg_production_flow_checkpoints AS checkpoint
  LEFT JOIN public.dg_user_profiles AS recorder
    ON recorder.user_id = checkpoint.recorded_by_user_id
  WHERE checkpoint.production_date = p_production_date
  ORDER BY checkpoint.revision_number DESC;
END;
$$;

ALTER FUNCTION public.read_production_flow_checkpoint_day(date)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.read_recent_production_flow_checkpoint_history(
  p_limit integer
)
RETURNS TABLE (
  checkpoint_id uuid,
  production_date date,
  revision_number integer,
  status text,
  calculated_opening_carry_hours numeric(10,2),
  actual_opening_carry_hours numeric(10,2),
  adjustment_hours numeric(10,2),
  note text,
  removal_reason text,
  recorded_at timestamptz,
  recorded_by_display_name text
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
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.authentication_required';
  END IF;

  SELECT *
    INTO v_profile
    FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = v_actor;

  IF NOT FOUND OR NOT v_profile.active THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.active_profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.dg_user_permissions AS permission
      WHERE permission.user_id = v_actor
        AND permission.permission_key = 'production_checkpoints'
        AND permission.access_level IN ('view', 'use')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.permission_required';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint_read.invalid_limit';
  END IF;

  RETURN QUERY
  SELECT
    checkpoint.checkpoint_id,
    checkpoint.production_date,
    checkpoint.revision_number,
    CASE
      WHEN checkpoint.confirmed_at IS NULL THEN 'removed'
      WHEN checkpoint.checkpoint_status = 'confirmed' THEN 'confirmed'
      ELSE 'revised'
    END,
    checkpoint.calculated_opening_carry_snapshot,
    checkpoint.opening_carry_hours,
    checkpoint.adjustment_hours_snapshot,
    CASE WHEN checkpoint.confirmed_at IS NOT NULL THEN checkpoint.note ELSE NULL END,
    CASE WHEN checkpoint.confirmed_at IS NULL THEN checkpoint.note ELSE NULL END,
    checkpoint.recorded_at,
    recorder.display_name
  FROM public.dg_production_flow_checkpoints AS checkpoint
  LEFT JOIN public.dg_user_profiles AS recorder
    ON recorder.user_id = checkpoint.recorded_by_user_id
  WHERE checkpoint.production_date <= v_today
  ORDER BY checkpoint.production_date DESC, checkpoint.revision_number DESC
  LIMIT p_limit;
END;
$$;

ALTER FUNCTION public.read_recent_production_flow_checkpoint_history(integer)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.read_production_flow_checkpoint_day(date)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_production_flow_checkpoint_day(date)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.read_production_flow_checkpoint_day(date)
  TO authenticated;

REVOKE ALL ON FUNCTION public.read_recent_production_flow_checkpoint_history(integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_recent_production_flow_checkpoint_history(integer)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.read_recent_production_flow_checkpoint_history(integer)
  TO authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_production_flow_checkpoints
  FROM anon, authenticated;

COMMIT;
