-- CUTOVER ONLY. The active setup action still calls this RPC at preparation time.
-- Do not apply before coordinated application cutover and draining old requests.
-- An authorized operator must set doorgo.password_completion_cutover='approved'
-- on the SAME database session. This is a migration acknowledgement, not an app flag.
BEGIN;
DO $$ BEGIN
  IF current_setting('doorgo.password_completion_cutover',true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'password.cutover_approval_required';
  END IF;
  IF to_regprocedure('public.dg_password_employee_snapshot(uuid)') IS NULL
    OR to_regprocedure('public.dg_password_finish(uuid,uuid,text)') IS NULL
    OR position('password_changed_at' in pg_get_functiondef('public.dg_password_settle(uuid,uuid,text,text)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'password.atomic_completion_required';
  END IF;
END $$;
-- No legitimate future caller needs the session-only implementation, even privileged.
-- RESTRICT is deliberate: unexpected dependencies must stop cutover, never cascade.
DROP FUNCTION public.complete_dg_initial_password_setup() RESTRICT;
COMMIT;
