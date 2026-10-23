-- Stage 4A: atomic profile/internal transitions. Adapters remain inactive.
BEGIN;

CREATE OR REPLACE FUNCTION public.dg_password_request_reset(p_user_id uuid,p_operation_id uuid)
RETURNS public.dg_password_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE; op public.dg_password_operations%ROWTYPE;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  SELECT * INTO op FROM public.dg_password_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF op.user_id<>p_user_id OR op.kind<>'admin_reset' THEN RAISE EXCEPTION 'password.operation_mismatch'; END IF;
    RETURN op;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=p_user_id AND active) THEN
    RAISE EXCEPTION 'password.inactive_user';
  END IF;
  UPDATE public.dg_password_operations SET state='superseded',settled_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id AND state='pending';
  UPDATE public.dg_password_setup_state SET generation=generation+1,setup_required=true,reset_pending=true
    WHERE user_id=p_user_id RETURNING * INTO s;
  UPDATE public.dg_user_profiles SET must_change_password=true,updated_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id;
  INSERT INTO public.dg_password_operations(operation_id,user_id,generation,kind,state)
    VALUES(p_operation_id,p_user_id,s.generation,'admin_reset','pending') RETURNING * INTO op;
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
    SELECT 1 FROM public.dg_user_profiles WHERE user_id=p_user_id AND active)) THEN final_state := 'superseded'; END IF;
  UPDATE public.dg_password_operations SET state=final_state,outcome=p_outcome,
    reconciliation_reference=p_reconciliation,settled_at=pg_catalog.clock_timestamp()
    WHERE operation_id=p_operation_id RETURNING * INTO op;
  IF final_state='succeeded' THEN
    IF op.kind='employee_setup' AND NOT s.reset_pending THEN
      UPDATE public.dg_password_setup_state SET setup_required=false WHERE user_id=p_user_id;
      UPDATE public.dg_user_profiles SET must_change_password=false,
        password_changed_at=op.settled_at,updated_at=op.settled_at WHERE user_id=p_user_id;
    ELSIF op.kind='admin_reset' THEN
      UPDATE public.dg_password_setup_state SET reset_pending=false WHERE user_id=p_user_id;
    END IF;
  END IF;
  -- Failed resets retain reset_pending: request a NEW reset to retry, never reuse dispatch IDs.
  RETURN op;
END $$;

ALTER FUNCTION public.dg_password_request_reset(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.dg_password_settle(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_password_request_reset(uuid,uuid),public.dg_password_settle(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dg_password_request_reset(uuid,uuid) TO service_role;
COMMIT;
