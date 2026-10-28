-- CUTOVER ONLY: drain old administration requests and deploy compatible callers.
-- Explicit same-session acknowledgement; not an application flag or readiness proof.
-- Only two obsolete DoorGo function ACLs are changed. No role memberships change.
BEGIN;
DO $$
DECLARE signature text;
BEGIN
  IF current_setting('doorgo.legacy_admin_cutover',true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'users.legacy_cutover_approval_required';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.dg_password_employee_snapshot(uuid)',
    'public.dg_password_request_reset(uuid,uuid)',
    'public.dg_password_reserve(uuid,uuid,bigint,text)',
    'public.dg_password_finish(uuid,uuid,text)',
    'public.dg_password_require_change(uuid)',
    'public.dg_password_deactivate(uuid)',
    'public.dg_password_request_reactivation(uuid,uuid)',
    'public.dg_require_business_access()',
    'public.dg_admin_set_user_active(uuid,boolean)',
    'public.dg_admin_require_password_change(uuid)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'users.cutover_prerequisite_missing: %',signature;
    END IF;
  END LOOP;
  -- Retirement belongs to its separate migration; never drop it here.
  IF to_regprocedure('public.complete_dg_initial_password_setup()') IS NOT NULL THEN
    RAISE EXCEPTION 'users.legacy_completion_retirement_required';
  END IF;
END $$;

-- No trusted caller needs these generation-unaware writers either. RESTRICT
-- deliberately refuses dependent grants rather than cascading into unknown ACLs.
REVOKE ALL ON FUNCTION public.dg_admin_set_user_active(uuid,boolean),
  public.dg_admin_require_password_change(uuid)
  FROM PUBLIC,anon,authenticated,service_role RESTRICT;

DO $$
DECLARE signature text; client_name text; client_oid oid; target_oid oid;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.dg_admin_set_user_active(uuid,boolean)',
    'public.dg_admin_require_password_change(uuid)'
  ] LOOP
    target_oid := to_regprocedure(signature);
    FOREACH client_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      client_oid := to_regrole(client_name);
      IF client_oid IS NULL THEN RAISE EXCEPTION 'users.cutover_role_missing: %',client_name; END IF;
      IF has_function_privilege(client_oid,target_oid,'EXECUTE') OR EXISTS (
        -- MEMBER is intentionally conservative: also reject non-inherited member
        -- roles that could retain access after a role switch. Do not alter roles.
        SELECT 1 FROM pg_catalog.pg_roles r
        WHERE pg_has_role(client_oid,r.oid,'MEMBER')
          AND has_function_privilege(r.oid,target_oid,'EXECUTE')
      ) THEN
        RAISE EXCEPTION 'users.legacy_execution_remains: % / %',client_name,signature;
      END IF;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
