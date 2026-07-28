-- EMERGENCY USE ONLY.
-- Authorized only before native application data becomes authoritative.
-- This removes exactly the objects introduced by 20260728000000_create_native_job_persistence.sql.

BEGIN;

REVOKE ALL ON FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dg_archive_native_job(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dg_get_native_job(uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated;

DROP FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb);
DROP FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb);
DROP FUNCTION public.dg_archive_native_job(uuid,bigint,text);
DROP FUNCTION public.dg_get_native_job(uuid,boolean);
DROP FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid);

DROP TABLE public.dg_native_job_create_commands;
DROP TABLE public.dg_native_job_lines;
DROP TABLE public.dg_native_jobs;
DROP SEQUENCE public.dg_native_job_reference_seq;

COMMIT;
