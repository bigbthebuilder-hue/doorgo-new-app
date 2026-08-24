BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',(SELECT p.user_id::text FROM public.dg_user_permissions p JOIN public.dg_user_permissions j ON j.user_id=p.user_id AND j.permission_key='jobs' AND j.access_level='use' WHERE p.permission_key='calendar' AND p.access_level='use' LIMIT 1),true);
SET LOCAL ROLE authenticated;

DO $probe$
DECLARE v_search jsonb;v_item public.dg_calendar_items%ROWTYPE;v_first jsonb;v_second jsonb;v_note jsonb;v_deleted jsonb;v_memberships bigint;v_job jsonb;
BEGIN
  v_search:=public.search_calendar_linkable_jobs('%','delivery',20);
  IF pg_catalog.jsonb_typeof(v_search)<>'array' THEN RAISE EXCEPTION 'probe.search_shape';END IF;
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_type='delivery' AND i.linked_internal_job_id IS NOT NULL AND i.deleted_at IS NULL AND i.completed_at IS NULL ORDER BY i.created_at LIMIT 1;
  IF FOUND THEN
    v_first:=public.schedule_linked_fulfillment(extensions.gen_random_uuid(),v_item.linked_internal_job_id,'delivery',v_item.scheduled_date,v_item.timing,v_item.fulfillment_note);
    v_second:=public.schedule_linked_fulfillment(extensions.gen_random_uuid(),v_item.linked_internal_job_id,'delivery',v_item.scheduled_date,v_item.timing,v_item.fulfillment_note);
    IF v_first->>'item_id' IS DISTINCT FROM v_second->>'item_id' THEN RAISE EXCEPTION 'probe.duplicate_reuse_failed';END IF;
    SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=(v_second->>'item_id')::uuid;SELECT count(*) INTO v_memberships FROM public.dg_calendar_item_orders m WHERE m.item_id=v_item.item_id;
    v_deleted:=public.delete_calendar_item(extensions.gen_random_uuid(),v_item.item_id,v_item.revision);
    IF v_deleted->>'replacement_item_id' IS NULL OR (SELECT count(*) FROM public.dg_calendar_item_orders m WHERE m.item_id=(v_deleted->>'replacement_item_id')::uuid)<>v_memberships THEN RAISE EXCEPTION 'probe.linked_delete_membership_failed';END IF;
    v_job:=public.dg_get_native_job(v_item.linked_internal_job_id,false);IF v_job->'job'->>'delivery_date' IS NOT NULL THEN RAISE EXCEPTION 'probe.linked_delete_job_date_failed';END IF;
  END IF;
  v_note:=public.create_calendar_item(extensions.gen_random_uuid(),'note',CURRENT_DATE,NULL,'Probe note',NULL,NULL,NULL,NULL,NULL,'Probe note','Rollback-only delete probe');
  SELECT * INTO v_item FROM public.dg_calendar_items i WHERE i.item_id=(v_note->>'id')::uuid;
  v_deleted:=public.delete_calendar_item(extensions.gen_random_uuid(),v_item.item_id,v_item.revision);
  IF v_deleted->>'item_id' IS DISTINCT FROM v_item.item_id::text OR EXISTS(SELECT 1 FROM public.dg_calendar_items i WHERE i.item_id=v_item.item_id AND i.deleted_at IS NULL) THEN RAISE EXCEPTION 'probe.note_delete_failed';END IF;
END;$probe$;

ROLLBACK;
