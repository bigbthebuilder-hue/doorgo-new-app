-- Runtime authorization test. Requires a separately prepared, disposable local
-- doorgo_notes_test with the effective business schema, this migration and at
-- least one active Calendar-use employee and one Calendar item. NOT the minimal
-- password-operation bootstrap. No migration application or fixture creation here.
-- psql -X -v ON_ERROR_STOP=1 -f scripts/verify-business-access-local.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'doorgo_notes_test' OR inet_server_addr() IS NULL
    OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
    OR inet_server_port()=5432 THEN RAISE EXCEPTION 'Requires isolated loopback test database'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_calendar_items) THEN RAISE EXCEPTION 'Missing populated Calendar fixture'; END IF;
END $$;
CREATE TEMP TABLE business_actor AS SELECT p.user_id FROM public.dg_user_profiles p
  JOIN public.dg_user_permissions a ON a.user_id=p.user_id
  WHERE p.active AND NOT p.must_change_password AND a.permission_key='calendar' AND a.access_level='use' LIMIT 1;
DO $$ BEGIN IF (SELECT count(*) FROM business_actor)<>1 THEN RAISE EXCEPTION 'Missing active Calendar-use fixture'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub',user_id::text,true) FROM business_actor;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated')::text,true) FROM business_actor;

CREATE FUNCTION pg_temp.check_business_denied() RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; arguments text; checked integer:=0; t record; row_count bigint;
BEGIN
  IF public.dg_business_eligible() THEN RAISE EXCEPTION 'Restricted employee considered eligible'; END IF;
  -- Invoke real wrapped RPCs with typed nulls: eligibility must run before original
  -- argument validation, DECLARE initializers, exception handlers or mutations.
  FOR f IN SELECT p.oid,p.proname,p.proargtypes FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND position('PERFORM public.dg_require_business_access();' in p.prosrc)>0
  LOOP
    SELECT string_agg('NULL::'||format_type(type_oid,NULL),',' ORDER BY ordinal) INTO arguments
      FROM unnest(f.proargtypes::oid[]) WITH ORDINALITY AS args(type_oid,ordinal);
    BEGIN
      EXECUTE format('SELECT public.%I(%s)',f.proname,coalesce(arguments,''));
      RAISE EXCEPTION 'Unexpected RPC success: %',f.proname;
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM<>'business.access_required' THEN RAISE; END IF;
    END;
    checked:=checked+1;
  END LOOP;
  IF checked<>31 THEN RAISE EXCEPTION 'Expected 31 wrapped boundaries, got %',checked; END IF;
  FOR t IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='dg_business_setup_complete' LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I',t.tablename) INTO row_count;
      IF row_count<>0 THEN RAISE EXCEPTION 'Business SELECT leaked rows: %',t.tablename; END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM<>'business.access_required' THEN RAISE; END IF;
    END;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Own profile must remain readable';
  END IF;
END $$;

UPDATE public.dg_user_profiles SET must_change_password=true WHERE user_id=(SELECT user_id FROM business_actor);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_business_denied();
RESET ROLE;
UPDATE public.dg_user_profiles SET active=false,must_change_password=false WHERE user_id=(SELECT user_id FROM business_actor);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_business_denied();
RESET ROLE;
UPDATE public.dg_user_profiles SET active=true,must_change_password=false WHERE user_id=(SELECT user_id FROM business_actor);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT public.dg_business_eligible() THEN RAISE EXCEPTION 'Eligible employee denied'; END IF;
  IF public.dg_calendar_require_use(false)<>auth.uid() THEN RAISE EXCEPTION 'Calendar use changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_calendar_items) THEN RAISE EXCEPTION 'Calendar SELECT permission changed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.dg_business_eligible();
    RAISE EXCEPTION 'Anonymous helper execution allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Business RPC/RLS authorization checks passed; fixture changes rolled back.'
