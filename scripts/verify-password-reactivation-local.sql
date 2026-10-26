-- Actual roles/transitions in disposable PostgreSQL; no Auth service. Rollback only.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'doorgo_password_test' OR session_user<>'postgres'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432
 OR current_setting('cluster_name')<>'doorgo_password_isolated' THEN RAISE EXCEPTION 'Isolated cluster required'; END IF;
END $$;
CREATE TEMP TABLE actors AS SELECT user_id,row_number() OVER(ORDER BY user_id) n FROM public.dg_user_profiles;
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.fail_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test.injected'; END $$;
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=1); v uuid:=(SELECT user_id FROM actors WHERE n=2);
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); op public.dg_password_operations; g bigint;
BEGIN
 PERFORM pg_temp.check_it((SELECT count(*)=2 FROM actors),'original fixtures');
 BEGIN PERFORM public.dg_password_request_reactivation(u,a);RAISE EXCEPTION 'Expected inactive only';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.inactive_target_required' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_password_deactivate(gen_random_uuid());RAISE EXCEPTION 'Expected missing';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.user_not_found' THEN RAISE; END IF; END;
 SET LOCAL ROLE service_role;
 g:=public.dg_password_deactivate(u);
 op:=public.dg_password_request_reactivation(u,a);
 RESET ROLE;
 PERFORM pg_temp.check_it(g=2 AND op.generation=3 AND op.kind='reactivation' AND op.state='pending','trusted request and generation');
 PERFORM pg_temp.check_it((SELECT NOT active AND must_change_password FROM public.dg_user_profiles WHERE user_id=u),'inactive required');
 PERFORM pg_temp.check_it((SELECT setup_required AND reset_pending FROM public.dg_password_setup_state WHERE user_id=u),'internal required');
 op:=public.dg_password_request_reactivation(u,a);
 PERFORM pg_temp.check_it(op.generation=3,'same request ID idempotent');
 BEGIN PERFORM public.dg_password_request_reactivation(v,a);RAISE EXCEPTION 'Expected mismatch';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.operation_mismatch' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dg_password_reserve(u,a,3,'admin_reset');RAISE EXCEPTION 'Expected inactive rejection';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.inactive_user' THEN RAISE; END IF; END;
 SET LOCAL ROLE service_role;
 op:=public.dg_password_reserve(u,a,3,'reactivation');
 RESET ROLE;
 PERFORM pg_temp.check_it(op.state='reserved','inactive reservation');
 op:=public.dg_password_request_reactivation(u,b);
 BEGIN PERFORM public.dg_password_reserve(u,b,op.generation,'reactivation');RAISE EXCEPTION 'Expected unresolved';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.write_unresolved' THEN RAISE; END IF; END;
 op:=public.dg_password_finish(u,a,'succeeded');
 PERFORM pg_temp.check_it(op.state='superseded' AND (SELECT NOT active FROM public.dg_user_profiles WHERE user_id=u),'older request cannot activate');
 PERFORM public.dg_password_reserve(u,b,4,'reactivation');
 PERFORM public.dg_password_finish(u,b,'unknown');
 BEGIN PERFORM public.dg_password_finish(u,b,'succeeded');RAISE EXCEPTION 'Expected reconciliation';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.reconciliation_required' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_it((SELECT NOT active FROM public.dg_user_profiles WHERE user_id=u),'unknown stays inactive');
 BEGIN PERFORM public.dg_password_reconcile(u,b,'succeeded','');RAISE EXCEPTION 'Expected evidence';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.evidence_required' THEN RAISE; END IF; END;
 SET LOCAL ROLE service_role;
 op:=public.dg_password_reconcile(u,b,'succeeded','synthetic confirmed provider outcome');
 RESET ROLE;
 PERFORM pg_temp.check_it(op.state='succeeded' AND (SELECT active AND must_change_password FROM public.dg_user_profiles WHERE user_id=u)
 AND (SELECT setup_required AND NOT reset_pending FROM public.dg_password_setup_state WHERE user_id=u),'trusted reconciliation activates, setup stays required');
 PERFORM public.dg_password_finish(u,b,'succeeded');
 PERFORM public.dg_password_deactivate(u);
 PERFORM public.dg_password_finish(u,b,'succeeded');
 PERFORM pg_temp.check_it((SELECT NOT active FROM public.dg_user_profiles WHERE user_id=u),'duplicate receipt cannot reactivate');
 g:=public.dg_password_deactivate(u);
 PERFORM pg_temp.check_it(g=6,'repeat deactivation advances');
 a:=gen_random_uuid();op:=public.dg_password_request_reactivation(u,a);
 PERFORM public.dg_password_reserve(u,a,op.generation,'reactivation');
 PERFORM public.dg_password_finish(u,a,'failed');
 PERFORM pg_temp.check_it((SELECT NOT active FROM public.dg_user_profiles WHERE user_id=u),'failure stays inactive');
 a:=gen_random_uuid();op:=public.dg_password_request_reactivation(u,a);
 PERFORM public.dg_password_reserve(u,a,op.generation,'reactivation');
 PERFORM public.dg_password_finish(u,a,'unknown');
 PERFORM public.dg_password_deactivate(u);
 PERFORM pg_temp.check_it((SELECT state='unknown' FROM public.dg_password_operations WHERE operation_id=a),'deactivation preserves unknown');
 op:=public.dg_password_reconcile(u,a,'succeeded','synthetic stale success');
 PERFORM pg_temp.check_it(op.state='superseded' AND (SELECT NOT active FROM public.dg_user_profiles WHERE user_id=u),'stale reconciliation stays inactive');
 -- Cross-kind exclusion: an employee write survives deactivation and blocks reactivation.
 a:=gen_random_uuid();PERFORM public.dg_password_reserve(v,a,1,'employee_setup');
 PERFORM public.dg_password_deactivate(v);
 b:=gen_random_uuid();op:=public.dg_password_request_reactivation(v,b);
 BEGIN PERFORM public.dg_password_reserve(v,b,op.generation,'reactivation');RAISE EXCEPTION 'Expected cross-kind block';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.write_unresolved' THEN RAISE; END IF; END;
 op:=public.dg_password_finish(v,a,'succeeded');
 PERFORM pg_temp.check_it(op.state='superseded' AND (SELECT NOT active FROM public.dg_user_profiles WHERE user_id=v),'employee never activates');
 -- Even legacy active toggles cannot give an ordinary reset activation authority.
 UPDATE public.dg_user_profiles SET active=true WHERE user_id=v;
 a:=gen_random_uuid();op:=public.dg_password_request_reset(v,a);
 PERFORM public.dg_password_reserve(v,a,op.generation,'admin_reset');
 UPDATE public.dg_user_profiles SET active=false WHERE user_id=v;
 op:=public.dg_password_finish(v,a,'succeeded');
 PERFORM pg_temp.check_it(op.state='superseded' AND (SELECT NOT active FROM public.dg_user_profiles WHERE user_id=v),'ordinary reset never activates');
 UPDATE public.dg_user_profiles SET active=true WHERE user_id=v;
 a:=gen_random_uuid();op:=public.dg_password_request_reset(v,a);
 PERFORM public.dg_password_reserve(v,a,op.generation,'admin_reset');
 PERFORM public.dg_password_deactivate(v);
 b:=gen_random_uuid();op:=public.dg_password_request_reactivation(v,b);
 BEGIN PERFORM public.dg_password_reserve(v,b,op.generation,'reactivation');RAISE EXCEPTION 'Expected admin cross-kind block';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'password.write_unresolved' THEN RAISE; END IF; END;
 PERFORM public.dg_password_finish(v,a,'failed');
END $$;
-- Inject an error after internal settlement updates; all updates must roll back.
CREATE TEMP TABLE success_case AS SELECT user_id,gen_random_uuid() op FROM actors WHERE n=1;
DO $$ DECLARE c record; op public.dg_password_operations; BEGIN
 SELECT * INTO c FROM success_case;
 op:=public.dg_password_request_reactivation(c.user_id,c.op);
 PERFORM public.dg_password_reserve(c.user_id,c.op,op.generation,'reactivation');
END $$;
CREATE TRIGGER reactivation_failure BEFORE UPDATE ON public.dg_user_profiles FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_profile();
DO $$ DECLARE c record; BEGIN SELECT * INTO c FROM success_case;
 BEGIN PERFORM public.dg_password_finish(c.user_id,c.op,'succeeded');RAISE EXCEPTION 'Expected rollback';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test.injected' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_it((SELECT state='reserved' FROM public.dg_password_operations WHERE operation_id=c.op)
 AND (SELECT reset_pending FROM public.dg_password_setup_state WHERE user_id=c.user_id)
 AND (SELECT NOT active FROM public.dg_user_profiles WHERE user_id=c.user_id),'atomic success rollback');
END $$;
DROP TRIGGER reactivation_failure ON public.dg_user_profiles;
DO $$ DECLARE c record; role_name text; u uuid; BEGIN
 SELECT * INTO c FROM success_case;
 SET LOCAL ROLE service_role;
 PERFORM public.dg_password_finish(c.user_id,c.op,'succeeded');
 RESET ROLE;
 PERFORM pg_temp.check_it((SELECT active AND must_change_password FROM public.dg_user_profiles WHERE user_id=c.user_id),'successful finish');
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOR u IN SELECT user_id FROM actors LOOP
   PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM actors WHERE n=1),true);
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   BEGIN PERFORM public.dg_password_deactivate(u);RAISE EXCEPTION 'Unexpected deactivate';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   BEGIN PERFORM public.dg_password_request_reactivation(u,gen_random_uuid());RAISE EXCEPTION 'Unexpected request';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   RESET ROLE;
  END LOOP;
 END LOOP;
END $$;
CREATE TEMP TABLE before_deactivation_profiles AS TABLE public.dg_user_profiles;
CREATE TEMP TABLE before_deactivation_state AS TABLE public.dg_password_setup_state;
CREATE TEMP TABLE before_deactivation_ops AS TABLE public.dg_password_operations;
CREATE TRIGGER reactivation_failure BEFORE UPDATE ON public.dg_user_profiles FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_profile();
DO $$ DECLARE u uuid:=(SELECT user_id FROM actors WHERE n=2); BEGIN
 BEGIN PERFORM public.dg_password_deactivate(u);RAISE EXCEPTION 'Expected deactivation rollback';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test.injected' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_it(NOT EXISTS((TABLE public.dg_user_profiles EXCEPT TABLE before_deactivation_profiles)
 UNION ALL(TABLE before_deactivation_profiles EXCEPT TABLE public.dg_user_profiles)),'deactivation profile rollback');
 PERFORM pg_temp.check_it(NOT EXISTS((TABLE public.dg_password_setup_state EXCEPT TABLE before_deactivation_state)
 UNION ALL(TABLE before_deactivation_state EXCEPT TABLE public.dg_password_setup_state)),'deactivation generation rollback');
 PERFORM pg_temp.check_it(NOT EXISTS((TABLE public.dg_password_operations EXCEPT TABLE before_deactivation_ops)
 UNION ALL(TABLE before_deactivation_ops EXCEPT TABLE public.dg_password_operations)),'pending supersession rollback');
END $$;
DROP TRIGGER reactivation_failure ON public.dg_user_profiles;
ROLLBACK;
\echo 'Reactivation SQL eligibility, grants, atomicity, cross-kind exclusion, stale/idempotent outcomes and reconciliation passed.'
