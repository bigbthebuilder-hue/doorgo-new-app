-- Rollback-only runtime coverage; requires the existing isolated foundation fixtures.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'doorgo_password_test' OR session_user<>'postgres'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
    OR inet_server_port()<>55432 OR current_setting('cluster_name')<>'doorgo_password_isolated'
    THEN RAISE EXCEPTION 'Requires approved isolated cluster'; END IF;
END $$;
CREATE TEMP TABLE actors AS SELECT user_id,row_number() OVER(ORDER BY user_id) n
FROM public.dg_user_profiles p WHERE active AND must_change_password
AND NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state s WHERE s.user_id=p.user_id) LIMIT 2;
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
-- Invoke under the real trusted role, not the owner; restore role even on error.
CREATE FUNCTION pg_temp.snapshot(u uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; BEGIN
  SET LOCAL ROLE service_role;
  result:=public.dg_password_employee_snapshot(u);
  RESET ROLE;
  RETURN result;
END $$;
DO $$ DECLARE u uuid; v uuid; j jsonb; before_rows jsonb;
  a uuid:='20000000-0000-4000-8000-000000000001';
  b uuid:='20000000-0000-4000-8000-000000000002';
  c uuid:='20000000-0000-4000-8000-000000000003';
  d uuid:='20000000-0000-4000-8000-000000000004';
  e uuid:='20000000-0000-4000-8000-000000000005';
BEGIN
  PERFORM pg_temp.check_it((SELECT count(*)=2 FROM actors),'two unused fixtures');
  SELECT user_id INTO u FROM actors WHERE n=1; SELECT user_id INTO v FROM actors WHERE n=2;
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j->>'user_id'=u::text AND j->>'generation'='1'
    AND jsonb_typeof(j->'generation')='string' AND (j->>'active')::boolean
    AND (j->>'must_change_password')::boolean AND (j->>'setup_required')::boolean
    AND NOT (j->>'reset_pending')::boolean AND j->'unresolved'='null'::jsonb
    AND j->'completion'='null'::jsonb,'uninitialized profile defaults, no operation');
  PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state WHERE user_id=u),'read does not initialize');
  PERFORM pg_temp.check_it(pg_temp.snapshot(NULL) IS NULL
    AND pg_temp.snapshot('ffffffff-ffff-4fff-8fff-ffffffffffff') IS NULL,'missing profile returns SQL null');
  PERFORM public.dg_password_reserve(u,a,1,'employee_setup');
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j#>>'{unresolved,operation_id}'=a::text
    AND j#>>'{unresolved,state}'='reserved' AND j->'completion'='null'::jsonb,'reserved operation');
  PERFORM public.dg_password_request_reset(u,b);
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j->>'generation'='2' AND (j->>'reset_pending')::boolean
    AND j#>>'{unresolved,generation}'='1','pending reset retains stale unresolved write');
  PERFORM public.dg_password_finish(u,a,'unknown');
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j#>>'{unresolved,state}'='unknown'
    AND j#>>'{unresolved,user_id}'=u::text,'unknown remains visible across generations');
  PERFORM public.dg_password_reconcile(u,a,'succeeded','synthetic-test-evidence');
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j->'completion'='null'::jsonb AND j->'unresolved'='null'::jsonb
    AND (j->>'reset_pending')::boolean,'superseded success excluded; pending is not unresolved');
  PERFORM public.dg_password_reserve(u,b,2,'admin_reset');
  PERFORM public.dg_password_finish(u,b,'succeeded');
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j->'completion'='null'::jsonb AND NOT (j->>'reset_pending')::boolean
    AND (j->>'setup_required')::boolean,'admin success is not employee completion');
  PERFORM public.dg_password_reserve(u,c,2,'employee_setup');
  PERFORM public.dg_password_finish(u,c,'succeeded');
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j#>>'{completion,operation_id}'=c::text
    AND j#>>'{completion,user_id}'=u::text AND j#>>'{completion,generation}'='2'
    AND j#>>'{completion,state}'='succeeded' AND j#>>'{completion,outcome}'='succeeded'
    AND NOT (j->>'setup_required')::boolean AND NOT (j->>'must_change_password')::boolean,'current employee receipt; profile completed atomically');
  PERFORM public.dg_password_reserve(v,d,1,'employee_setup');
  j:=pg_temp.snapshot(v);
  PERFORM pg_temp.check_it(j->>'user_id'=v::text AND j#>>'{unresolved,operation_id}'=d::text
    AND j->'completion'='null'::jsonb,'second user cannot inherit first user receipt');
  PERFORM pg_temp.check_it(pg_temp.snapshot(u)->'unresolved'='null'::jsonb,'first user cannot inherit second user write');
  PERFORM public.dg_password_request_reset(u,e);
  j:=pg_temp.snapshot(u);
  PERFORM pg_temp.check_it(j->>'generation'='3' AND j->'completion'='null'::jsonb
    AND (j->>'setup_required')::boolean,'old succeeded receipt excluded after reset');
  SELECT jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY user_id) FROM public.dg_user_profiles p),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY user_id) FROM public.dg_password_setup_state s),
    (SELECT jsonb_agg(to_jsonb(o) ORDER BY operation_id) FROM public.dg_password_operations o)) INTO before_rows;
  PERFORM pg_temp.snapshot(u); PERFORM pg_temp.snapshot(v);
  PERFORM pg_temp.check_it(before_rows=jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY user_id) FROM public.dg_user_profiles p),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY user_id) FROM public.dg_password_setup_state s),
    (SELECT jsonb_agg(to_jsonb(o) ORDER BY operation_id) FROM public.dg_password_operations o)),'all profile/state/operation rows unchanged by reads');
END $$;
DO $$ DECLARE r text; u uuid:=(SELECT user_id FROM actors WHERE n=1);
  v uuid:=(SELECT user_id FROM actors WHERE n=2); target uuid;
BEGIN
  PERFORM pg_temp.check_it((SELECT prosecdef AND provolatile='s' AND proowner='postgres'::regrole
    AND proconfig @> ARRAY['search_path=""'] FROM pg_proc
    WHERE oid='public.dg_password_employee_snapshot(uuid)'::regprocedure),'definer, owner, stable, empty search path');
  PERFORM pg_temp.check_it(NOT EXISTS(SELECT 1 FROM pg_proc p,
    LATERAL aclexplode(p.proacl) a WHERE p.oid='public.dg_password_employee_snapshot(uuid)'::regprocedure
    AND a.grantee=0 AND a.privilege_type='EXECUTE'),'PUBLIC denied');
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM pg_temp.check_it(NOT has_function_privilege(r,'public.dg_password_employee_snapshot(uuid)','EXECUTE'),'role denied '||r);
    PERFORM set_config('request.jwt.claim.sub',u::text,true);
    FOREACH target IN ARRAY ARRAY[u,v] LOOP
      EXECUTE format('SET LOCAL ROLE %I',r);
      BEGIN
        PERFORM public.dg_password_employee_snapshot(target);
        RAISE EXCEPTION 'Unauthorized own/cross-user execution succeeded';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      RESET ROLE;
    END LOOP;
  END LOOP;
END $$;
ROLLBACK;
-- Also succeeds inside a genuinely read-only transaction.
BEGIN READ ONLY;
SET LOCAL ROLE service_role;
SELECT public.dg_password_employee_snapshot('ffffffff-ffff-4fff-8fff-ffffffffffff') IS NULL;
ROLLBACK;
\echo 'Snapshot RPC runtime cases passed (rolled back).'
