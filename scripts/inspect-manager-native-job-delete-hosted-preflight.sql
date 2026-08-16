-- Read-only: relationship and collision preflight for manager native-job deletion.
SELECT conrelid::regclass::text AS referencing_table, conname, pg_catalog.pg_get_constraintdef(oid) AS definition
FROM pg_catalog.pg_constraint
WHERE contype = 'f' AND confrelid = 'public.dg_native_jobs'::regclass
ORDER BY 1,2;

SELECT table_name,column_name,data_type
FROM information_schema.columns
WHERE table_schema='public' AND column_name IN ('internal_job_id','native_job_id','job_id','booking_id')
ORDER BY table_name,column_name;

SELECT job.internal_job_id, job.visible_identifier, booking.booking_id, booking.job_id
FROM public.dg_native_jobs AS job
JOIN public.dg_production_bookings AS booking ON booking.job_id = ANY(ARRAY[
  job.internal_job_id::text,job.visible_identifier,job.biztrack_sales_order,job.door_go_reference,job.legacy_job_id
]::text[])
ORDER BY job.internal_job_id,booking.booking_id;

SELECT pg_catalog.to_regprocedure('public.dg_delete_native_job(uuid,bigint)') AS existing_delete_rpc;
