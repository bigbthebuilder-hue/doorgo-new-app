-- Real PostgreSQL roles and transitions; all fixture changes roll back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'doorgo_password_test' OR session_user<>'postgres'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432
 OR current_setting('cluster_name')<>'doorgo_password_isolated' THEN RAISE EXCEPTION 'Isolated cluster required'; END IF;
END $$;
CREATE TEMP TABLE actors AS SELECT user_id,row_number() OVER(ORDER BY user_id) n
FROM public.dg_user_profiles WHERE active AND must_change_password;
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
DO $$ BEGIN PERFORM pg_temp.check_it((SELECT count(*)=2 FROM actors),'two fixtures'); END $$;
CREATE FUNCTION pg_temp.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test.injected_failure'; END $$;
UPDATE public.dg_user_profiles SET must_change_password=false;
CREATE TEMP TABLE original_profiles AS SELECT * FROM public.dg_user_profiles;
CREATE TRIGGER require_test_failure BEFORE UPDATE ON public.dg_user_profiles
FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_failure();
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); BEGIN
 BEGIN PERFORM public.dg_password_require_change(u); RAISE EXCEPTION 'Expected failure';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test.injected_failure' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state),'lazy state/generation rolled back');
 PERFORM pg_temp.check_it(NOT EXISTS((SELECT * FROM public.dg_user_profiles EXCEPT SELECT * FROM original_profiles)
 UNION ALL(SELECT * FROM original_profiles EXCEPT SELECT * FROM public.dg_user_profiles)),'profile unchanged on failure');
END $$;
DROP TRIGGER require_test_failure ON public.dg_user_profiles;
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); v uuid:=(SELECT user_id FROM actors WHERE n=2);
 a uuid:='61000000-0000-4000-8000-000000000001'; b uuid:='61000000-0000-4000-8000-000000000002'; g bigint;
BEGIN
 SET LOCAL ROLE service_role;
 g:=public.dg_password_require_change(u);
 RESET ROLE;
 PERFORM pg_temp.check_it(g=2,'first request advances lazy generation');
 PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u)
 AND (SELECT setup_required AND NOT reset_pending FROM public.dg_password_setup_state WHERE user_id=u),'both requirements, no pending reset');
 PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.dg_password_operations),'no operation/reset created');
 PERFORM pg_temp.check_it(NOT(SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=v)
 AND NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state WHERE user_id=v),'other user unchanged');
 PERFORM pg_temp.check_it(public.dg_password_require_change(u)=3,'each successful repeat advances once');
 PERFORM public.dg_password_reserve(u,a,3,'employee_setup');
 PERFORM public.dg_password_finish(u,a,'succeeded');
 PERFORM public.dg_password_require_change(u);
 PERFORM public.dg_password_finish(u,a,'succeeded');
 PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u)
 AND (SELECT setup_required AND generation=4 FROM public.dg_password_setup_state WHERE user_id=u),'old receipt cannot clear');
 PERFORM public.dg_password_reserve(u,b,4,'employee_setup');
 PERFORM public.dg_password_require_change(u);
 PERFORM pg_temp.check_it((SELECT state='reserved' AND generation=4 FROM public.dg_password_operations WHERE operation_id=b),'reserved unchanged');
 BEGIN PERFORM public.dg_password_reserve(u,gen_random_uuid(),5,'employee_setup'); RAISE EXCEPTION 'Expected unresolved';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.write_unresolved' THEN RAISE; END IF; END;
 PERFORM public.dg_password_finish(u,b,'unknown');
 PERFORM public.dg_password_require_change(u);
 PERFORM pg_temp.check_it((SELECT state='unknown' AND generation=4 FROM public.dg_password_operations WHERE operation_id=b),'unknown unchanged');
 BEGIN PERFORM public.dg_password_reserve(u,gen_random_uuid(),6,'employee_setup'); RAISE EXCEPTION 'Expected unknown blockade';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.write_unresolved' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_password_finish(u,b,'succeeded'); RAISE EXCEPTION 'Expected reconciliation';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.reconciliation_required' THEN RAISE; END IF; END;
 PERFORM public.dg_password_reconcile(u,b,'succeeded','synthetic trusted evidence');
 PERFORM pg_temp.check_it((SELECT state='superseded' FROM public.dg_password_operations WHERE operation_id=b)
 AND (SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'stale reconciliation cannot clear');
 PERFORM public.dg_password_request_reset(u,gen_random_uuid());
 SELECT generation INTO g FROM public.dg_password_setup_state WHERE user_id=u;
 BEGIN PERFORM public.dg_password_require_change(u); RAISE EXCEPTION 'Expected pending reset';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.reset_pending' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_it((SELECT generation=g AND reset_pending FROM public.dg_password_setup_state WHERE user_id=u),'pending reset unchanged');
 UPDATE public.dg_user_profiles SET active=false WHERE user_id=v;
 BEGIN PERFORM public.dg_password_require_change(v); RAISE EXCEPTION 'Expected inactive';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.inactive_user' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state WHERE user_id=v),'inactive lazy initialization rolled back');
 BEGIN PERFORM public.dg_password_require_change('61000000-0000-4000-8000-000000000099'); RAISE EXCEPTION 'Expected missing';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.user_not_found' THEN RAISE; END IF; END;
END $$;
DO $$ DECLARE role_name text; u uuid; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOR u IN SELECT user_id FROM actors LOOP
   -- Fixed subject: exercises own and other-user requests under both ordinary roles.
   PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM actors WHERE n=1),true);
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   BEGIN PERFORM public.dg_password_require_change(u); RAISE EXCEPTION 'Unexpected execution';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   RESET ROLE;
  END LOOP;
 END LOOP;
 PERFORM pg_temp.check_it(NOT has_function_privilege('authenticated','public.dg_password_require_change(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.dg_password_require_change(uuid)','EXECUTE')
 AND has_function_privilege('service_role','public.dg_password_require_change(uuid)','EXECUTE'),'restricted grants');
END $$;
ROLLBACK;
\echo 'Requirement-only atomicity, generations, stale/reserved/unknown, eligibility and role tests passed.'
