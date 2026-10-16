-- Local fixture-dependent runtime tests. No migration application; all changes roll back.
-- Use run-password-database.mjs test with explicit isolated connection parameters.
-- Requires migration through 20261016120000 and two active profiles requiring setup,
-- neither previously initialized in dg_password_setup_state. Run as local test owner.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'doorgo_password_test' OR session_user<>'postgres'
    OR inet_server_addr() IS NULL OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
    OR inet_server_port()=5432 OR current_setting('cluster_name')<>'doorgo_password_isolated' THEN
    RAISE EXCEPTION 'Requires isolated local doorgo_password_test';
  END IF;
END $$;
CREATE TEMP TABLE actors AS SELECT user_id, row_number() OVER(ORDER BY user_id) AS n
FROM public.dg_user_profiles p WHERE active AND must_change_password
AND NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state s WHERE s.user_id=p.user_id) LIMIT 2;
DO $$ BEGIN IF (SELECT count(*) FROM actors)<>2 THEN RAISE EXCEPTION 'Two unused active setup-required profile fixtures required'; END IF; END $$;
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM=message THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected error: %',message;
END $$;

DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); v uuid:=(SELECT user_id FROM actors WHERE n=2);
  a uuid:='00000000-0000-4000-8000-000000000001'; b uuid:='00000000-0000-4000-8000-000000000002';
  c uuid:='00000000-0000-4000-8000-000000000003'; d uuid:='00000000-0000-4000-8000-000000000004';
  e uuid:='00000000-0000-4000-8000-000000000005'; f uuid:='00000000-0000-4000-8000-000000000006';
  op public.dg_password_operations; stamp timestamptz;
BEGIN
  op:=public.dg_password_reserve(u,a,1,'employee_setup');
  PERFORM pg_temp.check_it(op.state='reserved','reservation before Auth');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_reserve(%L,%L,1,''employee_setup'')',u,b),'password.write_unresolved');
  op:=public.dg_password_request_reset(u,b);
  PERFORM pg_temp.check_it(op.generation=2 AND op.state='pending','reset increments without dispatch');
  op:=public.dg_password_request_reset(u,b);
  PERFORM pg_temp.check_it(op.generation=2,'reset request retry does not increment');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_reserve(%L,%L,2,''admin_reset'')',u,b),'password.write_unresolved');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_finish(%L,%L,''succeeded'')',v,a),'password.operation_mismatch');
  op:=public.dg_password_finish(u,a,'unknown');
  PERFORM pg_temp.check_it(op.state='unknown' AND op.settled_at IS NULL,'unknown remains unresolved');
  -- Age is not evidence. Force a very old timestamp and confirm the block remains.
  UPDATE public.dg_password_operations SET created_at='2000-01-01' WHERE operation_id=a;
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_reserve(%L,%L,2,''admin_reset'')',u,b),'password.write_unresolved');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_finish(%L,%L,''succeeded'')',u,a),'password.reconciliation_required');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_reconcile(%L,%L,''succeeded'',NULL)',u,a),'password.evidence_required');
  op:=public.dg_password_reconcile(u,a,'succeeded','local-test-confirmed-response');
  PERFORM pg_temp.check_it(op.state='superseded','stale success settles but cannot complete');
  PERFORM pg_temp.check_it((SELECT setup_required AND reset_pending FROM public.dg_password_setup_state WHERE user_id=u),'new requirement retained');
  stamp:=op.settled_at;
  op:=public.dg_password_finish(u,a,'succeeded');
  PERFORM pg_temp.check_it(op.settled_at=stamp AND op.state='superseded','duplicate stale result idempotent');
  op:=public.dg_password_reserve(u,b,2,'admin_reset');
  op:=public.dg_password_finish(u,b,'failed');
  PERFORM pg_temp.check_it(op.state='failed','definitive failure');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_reserve(%L,%L,2,''employee_setup'')',u,c),'password.setup_unavailable');
  op:=public.dg_password_request_reset(u,c);
  op:=public.dg_password_request_reset(u,d);
  PERFORM pg_temp.check_it(op.generation=4,'competing reset advances generation');
  PERFORM pg_temp.check_it((SELECT state='superseded' FROM public.dg_password_operations WHERE operation_id=c),'older pending reset superseded');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_reserve(%L,%L,3,''admin_reset'')',u,c),'password.stale_generation');
  op:=public.dg_password_reserve(u,d,4,'admin_reset');
  op:=public.dg_password_finish(u,d,'succeeded');
  PERFORM pg_temp.check_it((SELECT setup_required AND NOT reset_pending FROM public.dg_password_setup_state WHERE user_id=u),'admin success still requires employee setup');
  op:=public.dg_password_reserve(u,e,4,'employee_setup');
  op:=public.dg_password_finish(u,e,'succeeded'); stamp:=op.settled_at;
  op:=public.dg_password_finish(u,e,'succeeded');
  PERFORM pg_temp.check_it(op.settled_at=stamp,'duplicate finalization idempotent');
  PERFORM pg_temp.check_it((SELECT NOT setup_required FROM public.dg_password_setup_state WHERE user_id=u),'current employee success completes internal state');
  PERFORM pg_temp.check_it((SELECT must_change_password FROM public.dg_user_profiles WHERE user_id=u),'active profile flag unchanged in Stage 1');
  op:=public.dg_password_request_reset(u,f);
  op:=public.dg_password_finish(u,e,'succeeded');
  PERFORM pg_temp.check_it((SELECT generation=5 AND setup_required FROM public.dg_password_setup_state WHERE user_id=u),'duplicate old finalization cannot clear later reset');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_request_reset(%L,%L)',v,f),'password.operation_mismatch');
  PERFORM pg_temp.expect_error(format('SELECT public.dg_password_finish(%L,%L,''failed'')',u,e),'password.conflicting_outcome');
  -- A separate user remains independent.
  op:=public.dg_password_reserve(v,'00000000-0000-4000-8000-000000000007',1,'employee_setup');
  PERFORM pg_temp.check_it(op.state='reserved','cross-user independent reservation');
  op:=public.dg_password_finish(v,op.operation_id,'unknown');
  op:=public.dg_password_reconcile(v,op.operation_id,'failed','local-test-definitive-noncommit');
  PERFORM pg_temp.check_it(op.state='failed','unknown can reconcile to definitive failure');
  op:=public.dg_password_reserve(v,'00000000-0000-4000-8000-000000000009',1,'employee_setup');
  PERFORM pg_temp.check_it(op.state='reserved','employee retry after definitive failure');
  -- The unique index also protects against accidental privileged direct inserts.
  BEGIN
    INSERT INTO public.dg_password_operations(operation_id,user_id,generation,kind,state)
      VALUES('00000000-0000-4000-8000-000000000010',v,1,'employee_setup','reserved');
    RAISE EXCEPTION 'Expected unique unresolved-write constraint';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- Every new function denies ordinary roles; helpers also deny service_role.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'dg_password_%' LOOP
    PERFORM pg_temp.check_it(NOT has_function_privilege('authenticated',f.oid,'EXECUTE'),'authenticated denied '||f.proname);
    PERFORM pg_temp.check_it(NOT has_function_privilege('anon',f.oid,'EXECUTE'),'anon denied '||f.proname);
    PERFORM pg_temp.check_it(has_function_privilege('service_role',f.oid,'EXECUTE') =
      (f.proname NOT IN ('dg_password_lock_state','dg_password_settle')),'trusted grant '||f.proname);
  END LOOP;
END $$;
DO $$ DECLARE role_name text; table_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH table_name IN ARRAY ARRAY['public.dg_password_setup_state','public.dg_password_operations'] LOOP
      PERFORM pg_temp.check_it(NOT has_table_privilege(role_name,table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        'no direct table access: '||role_name||' '||table_name);
    END LOOP;
  END LOOP;
END $$;
DO $$ BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.dg_password_finish(NULL,NULL,'succeeded');
    RAISE EXCEPTION 'Ordinary RPC invocation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
END $$;
-- Real service-role execution, with fixture selection done before dropping role.
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); op public.dg_password_operations;
BEGIN
  SET LOCAL ROLE service_role;
  op:=public.dg_password_request_reset(u,'00000000-0000-4000-8000-000000000008');
  IF op.state<>'pending' THEN RAISE EXCEPTION 'Trusted RPC failed'; END IF;
  RESET ROLE;
END $$;
ROLLBACK;
\echo 'Password operation SQL cases passed (rolled back).'
