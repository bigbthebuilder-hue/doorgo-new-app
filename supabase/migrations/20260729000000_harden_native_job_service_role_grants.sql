-- Remove Supabase default service-role grants from the native-job boundary.
BEGIN;

REVOKE ALL ON TABLE public.dg_native_jobs FROM service_role;
REVOKE ALL ON TABLE public.dg_native_job_lines FROM service_role;
REVOKE ALL ON TABLE public.dg_native_job_create_commands FROM service_role;
REVOKE ALL ON SEQUENCE public.dg_native_job_reference_seq FROM service_role;
REVOKE EXECUTE ON FUNCTION public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.dg_update_native_job(uuid,bigint,jsonb,jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.dg_archive_native_job(uuid,bigint,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.dg_get_native_job(uuid,boolean) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) FROM service_role;

COMMIT;
