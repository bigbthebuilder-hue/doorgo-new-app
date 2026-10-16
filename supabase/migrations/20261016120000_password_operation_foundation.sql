-- Stage 1 only: dormant internal state; no existing Auth flow or profile flag is changed.
BEGIN;

CREATE TABLE public.dg_password_setup_state (
  user_id uuid PRIMARY KEY REFERENCES public.dg_user_profiles(user_id),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  setup_required boolean NOT NULL,
  reset_pending boolean NOT NULL DEFAULT false,
  CHECK (NOT reset_pending OR setup_required)
);

CREATE TABLE public.dg_password_operations (
  operation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.dg_password_setup_state(user_id),
  generation bigint NOT NULL CHECK (generation > 0),
  kind text NOT NULL CHECK (kind IN ('employee_setup', 'admin_reset')),
  state text NOT NULL CHECK (state IN ('pending', 'reserved', 'unknown', 'succeeded', 'failed', 'superseded')),
  outcome text CHECK (outcome IN ('succeeded', 'failed')),
  reconciliation_reference text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  settled_at timestamptz,
  CHECK (state <> 'pending' OR kind = 'admin_reset'),
  CHECK ((state IN ('succeeded', 'failed') AND outcome IS NOT NULL AND outcome = state)
      OR (state = 'superseded' AND (outcome IS NULL OR outcome = 'succeeded'))
      OR (state IN ('pending', 'reserved', 'unknown') AND outcome IS NULL)),
  CHECK ((state IN ('succeeded', 'failed', 'superseded')) = (settled_at IS NOT NULL)),
  CHECK (reconciliation_reference IS NULL OR length(btrim(reconciliation_reference)) BETWEEN 1 AND 200)
);

-- Reserved means an Auth write MAY have been dispatched. Never reclaim by age.
CREATE UNIQUE INDEX dg_password_one_unresolved_write
  ON public.dg_password_operations(user_id) WHERE state IN ('reserved', 'unknown');
CREATE UNIQUE INDEX dg_password_one_pending_reset
  ON public.dg_password_operations(user_id) WHERE state = 'pending';

ALTER TABLE public.dg_password_setup_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_password_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_password_setup_state OWNER TO postgres;
ALTER TABLE public.dg_password_operations OWNER TO postgres;
REVOKE ALL ON public.dg_password_setup_state, public.dg_password_operations
  FROM PUBLIC, anon, authenticated, service_role;

-- Private lock/initialization helper. Consistent profile -> state lock order.
-- Snapshot only: subsequent legacy profile changes are NOT synchronized in Stage 1.
CREATE FUNCTION public.dg_password_lock_state(p_user_id uuid)
RETURNS public.dg_password_setup_state LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE profile public.dg_user_profiles%ROWTYPE; result public.dg_password_setup_state%ROWTYPE;
BEGIN
  SELECT * INTO profile FROM public.dg_user_profiles WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'password.user_not_found'; END IF;
  INSERT INTO public.dg_password_setup_state(user_id,setup_required)
    VALUES(p_user_id,profile.must_change_password) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO result FROM public.dg_password_setup_state WHERE user_id=p_user_id FOR UPDATE;
  RETURN result;
END $$;

-- A reset request advances the generation without authorizing an Auth write.
-- Repeating the same operation ID is idempotent, including after supersession.
CREATE FUNCTION public.dg_password_request_reset(p_user_id uuid,p_operation_id uuid)
RETURNS public.dg_password_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE; op public.dg_password_operations%ROWTYPE;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  SELECT * INTO op FROM public.dg_password_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF op.user_id<>p_user_id OR op.kind<>'admin_reset' THEN RAISE EXCEPTION 'password.operation_mismatch'; END IF;
    RETURN op;
  END IF;
  UPDATE public.dg_password_operations SET state='superseded',settled_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id AND state='pending';
  UPDATE public.dg_password_setup_state SET generation=generation+1,setup_required=true,reset_pending=true
    WHERE user_id=p_user_id RETURNING * INTO s;
  INSERT INTO public.dg_password_operations(operation_id,user_id,generation,kind,state)
    VALUES(p_operation_id,p_user_id,s.generation,'admin_reset','pending') RETURNING * INTO op;
  RETURN op;
END $$;

-- A successful return for a NEW reservation permits ONE external dispatch only.
-- Duplicate reservations raise; callers must not redispatch after a lost response.
CREATE FUNCTION public.dg_password_reserve(p_user_id uuid,p_operation_id uuid,p_generation bigint,p_kind text)
RETURNS public.dg_password_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE; op public.dg_password_operations%ROWTYPE;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  IF p_generation IS NULL OR p_generation<>s.generation THEN RAISE EXCEPTION 'password.stale_generation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=p_user_id AND active) THEN
    RAISE EXCEPTION 'password.inactive_user';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('employee_setup','admin_reset') THEN RAISE EXCEPTION 'password.invalid_kind'; END IF;
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

-- Private common transition. Unknown -> terminal requires the reconciliation wrapper.
CREATE FUNCTION public.dg_password_settle(p_user_id uuid,p_operation_id uuid,p_outcome text,p_reconciliation text)
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
    ELSIF op.kind='admin_reset' THEN
      UPDATE public.dg_password_setup_state SET reset_pending=false WHERE user_id=p_user_id;
    END IF;
  END IF;
  -- Failed resets retain reset_pending: request a NEW reset to retry, never reuse dispatch IDs.
  RETURN op;
END $$;

CREATE FUNCTION public.dg_password_finish(p_user_id uuid,p_operation_id uuid,p_outcome text)
RETURNS public.dg_password_operations LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.dg_password_settle(p_user_id,p_operation_id,p_outcome,NULL);
$$;

-- Trusted reconciliation is an attestation, not automatic proof. Reference an incident
-- or provider result, never credentials. Time elapsed alone is not acceptable evidence.
CREATE FUNCTION public.dg_password_reconcile(p_user_id uuid,p_operation_id uuid,p_outcome text,p_evidence_reference text)
RETURNS public.dg_password_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_evidence_reference IS NULL OR length(btrim(p_evidence_reference)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'password.evidence_required';
  END IF;
  RETURN public.dg_password_settle(p_user_id,p_operation_id,p_outcome,p_evidence_reference);
END $$;

DO $$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.dg_password_lock_state(uuid)',
    'public.dg_password_request_reset(uuid,uuid)',
    'public.dg_password_reserve(uuid,uuid,bigint,text)',
    'public.dg_password_settle(uuid,uuid,text,text)',
    'public.dg_password_finish(uuid,uuid,text)',
    'public.dg_password_reconcile(uuid,uuid,text,text)'
  ] LOOP
    EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,anon,authenticated,service_role';
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.dg_password_request_reset(uuid,uuid),
  public.dg_password_reserve(uuid,uuid,bigint,text),public.dg_password_finish(uuid,uuid,text),
  public.dg_password_reconcile(uuid,uuid,text,text) TO service_role;

COMMIT;
