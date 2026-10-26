-- Rollback-only Stage 4B tests, after local cutover migration application.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'doorgo_password_test' OR session_user<>'postgres'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432
 OR current_setting('cluster_name')<>'doorgo_password_isolated' THEN RAISE EXCEPTION 'Isolated cluster required'; END IF;
 IF to_regprocedure('public.complete_dg_initial_password_setup()') IS NOT NULL THEN RAISE EXCEPTION 'Legacy authority still exists'; END IF;
END $$;
CREATE TEMP TABLE actors AS SELECT user_id,row_number() OVER(ORDER BY user_id) n
FROM public.dg_user_profiles p WHERE active AND must_change_password
AND NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state s WHERE s.user_id=p.user_id) LIMIT 2;
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
DO $$ DECLARE r text; u uuid:=(SELECT user_id FROM actors WHERE n=1); v uuid:=(SELECT user_id FROM actors WHERE n=2); target uuid;
BEGIN
 PERFORM pg_temp.check_it((SELECT count(*)=2 FROM actors),'two preserved fixtures');
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  EXECUTE format('SET LOCAL ROLE %I',r);
  BEGIN EXECUTE 'SELECT public.complete_dg_initial_password_setup()'; RAISE EXCEPTION 'Legacy call unexpectedly succeeded';
  EXCEPTION WHEN undefined_function THEN NULL; END;
  FOREACH target IN ARRAY ARRAY[u,v] LOOP
   BEGIN PERFORM public.dg_password_finish(target,'60000000-0000-4000-8000-000000000001','succeeded'); RAISE EXCEPTION 'Unauthorized completion succeeded';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN UPDATE public.dg_user_profiles SET must_change_password=false WHERE user_id=target; RAISE EXCEPTION 'Unauthorized profile write succeeded';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  RESET ROLE;
 END LOOP;
 PERFORM pg_temp.check_it((SELECT bool_and(must_change_password) FROM public.dg_user_profiles WHERE user_id IN(u,v)),'session and cross-user attempts cannot clear flags');
END $$;
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); v uuid:=(SELECT user_id FROM actors WHERE n=2);
 a uuid:='60000000-0000-4000-8000-000000000001'; b uuid:='60000000-0000-4000-8000-000000000002';
BEGIN
 SET LOCAL ROLE service_role;
 PERFORM public.dg_password_reserve(u,a,1,'employee_setup');
 BEGIN PERFORM public.dg_password_finish(v,a,'succeeded');RAISE EXCEPTION 'Expected operation mismatch';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.operation_mismatch' THEN RAISE; END IF; END;
 PERFORM public.dg_password_finish(u,a,'unknown');
 BEGIN PERFORM public.dg_password_finish(u,a,'succeeded');RAISE EXCEPTION 'Expected unknown rejection';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.reconciliation_required' THEN RAISE; END IF; END;
 RESET ROLE;
 PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'unknown remains required');
 SET LOCAL ROLE service_role;
 PERFORM public.dg_password_request_reset(u,b);
 PERFORM public.dg_password_reconcile(u,a,'succeeded','synthetic settled response');
 RESET ROLE;
 PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'stale reconciled success cannot clear');
 SET LOCAL ROLE service_role;
 PERFORM public.dg_password_reserve(u,b,2,'admin_reset');PERFORM public.dg_password_finish(u,b,'succeeded');
 a:='60000000-0000-4000-8000-000000000004';
 PERFORM public.dg_password_reserve(u,a,2,'employee_setup');PERFORM public.dg_password_finish(u,a,'failed');
 RESET ROLE;
 PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'failed employee outcome cannot clear');
 SET LOCAL ROLE service_role;
 a:='60000000-0000-4000-8000-000000000003';
 PERFORM public.dg_password_reserve(u,a,2,'employee_setup');PERFORM public.dg_password_finish(u,a,'succeeded');
 RESET ROLE;
 PERFORM pg_temp.check_it((SELECT NOT must_change_password FROM public.dg_user_profiles WHERE user_id=u)
   AND (SELECT NOT setup_required FROM public.dg_password_setup_state WHERE user_id=u),'trusted current-generation completion preserved');
 PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=v),'other user unchanged');
END $$;
ROLLBACK;
\echo 'Legacy authority removed; session/cross-user denial and trusted completion passed.'
