-- Phase 2F-C2: controlled production-flow checkpoint mutation contracts.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_production_flow_checkpoint(
  p_checkpoint_id uuid,
  p_production_date date,
  p_opening_carry_hours numeric,
  p_calculated_opening_carry_snapshot numeric DEFAULT NULL,
  p_calculation_version text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.dg_production_flow_checkpoints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.dg_user_profiles%ROWTYPE;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
  v_note text := NULLIF(pg_catalog.btrim(p_note), '');
  v_version text := NULLIF(pg_catalog.btrim(p_calculation_version), '');
  v_existing public.dg_production_flow_checkpoints%ROWTYPE;
  v_latest public.dg_production_flow_checkpoints%ROWTYPE;
  v_prior public.dg_production_flow_checkpoints%ROWTYPE;
  v_result public.dg_production_flow_checkpoints%ROWTYPE;
  v_series_count bigint;
  v_row_count bigint;
  v_min_revision integer;
  v_max_revision integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.authentication_required'; END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles AS p WHERE p.user_id = v_actor;
  IF NOT FOUND OR NOT v_profile.active THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS p WHERE p.user_id = v_actor AND p.permission_key = 'production_checkpoints' AND p.access_level = 'use') THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint.permission_required';
  END IF;
  IF p_checkpoint_id IS NULL OR p_production_date IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.invalid_request'; END IF;
  IF p_production_date > v_today THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.future_date_not_allowed'; END IF;
  IF p_opening_carry_hours IS NULL OR p_opening_carry_hours < 0 OR p_opening_carry_hours > 99999999.99
    OR p_calculated_opening_carry_snapshot < 0 OR p_calculated_opening_carry_snapshot > 99999999.99
  THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.invalid_carry_value'; END IF;
  IF p_opening_carry_hours <> pg_catalog.trunc(p_opening_carry_hours, 2) OR (p_calculated_opening_carry_snapshot IS NOT NULL AND p_calculated_opening_carry_snapshot <> pg_catalog.trunc(p_calculated_opening_carry_snapshot, 2)) THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint.too_many_decimal_places';
  END IF;
  IF pg_catalog.length(v_note) > 500 OR pg_catalog.length(v_version) > 500 THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.note_too_long'; END IF;

  -- Lock every command UUID globally before its date; collisions only serialize unrelated work.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint_command:' || p_checkpoint_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint:' || p_production_date::text, 0));

  SELECT * INTO v_existing FROM public.dg_production_flow_checkpoints AS c WHERE c.checkpoint_id = p_checkpoint_id;
  IF FOUND THEN
    IF v_existing.recorded_by_user_id IS DISTINCT FROM v_actor
      OR v_existing.production_date IS DISTINCT FROM p_production_date
      OR v_existing.opening_carry_hours IS DISTINCT FROM p_opening_carry_hours
      OR v_existing.calculated_opening_carry_snapshot IS DISTINCT FROM p_calculated_opening_carry_snapshot
      OR v_existing.adjustment_hours_snapshot IS DISTINCT FROM (
        CASE
          WHEN p_calculated_opening_carry_snapshot IS NULL THEN NULL
          ELSE p_opening_carry_hours - p_calculated_opening_carry_snapshot
        END
      )
      OR v_existing.calculation_version IS DISTINCT FROM v_version
      OR v_existing.note IS DISTINCT FROM v_note
      OR v_existing.confirmed_at IS NULL
    THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.command_uuid_collision'; END IF;
    IF v_existing.revision_number > 1 THEN
      SELECT * INTO v_prior FROM public.dg_production_flow_checkpoints AS c WHERE c.checkpoint_id = v_existing.supersedes_checkpoint_id;
      IF NOT FOUND OR v_prior.confirmed_at IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.command_uuid_collision'; END IF;
    END IF;
    RETURN v_existing;
  END IF;

  SELECT count(DISTINCT c.checkpoint_series_id), count(*), min(c.revision_number), max(c.revision_number)
    INTO v_series_count, v_row_count, v_min_revision, v_max_revision
    FROM public.dg_production_flow_checkpoints AS c WHERE c.production_date = p_production_date;
  IF v_row_count = 0 THEN
    INSERT INTO public.dg_production_flow_checkpoints (
      checkpoint_id, checkpoint_series_id, production_date, opening_carry_hours, checkpoint_status,
      revision_number, calculated_opening_carry_snapshot, adjustment_hours_snapshot, calculation_version,
      note, recorded_by_user_id, actor_type, confirmed_at, confirmed_by_user_id, source_system
    ) VALUES (
      p_checkpoint_id, extensions.gen_random_uuid(), p_production_date, p_opening_carry_hours, 'confirmed', 1,
      p_calculated_opening_carry_snapshot,
      CASE WHEN p_calculated_opening_carry_snapshot IS NULL THEN NULL ELSE p_opening_carry_hours - p_calculated_opening_carry_snapshot END,
      v_version, v_note, v_actor, 'office_user', pg_catalog.clock_timestamp(), v_actor, 'doorgo_office'
    ) RETURNING * INTO v_result;
    RETURN v_result;
  END IF;
  IF v_series_count <> 1 OR v_min_revision <> 1 OR v_row_count <> v_max_revision THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.inconsistent_history'; END IF;
  IF EXISTS (SELECT 1 FROM public.dg_production_flow_checkpoints AS c WHERE c.production_date = p_production_date AND c.checkpoint_status = 'confirmed') THEN
    RAISE EXCEPTION USING MESSAGE = 'checkpoint.already_confirmed';
  END IF;
  SELECT * INTO v_latest FROM public.dg_production_flow_checkpoints AS c WHERE c.production_date = p_production_date ORDER BY c.revision_number DESC LIMIT 1 FOR UPDATE;
  IF v_latest.checkpoint_status <> 'voided' OR v_latest.superseded_by_checkpoint_id IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.inconsistent_history'; END IF;
  UPDATE public.dg_production_flow_checkpoints AS c SET checkpoint_status = 'superseded', superseded_by_checkpoint_id = p_checkpoint_id WHERE c.checkpoint_id = v_latest.checkpoint_id;
  INSERT INTO public.dg_production_flow_checkpoints (
    checkpoint_id, checkpoint_series_id, production_date, opening_carry_hours, checkpoint_status, revision_number,
    supersedes_checkpoint_id, calculated_opening_carry_snapshot, adjustment_hours_snapshot, calculation_version,
    note, recorded_by_user_id, actor_type, confirmed_at, confirmed_by_user_id, source_system
  ) VALUES (
    p_checkpoint_id, v_latest.checkpoint_series_id, p_production_date, p_opening_carry_hours, 'confirmed', v_latest.revision_number + 1,
    v_latest.checkpoint_id, p_calculated_opening_carry_snapshot,
    CASE WHEN p_calculated_opening_carry_snapshot IS NULL THEN NULL ELSE p_opening_carry_hours - p_calculated_opening_carry_snapshot END,
    v_version, v_note, v_actor, 'office_user', pg_catalog.clock_timestamp(), v_actor, 'doorgo_office'
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_production_flow_checkpoint(
  p_new_checkpoint_id uuid,
  p_production_date date,
  p_expected_checkpoint_id uuid,
  p_expected_revision_number integer,
  p_opening_carry_hours numeric,
  p_calculated_opening_carry_snapshot numeric DEFAULT NULL,
  p_calculation_version text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.dg_production_flow_checkpoints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_profile public.dg_user_profiles%ROWTYPE;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
  v_note text := NULLIF(pg_catalog.btrim(p_note), ''); v_version text := NULLIF(pg_catalog.btrim(p_calculation_version), '');
  v_existing public.dg_production_flow_checkpoints%ROWTYPE; v_current public.dg_production_flow_checkpoints%ROWTYPE; v_prior public.dg_production_flow_checkpoints%ROWTYPE; v_result public.dg_production_flow_checkpoints%ROWTYPE;
  v_series_count bigint; v_row_count bigint; v_min_revision integer; v_max_revision integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.authentication_required'; END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles AS p WHERE p.user_id = v_actor;
  IF NOT FOUND OR NOT v_profile.active THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS p WHERE p.user_id = v_actor AND p.permission_key = 'production_checkpoints' AND p.access_level = 'use') THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.permission_required'; END IF;
  IF p_new_checkpoint_id IS NULL OR p_expected_checkpoint_id IS NULL OR p_expected_revision_number IS NULL OR p_production_date IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.invalid_request'; END IF;
  IF p_production_date > v_today THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.future_date_not_allowed'; END IF;
  IF p_opening_carry_hours IS NULL OR p_opening_carry_hours < 0 OR p_opening_carry_hours > 99999999.99
    OR p_calculated_opening_carry_snapshot < 0 OR p_calculated_opening_carry_snapshot > 99999999.99
  THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.invalid_carry_value'; END IF;
  IF p_opening_carry_hours <> pg_catalog.trunc(p_opening_carry_hours, 2) OR (p_calculated_opening_carry_snapshot IS NOT NULL AND p_calculated_opening_carry_snapshot <> pg_catalog.trunc(p_calculated_opening_carry_snapshot, 2)) THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.too_many_decimal_places'; END IF;
  IF pg_catalog.length(v_note) > 500 OR pg_catalog.length(v_version) > 500 THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.note_too_long'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint_command:' || p_new_checkpoint_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint:' || p_production_date::text, 0));
  SELECT * INTO v_existing FROM public.dg_production_flow_checkpoints AS c WHERE c.checkpoint_id = p_new_checkpoint_id;
  IF FOUND THEN
    SELECT * INTO v_prior FROM public.dg_production_flow_checkpoints AS c WHERE c.checkpoint_id = v_existing.supersedes_checkpoint_id;
    IF v_existing.recorded_by_user_id IS DISTINCT FROM v_actor OR v_existing.production_date IS DISTINCT FROM p_production_date
      OR v_existing.supersedes_checkpoint_id IS DISTINCT FROM p_expected_checkpoint_id OR v_existing.revision_number IS DISTINCT FROM p_expected_revision_number + 1
      OR v_existing.opening_carry_hours IS DISTINCT FROM p_opening_carry_hours OR v_existing.calculated_opening_carry_snapshot IS DISTINCT FROM p_calculated_opening_carry_snapshot
      OR v_existing.adjustment_hours_snapshot IS DISTINCT FROM (
        CASE
          WHEN p_calculated_opening_carry_snapshot IS NULL THEN NULL
          ELSE p_opening_carry_hours - p_calculated_opening_carry_snapshot
        END
      )
      OR v_existing.calculation_version IS DISTINCT FROM v_version OR v_existing.note IS DISTINCT FROM v_note OR v_existing.confirmed_at IS NULL
      OR NOT FOUND OR v_prior.revision_number IS DISTINCT FROM p_expected_revision_number OR v_prior.confirmed_at IS NULL
    THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.command_uuid_collision'; END IF;
    RETURN v_existing;
  END IF;
  SELECT count(DISTINCT c.checkpoint_series_id), count(*), min(c.revision_number), max(c.revision_number)
    INTO v_series_count, v_row_count, v_min_revision, v_max_revision
    FROM public.dg_production_flow_checkpoints AS c WHERE c.production_date = p_production_date;
  IF v_row_count = 0 THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.not_found'; END IF;
  IF v_series_count <> 1 OR v_min_revision <> 1 OR v_row_count <> v_max_revision THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.inconsistent_history'; END IF;
  SELECT * INTO v_current FROM public.dg_production_flow_checkpoints AS c WHERE c.production_date = p_production_date AND c.checkpoint_status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.not_found'; END IF;
  IF v_current.revision_number <> v_max_revision THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.inconsistent_history'; END IF;
  IF v_current.checkpoint_id IS DISTINCT FROM p_expected_checkpoint_id OR v_current.revision_number IS DISTINCT FROM p_expected_revision_number THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.stale_revision'; END IF;
  UPDATE public.dg_production_flow_checkpoints AS c SET checkpoint_status = 'superseded', superseded_by_checkpoint_id = p_new_checkpoint_id WHERE c.checkpoint_id = v_current.checkpoint_id;
  INSERT INTO public.dg_production_flow_checkpoints (checkpoint_id, checkpoint_series_id, production_date, opening_carry_hours, checkpoint_status, revision_number, supersedes_checkpoint_id, calculated_opening_carry_snapshot, adjustment_hours_snapshot, calculation_version, note, recorded_by_user_id, actor_type, confirmed_at, confirmed_by_user_id, source_system)
  VALUES (p_new_checkpoint_id, v_current.checkpoint_series_id, p_production_date, p_opening_carry_hours, 'confirmed', v_current.revision_number + 1, v_current.checkpoint_id, p_calculated_opening_carry_snapshot, CASE WHEN p_calculated_opening_carry_snapshot IS NULL THEN NULL ELSE p_opening_carry_hours - p_calculated_opening_carry_snapshot END, v_version, v_note, v_actor, 'office_user', pg_catalog.clock_timestamp(), v_actor, 'doorgo_office') RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_production_flow_checkpoint(
  p_void_checkpoint_id uuid,
  p_production_date date,
  p_expected_checkpoint_id uuid,
  p_expected_revision_number integer,
  p_note text
)
RETURNS public.dg_production_flow_checkpoints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_profile public.dg_user_profiles%ROWTYPE;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
  v_note text := NULLIF(pg_catalog.btrim(p_note), '');
  v_existing public.dg_production_flow_checkpoints%ROWTYPE; v_current public.dg_production_flow_checkpoints%ROWTYPE; v_prior public.dg_production_flow_checkpoints%ROWTYPE; v_result public.dg_production_flow_checkpoints%ROWTYPE;
  v_series_count bigint; v_row_count bigint; v_min_revision integer; v_max_revision integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.authentication_required'; END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles AS p WHERE p.user_id = v_actor;
  IF NOT FOUND OR NOT v_profile.active THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions AS p WHERE p.user_id = v_actor AND p.permission_key = 'production_checkpoints' AND p.access_level = 'use') THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.permission_required'; END IF;
  IF p_void_checkpoint_id IS NULL OR p_expected_checkpoint_id IS NULL OR p_expected_revision_number IS NULL OR p_production_date IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.invalid_request'; END IF;
  IF p_production_date > v_today THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.future_date_not_allowed'; END IF;
  IF v_note IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.note_required'; END IF;
  IF pg_catalog.length(v_note) > 500 THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.note_too_long'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint_command:' || p_void_checkpoint_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint:' || p_production_date::text, 0));
  SELECT * INTO v_existing FROM public.dg_production_flow_checkpoints AS c WHERE c.checkpoint_id = p_void_checkpoint_id;
  IF FOUND THEN
    SELECT * INTO v_prior FROM public.dg_production_flow_checkpoints AS c WHERE c.checkpoint_id = v_existing.supersedes_checkpoint_id;
    IF v_existing.recorded_by_user_id IS DISTINCT FROM v_actor OR v_existing.production_date IS DISTINCT FROM p_production_date
      OR v_existing.supersedes_checkpoint_id IS DISTINCT FROM p_expected_checkpoint_id OR v_existing.revision_number IS DISTINCT FROM p_expected_revision_number + 1
      OR v_existing.note IS DISTINCT FROM v_note OR v_existing.confirmed_at IS NOT NULL OR NOT FOUND
      OR v_prior.revision_number IS DISTINCT FROM p_expected_revision_number
      OR v_existing.opening_carry_hours IS DISTINCT FROM v_prior.opening_carry_hours
      OR v_existing.calculated_opening_carry_snapshot IS DISTINCT FROM v_prior.calculated_opening_carry_snapshot
      OR v_existing.adjustment_hours_snapshot IS DISTINCT FROM v_prior.adjustment_hours_snapshot
      OR v_existing.calculation_version IS DISTINCT FROM v_prior.calculation_version
    THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.command_uuid_collision'; END IF;
    RETURN v_existing;
  END IF;
  SELECT count(DISTINCT c.checkpoint_series_id), count(*), min(c.revision_number), max(c.revision_number)
    INTO v_series_count, v_row_count, v_min_revision, v_max_revision
    FROM public.dg_production_flow_checkpoints AS c WHERE c.production_date = p_production_date;
  IF v_row_count = 0 THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.not_found'; END IF;
  IF v_series_count <> 1 OR v_min_revision <> 1 OR v_row_count <> v_max_revision THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.inconsistent_history'; END IF;
  SELECT * INTO v_current FROM public.dg_production_flow_checkpoints AS c WHERE c.production_date = p_production_date AND c.checkpoint_status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.not_found'; END IF;
  IF v_current.revision_number <> v_max_revision THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.inconsistent_history'; END IF;
  IF v_current.checkpoint_id IS DISTINCT FROM p_expected_checkpoint_id OR v_current.revision_number IS DISTINCT FROM p_expected_revision_number THEN RAISE EXCEPTION USING MESSAGE = 'checkpoint.stale_revision'; END IF;
  UPDATE public.dg_production_flow_checkpoints AS c SET checkpoint_status = 'superseded', superseded_by_checkpoint_id = p_void_checkpoint_id WHERE c.checkpoint_id = v_current.checkpoint_id;
  INSERT INTO public.dg_production_flow_checkpoints (checkpoint_id, checkpoint_series_id, production_date, opening_carry_hours, checkpoint_status, revision_number, supersedes_checkpoint_id, calculated_opening_carry_snapshot, adjustment_hours_snapshot, calculation_version, note, recorded_by_user_id, actor_type, confirmed_at, confirmed_by_user_id, source_system)
  VALUES (p_void_checkpoint_id, v_current.checkpoint_series_id, p_production_date, v_current.opening_carry_hours, 'voided', v_current.revision_number + 1, v_current.checkpoint_id, v_current.calculated_opening_carry_snapshot, v_current.adjustment_hours_snapshot, v_current.calculation_version, v_note, v_actor, 'office_user', NULL, NULL, 'doorgo_office') RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_production_flow_checkpoint(uuid, date, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_production_flow_checkpoint(uuid, date, numeric, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_production_flow_checkpoint(uuid, date, numeric, numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.revise_production_flow_checkpoint(uuid, date, uuid, integer, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revise_production_flow_checkpoint(uuid, date, uuid, integer, numeric, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.revise_production_flow_checkpoint(uuid, date, uuid, integer, numeric, numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.void_production_flow_checkpoint(uuid, date, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_production_flow_checkpoint(uuid, date, uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_production_flow_checkpoint(uuid, date, uuid, integer, text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dg_production_flow_checkpoints FROM anon, authenticated;

COMMIT;
