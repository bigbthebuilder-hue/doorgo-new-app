-- Stage 4C-2A. Inactive integration; no active administration or RLS changes.
BEGIN;
ALTER TABLE public.dg_password_operations DROP CONSTRAINT dg_password_operations_kind_check;
ALTER TABLE public.dg_password_operations ADD CONSTRAINT dg_password_operations_kind_check
  CHECK (kind IN ('employee_setup','admin_reset','reactivation'));
ALTER TABLE public.dg_password_operations DROP CONSTRAINT dg_password_operations_check;
ALTER TABLE public.dg_password_operations ADD CONSTRAINT dg_password_operations_check
  CHECK (state<>'pending' OR kind IN ('admin_reset','reactivation'));

CREATE FUNCTION public.dg_password_request_reactivation(p_user_id uuid,p_operation_id uuid)
RETURNS public.dg_password_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE; op public.dg_password_operations%ROWTYPE;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  SELECT * INTO op FROM public.dg_password_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF op.user_id<>p_user_id OR op.kind<>'reactivation' THEN RAISE EXCEPTION 'password.operation_mismatch'; END IF;
    RETURN op;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=p_user_id AND NOT active) THEN
    RAISE EXCEPTION 'password.inactive_target_required';
  END IF;
  UPDATE public.dg_password_operations SET state='superseded',settled_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id AND state='pending';
  UPDATE public.dg_password_setup_state SET generation=generation+1,setup_required=true,reset_pending=true
    WHERE user_id=p_user_id RETURNING * INTO s;
  UPDATE public.dg_user_profiles SET must_change_password=true,updated_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id;
  INSERT INTO public.dg_password_operations(operation_id,user_id,generation,kind,state)
    VALUES(p_operation_id,p_user_id,s.generation,'reactivation','pending') RETURNING * INTO op;
  RETURN op;
END $$;

CREATE FUNCTION public.dg_password_deactivate(p_user_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  -- Even an already-inactive employee gets a new generation to fence reactivation.
  UPDATE public.dg_password_operations SET state='superseded',settled_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id AND state='pending';
  UPDATE public.dg_password_setup_state SET generation=generation+1,setup_required=true,reset_pending=false
    WHERE user_id=p_user_id RETURNING * INTO s;
  UPDATE public.dg_user_profiles SET active=false,must_change_password=true,updated_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id;
  -- Reserved/unknown operations are never released by deactivation.
  RETURN s.generation;
END $$;

CREATE OR REPLACE FUNCTION public.dg_password_reserve(p_user_id uuid,p_operation_id uuid,p_generation bigint,p_kind text)
RETURNS public.dg_password_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE; op public.dg_password_operations%ROWTYPE;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  IF p_generation IS NULL OR p_generation<>s.generation THEN RAISE EXCEPTION 'password.stale_generation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=p_user_id
    AND active=(p_kind IS DISTINCT FROM 'reactivation')) THEN
    RAISE EXCEPTION 'password.inactive_user';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('employee_setup','admin_reset','reactivation') THEN RAISE EXCEPTION 'password.invalid_kind'; END IF;
  IF EXISTS(SELECT 1 FROM public.dg_password_operations WHERE user_id=p_user_id AND state IN ('reserved','unknown')) THEN
    RAISE EXCEPTION 'password.write_unresolved';
  END IF;
  IF p_kind='employee_setup' THEN
    IF NOT s.setup_required OR s.reset_pending THEN RAISE EXCEPTION 'password.setup_unavailable'; END IF;
    INSERT INTO public.dg_password_operations(operation_id,user_id,generation,kind,state)
      VALUES(p_operation_id,p_user_id,s.generation,p_kind,'reserved') RETURNING * INTO op;
  ELSE
    SELECT * INTO op FROM public.dg_password_operations WHERE operation_id=p_operation_id;
    IF NOT FOUND OR op.user_id<>p_user_id OR op.generation<>s.generation OR op.kind<>p_kind
      OR op.state<>'pending' OR NOT s.reset_pending THEN RAISE EXCEPTION 'password.operation_mismatch'; END IF;
    UPDATE public.dg_password_operations SET state='reserved' WHERE operation_id=p_operation_id RETURNING * INTO op;
  END IF;
  RETURN op;
END $$;

CREATE OR REPLACE FUNCTION public.dg_password_settle(p_user_id uuid,p_operation_id uuid,p_outcome text,p_reconciliation text)
RETURNS public.dg_password_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE; op public.dg_password_operations%ROWTYPE; final_state text;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  SELECT * INTO op FROM public.dg_password_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND OR op.user_id<>p_user_id THEN RAISE EXCEPTION 'password.operation_mismatch'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('succeeded','failed','unknown') THEN RAISE EXCEPTION 'password.invalid_outcome'; END IF;
  IF p_reconciliation IS NOT NULL AND (length(btrim(p_reconciliation)) NOT BETWEEN 1 AND 200 OR p_outcome='unknown') THEN
    RAISE EXCEPTION 'password.invalid_reconciliation';
  END IF;
  IF op.state IN ('succeeded','failed','superseded') THEN
    IF op.outcome IS DISTINCT FROM p_outcome THEN RAISE EXCEPTION 'password.conflicting_outcome'; END IF;
    RETURN op; -- Never reapply completion to a newer generation.
  END IF;
  IF op.state='pending' THEN RAISE EXCEPTION 'password.not_reserved'; END IF;
  IF op.state='unknown' AND p_outcome<>'unknown' AND p_reconciliation IS NULL THEN
    RAISE EXCEPTION 'password.reconciliation_required';
  END IF;
  IF p_outcome='unknown' THEN
    UPDATE public.dg_password_operations SET state='unknown' WHERE operation_id=p_operation_id RETURNING * INTO op;
    RETURN op;
  END IF;
  final_state := p_outcome;
  IF p_outcome='succeeded' AND (op.generation<>s.generation OR NOT EXISTS(
    SELECT 1 FROM public.dg_user_profiles WHERE user_id=p_user_id AND active=(op.kind<>'reactivation'))
    OR (op.kind='reactivation' AND (NOT s.reset_pending OR NOT s.setup_required))) THEN final_state := 'superseded'; END IF;
  UPDATE public.dg_password_operations SET state=final_state,outcome=p_outcome,
    reconciliation_reference=p_reconciliation,settled_at=pg_catalog.clock_timestamp()
    WHERE operation_id=p_operation_id RETURNING * INTO op;
  IF final_state='succeeded' THEN
    IF op.kind='employee_setup' AND NOT s.reset_pending THEN
      UPDATE public.dg_password_setup_state SET setup_required=false WHERE user_id=p_user_id;
      UPDATE public.dg_user_profiles SET must_change_password=false,
        password_changed_at=op.settled_at,updated_at=op.settled_at WHERE user_id=p_user_id;
    ELSIF op.kind='reactivation' THEN
      UPDATE public.dg_password_setup_state SET reset_pending=false,setup_required=true WHERE user_id=p_user_id;
      UPDATE public.dg_user_profiles SET active=true,must_change_password=true,updated_at=op.settled_at WHERE user_id=p_user_id;
    ELSIF op.kind='admin_reset' THEN
      UPDATE public.dg_password_setup_state SET reset_pending=false WHERE user_id=p_user_id;
    END IF;
  END IF;
  -- Failed resets retain reset_pending: request a NEW reset to retry, never reuse dispatch IDs.
  RETURN op;
END $$;

DO $$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.dg_password_request_reactivation(uuid,uuid)', 'public.dg_password_deactivate(uuid)',
    'public.dg_password_reserve(uuid,uuid,bigint,text)', 'public.dg_password_settle(uuid,uuid,text,text)'
  ] LOOP
    EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,anon,authenticated,service_role';
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.dg_password_request_reactivation(uuid,uuid),public.dg_password_deactivate(uuid),
  public.dg_password_reserve(uuid,uuid,bigint,text) TO service_role;
COMMIT;
