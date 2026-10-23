-- Stage 4A rollback-only tests. Run through run-password-atomic.mjs test.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'doorgo_password_test' OR session_user<>'postgres'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432
 OR current_setting('cluster_name')<>'doorgo_password_isolated' THEN RAISE EXCEPTION 'Isolated cluster required'; END IF;
END $$;
CREATE TEMP TABLE actors AS SELECT user_id,row_number() OVER(ORDER BY user_id) n
FROM public.dg_user_profiles p WHERE active AND must_change_password
AND NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state s WHERE s.user_id=p.user_id) LIMIT 2;
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test.injected_failure'; END $$;
DO $$ BEGIN PERFORM pg_temp.check_it((SELECT count(*)=2 FROM actors),'two preserved fixtures'); END $$;
-- Begin with an already-completed profile so reset must actually change the flag.
UPDATE public.dg_user_profiles SET must_change_password=false WHERE user_id IN(SELECT user_id FROM actors);
CREATE TEMP TABLE original_profiles AS SELECT * FROM public.dg_user_profiles;
-- Failure AFTER state/profile writes but BEFORE pending-operation insertion must undo all.
CREATE TRIGGER password_test_failure BEFORE INSERT ON public.dg_password_operations
FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_failure();
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); BEGIN
  BEGIN PERFORM public.dg_password_request_reset(u,'50000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Expected injected reset failure';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test.injected_failure' THEN RAISE; END IF; END;
  PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state),'reset initialization rolled back');
  PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.dg_password_operations),'reset operation rolled back');
  PERFORM pg_temp.check_it(NOT EXISTS((SELECT * FROM public.dg_user_profiles EXCEPT SELECT * FROM original_profiles)
    UNION ALL (SELECT * FROM original_profiles EXCEPT SELECT * FROM public.dg_user_profiles)),'entire profiles unchanged');
END $$;
DROP TRIGGER password_test_failure ON public.dg_password_operations;
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); v uuid:=(SELECT user_id FROM actors WHERE n=2);
  a uuid:='50000000-0000-4000-8000-000000000001'; b uuid:='50000000-0000-4000-8000-000000000002'; op public.dg_password_operations;
BEGIN
  SET LOCAL ROLE service_role;
  op:=public.dg_password_request_reset(u,a);
  RESET ROLE;
  PERFORM pg_temp.check_it(op.generation=2 AND op.state='pending','new reset');
  PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u)
    AND (SELECT setup_required AND reset_pending FROM public.dg_password_setup_state WHERE user_id=u),'reset sets both requirements');
  PERFORM pg_temp.check_it(NOT (SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=v),'other profile untouched');
  PERFORM public.dg_password_reserve(u,a,2,'admin_reset');PERFORM public.dg_password_finish(u,a,'succeeded');
  PERFORM public.dg_password_reserve(u,b,2,'employee_setup');
END $$;
CREATE TEMP TABLE before_completion AS SELECT * FROM public.dg_password_operations;
-- Fail profile completion after operation/internal updates: all must roll back.
CREATE TRIGGER password_test_failure BEFORE UPDATE ON public.dg_user_profiles
FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_failure();
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); BEGIN
  BEGIN PERFORM public.dg_password_finish(u,'50000000-0000-4000-8000-000000000002','succeeded');
    RAISE EXCEPTION 'Expected completion failure';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test.injected_failure' THEN RAISE; END IF; END;
  PERFORM pg_temp.check_it((SELECT setup_required FROM public.dg_password_setup_state WHERE user_id=u),'internal completion rolled back');
  PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'profile remains required');
  PERFORM pg_temp.check_it(NOT EXISTS((SELECT * FROM public.dg_password_operations EXCEPT SELECT * FROM before_completion)
    UNION ALL (SELECT * FROM before_completion EXCEPT SELECT * FROM public.dg_password_operations)),'operation finalization rolled back');
END $$;
DROP TRIGGER password_test_failure ON public.dg_user_profiles;
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); v uuid:=(SELECT user_id FROM actors WHERE n=2);
  b uuid:='50000000-0000-4000-8000-000000000002'; stamp timestamptz; op public.dg_password_operations;
BEGIN
  BEGIN PERFORM public.dg_password_finish(v,b,'succeeded');RAISE EXCEPTION 'Expected mismatch';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.operation_mismatch' THEN RAISE; END IF; END;
  PERFORM public.dg_password_finish(u,b,'unknown');
  PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'unknown cannot clear');
  BEGIN PERFORM public.dg_password_finish(u,b,'succeeded');RAISE EXCEPTION 'Expected reconciliation';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.reconciliation_required' THEN RAISE; END IF; END;
  PERFORM public.dg_password_reconcile(u,b,'failed','synthetic definitive rejection');
  PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'failed cannot clear');
  b:='50000000-0000-4000-8000-000000000003';
  PERFORM public.dg_password_reserve(u,b,2,'employee_setup');
  SET LOCAL ROLE service_role;
  op:=public.dg_password_finish(u,b,'succeeded');
  RESET ROLE;
  SELECT password_changed_at INTO stamp FROM public.dg_user_profiles WHERE user_id=u;
  PERFORM pg_temp.check_it(stamp=op.settled_at AND NOT (SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u)
    AND NOT (SELECT setup_required FROM public.dg_password_setup_state WHERE user_id=u),'atomic completion and timestamp');
  PERFORM public.dg_password_finish(u,b,'succeeded');
  PERFORM pg_temp.check_it((SELECT password_changed_at=stamp FROM public.dg_user_profiles WHERE user_id=u),'duplicate timestamp stable');
  PERFORM public.dg_password_request_reset(u,'50000000-0000-4000-8000-000000000004');
  PERFORM public.dg_password_finish(u,b,'succeeded');
  PERFORM pg_temp.check_it((SELECT must_change_password AND password_changed_at=stamp FROM public.dg_user_profiles WHERE user_id=u),'old receipt cannot clear new reset');
  UPDATE public.dg_user_profiles SET active=false WHERE user_id=v;
  BEGIN PERFORM public.dg_password_request_reset(v,'50000000-0000-4000-8000-000000000005');RAISE EXCEPTION 'Expected inactive rejection';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.inactive_user' THEN RAISE; END IF; END;
  PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state WHERE user_id=v),'inactive request leaves no state');
END $$;
DO $$ DECLARE r text; u uuid:=(SELECT user_id FROM actors WHERE n=1); BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  EXECUTE format('SET LOCAL ROLE %I',r);
  BEGIN PERFORM public.dg_password_request_reset(u,'50000000-0000-4000-8000-000000000099');RAISE EXCEPTION 'Unauthorized reset succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.dg_password_finish(u,'50000000-0000-4000-8000-000000000003','succeeded');RAISE EXCEPTION 'Unauthorized completion succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
 END LOOP;
END $$;
ROLLBACK;
\echo 'Atomic reset/completion and injected-failure rollback cases passed.'
