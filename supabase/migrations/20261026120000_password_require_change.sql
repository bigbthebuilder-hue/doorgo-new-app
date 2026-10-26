-- Stage 4C-1: inactive, trusted requirement-only transition. No Auth dispatch.
BEGIN;
CREATE FUNCTION public.dg_password_require_change(p_user_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dg_password_setup_state%ROWTYPE;
BEGIN
  s := public.dg_password_lock_state(p_user_id);
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=p_user_id AND active) THEN
    RAISE EXCEPTION 'password.inactive_user';
  END IF;
  -- Do not cancel, supersede or strand an existing administrative reset.
  IF s.reset_pending THEN RAISE EXCEPTION 'password.reset_pending'; END IF;
  UPDATE public.dg_password_setup_state SET generation=generation+1,setup_required=true
    WHERE user_id=p_user_id RETURNING * INTO s;
  UPDATE public.dg_user_profiles SET must_change_password=true,updated_at=pg_catalog.clock_timestamp()
    WHERE user_id=p_user_id;
  -- Existing reserved/unknown writes remain unresolved, including older generations.
  -- Every successful invocation advances once; retries are safe but not idempotent.
  RETURN s.generation;
END $$;
ALTER FUNCTION public.dg_password_require_change(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_password_require_change(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dg_password_require_change(uuid) TO service_role;
COMMIT;
