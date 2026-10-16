-- FRESH DISPOSABLE CLUSTER ONLY. Run through run-password-database.mjs bootstrap.
-- No data overwrite, database drop, credentials, or hosted configuration.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'doorgo_password_test' OR session_user<>'postgres'
    OR inet_server_addr() IS NULL OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
    OR inet_server_port()=5432 OR current_setting('cluster_name')<>'doorgo_password_isolated' THEN
    RAISE EXCEPTION 'Fresh isolated password test cluster required';
  END IF;
  -- Held across the actual migrations' own transaction boundaries until psql disconnects.
  IF NOT pg_try_advisory_lock(20261016,120000) THEN RAISE EXCEPTION 'Bootstrap already running'; END IF;
  IF EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN ('postgres','template0','template1','doorgo_password_test'))
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname<>'postgres' AND rolname NOT LIKE 'pg\_%' ESCAPE '\')
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg\_%' ESCAPE '\')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') THEN
    RAISE EXCEPTION 'Requires fresh cluster/database; existing objects will not be overwritten';
  END IF;
END $$;

CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;

-- TEST-ONLY stand-ins, not a reproduction of Supabase Auth:
-- users supplies only the real profile FK target; uid supplies the policy dependency.
-- No passwords, login/session issuance, JWT verification, or Auth writes are modeled.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
REVOKE ALL ON auth.users FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
COMMIT;

-- Execute unchanged repository definitions, including the historical completion RPC.
-- That historical RPC is a prerequisite artifact, not invoked or certified by these tests.
BEGIN;
\ir ../supabase/migrations/20260712000000_create_dg_user_profiles.sql
COMMIT;
\ir ../supabase/migrations/20260712020000_add_dg_password_setup_requirement.sql
\ir ../supabase/migrations/20261016120000_password_operation_foundation.sql

BEGIN;
INSERT INTO auth.users(id) VALUES
  ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
INSERT INTO public.dg_user_profiles(user_id,display_name,active,is_manager,must_change_password) VALUES
  ('20000000-0000-4000-8000-000000000001','Synthetic setup employee',true,false,true),
  ('20000000-0000-4000-8000-000000000002','Synthetic setup manager',true,true,true);
COMMIT;
\echo 'Fresh local password fixtures prepared. No Auth service is configured.'
