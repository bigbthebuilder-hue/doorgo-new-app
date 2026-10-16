-- Run with psql -X -v ON_ERROR_STOP=1 -f scripts/verify-calendar-linked-notes-local.sql
-- ONLY on a separately prepared local database named doorgo_notes_test, with the
-- effective migrations applied. Connect as a local test administrator able to SET ROLE.
-- No fixtures are created in application tables. Required seeded cases are checked
-- below and missing fixtures fail rather than silently skipping authorization tests.
-- Never run against hosted Supabase. This script does not apply the migration.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'doorgo_notes_test'
     OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet)) THEN
    RAISE EXCEPTION 'Requires the isolated local doorgo_notes_test database';
  END IF;
END $$;

CREATE TEMP TABLE notes_cases(label text PRIMARY KEY, job_id uuid NOT NULL, notes text);
CREATE TEMP TABLE notes_actors(label text PRIMARY KEY, user_id uuid NOT NULL);
INSERT INTO notes_actors
SELECT 'use', p.user_id FROM public.dg_user_profiles p
JOIN public.dg_user_permissions a ON a.user_id=p.user_id AND a.permission_key='calendar' AND a.access_level='use'
WHERE p.active AND NOT EXISTS (SELECT 1 FROM public.dg_user_permissions j WHERE j.user_id=p.user_id AND j.permission_key='jobs' AND j.access_level IN ('view','use')) LIMIT 1;
INSERT INTO notes_actors
SELECT 'view', p.user_id FROM public.dg_user_profiles p
JOIN public.dg_user_permissions a ON a.user_id=p.user_id AND a.permission_key='calendar' AND a.access_level='view'
WHERE p.active LIMIT 1;

-- Delivery belongs to another user: shared Calendar access must not be owner-filtered.
INSERT INTO notes_cases SELECT 'delivery', j.internal_job_id, j.notes
FROM public.dg_native_jobs j JOIN public.dg_calendar_items i ON i.linked_internal_job_id=j.internal_job_id
WHERE j.archived_at IS NULL AND j.notes IS NOT NULL AND i.item_type='delivery' AND i.deleted_at IS NULL AND i.completed_at IS NULL
AND i.created_by_user_id <> (SELECT user_id FROM notes_actors WHERE label='use') LIMIT 1;
INSERT INTO notes_cases SELECT 'pickup', j.internal_job_id, j.notes
FROM public.dg_native_jobs j JOIN public.dg_calendar_items i ON i.linked_internal_job_id=j.internal_job_id
WHERE j.archived_at IS NULL AND j.notes IS NOT NULL AND i.item_type='customer_pickup' AND i.deleted_at IS NULL AND i.completed_at IS NULL LIMIT 1;
INSERT INTO notes_cases SELECT 'completed', j.internal_job_id, j.notes
FROM public.dg_native_jobs j JOIN public.dg_calendar_items i ON i.linked_internal_job_id=j.internal_job_id
WHERE j.archived_at IS NULL AND j.notes IS NOT NULL AND i.item_type IN ('delivery','customer_pickup') AND i.deleted_at IS NULL AND i.completed_at IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM public.dg_calendar_items x WHERE x.linked_internal_job_id=j.internal_job_id AND x.item_type IN ('delivery','customer_pickup') AND x.deleted_at IS NULL AND x.completed_at IS NULL) LIMIT 1;
INSERT INTO notes_cases SELECT 'unlinked', j.internal_job_id, j.notes FROM public.dg_native_jobs j
WHERE j.archived_at IS NULL AND j.notes IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=j.internal_job_id) LIMIT 1;
INSERT INTO notes_cases SELECT 'archived', j.internal_job_id, j.notes FROM public.dg_native_jobs j
WHERE j.archived_at IS NOT NULL AND j.notes IS NOT NULL AND EXISTS (SELECT 1 FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=j.internal_job_id AND i.item_type IN ('delivery','customer_pickup') AND i.deleted_at IS NULL) LIMIT 1;
INSERT INTO notes_cases SELECT 'deleted-only', j.internal_job_id, j.notes FROM public.dg_native_jobs j
WHERE j.archived_at IS NULL AND j.notes IS NOT NULL
AND EXISTS (SELECT 1 FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=j.internal_job_id AND i.item_type IN ('delivery','customer_pickup') AND i.deleted_at IS NOT NULL)
AND NOT EXISTS (SELECT 1 FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=j.internal_job_id AND i.item_type IN ('delivery','customer_pickup') AND i.deleted_at IS NULL) LIMIT 1;
INSERT INTO notes_cases SELECT 'note-only', j.internal_job_id, j.notes FROM public.dg_native_jobs j
WHERE j.archived_at IS NULL AND j.notes IS NOT NULL
AND EXISTS (SELECT 1 FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=j.internal_job_id AND i.item_type='note' AND i.deleted_at IS NULL)
AND NOT EXISTS (SELECT 1 FROM public.dg_calendar_items i WHERE i.linked_internal_job_id=j.internal_job_id AND i.item_type IN ('delivery','customer_pickup') AND i.deleted_at IS NULL) LIMIT 1;
DO $$ BEGIN
  IF (SELECT count(*) FROM notes_cases) <> 7 OR (SELECT count(*) FROM notes_actors) <> 2 THEN
    RAISE EXCEPTION 'Seed all seven documented Job/link cases and active Calendar-use-only / Calendar-view actors first';
  END IF;
END $$;
GRANT SELECT ON notes_cases, notes_actors TO authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::text FROM notes_actors WHERE label='use'), true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE c record; actual text; n integer; expected uuid[]; returned uuid[];
BEGIN
  FOR c IN SELECT * FROM notes_cases LOOP
    SELECT count(*), min(r.notes) INTO n, actual FROM public.calendar_linked_fulfillment_notes(ARRAY[c.job_id]) r;
    IF c.label IN ('delivery','pickup','completed') THEN
      IF n <> 1 OR actual IS DISTINCT FROM c.notes THEN RAISE EXCEPTION 'Linked note assertion failed: %', c.label; END IF;
    ELSIF n <> 0 THEN RAISE EXCEPTION 'Unauthorized note returned: %', c.label;
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT job_id ORDER BY job_id) INTO expected FROM notes_cases WHERE label IN ('delivery','pickup','completed');
  SELECT array_agg(r.internal_job_id ORDER BY r.internal_job_id) INTO returned
    FROM public.calendar_linked_fulfillment_notes((SELECT array_agg(job_id) || array_agg(job_id) FROM notes_cases)) r;
  IF returned IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Mixed/duplicate UUID batch bypassed linkage'; END IF;
  IF EXISTS (SELECT 1 FROM public.calendar_linked_fulfillment_notes(NULL))
     OR EXISTS (SELECT 1 FROM public.calendar_linked_fulfillment_notes('{}'::uuid[])) THEN RAISE EXCEPTION 'Empty input returned notes'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::text FROM notes_actors WHERE label='view'), true);
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.calendar_linked_fulfillment_notes((SELECT array_agg(job_id) FROM notes_cases));
    RAISE EXCEPTION 'View-only caller was allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'calendar_item.permission_required' THEN RAISE; END IF;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.calendar_linked_fulfillment_notes((SELECT array_agg(job_id) FROM notes_cases));
    RAISE EXCEPTION 'Missing identity was allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'calendar_item.authentication_required' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Calendar linked-notes local database authorization checks passed'
