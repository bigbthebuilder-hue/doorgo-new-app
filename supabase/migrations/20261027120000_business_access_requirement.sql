-- CUTOVER ONLY: deploy with compatible password setup, never by an unattended push.
-- Does not apply/drop the separately guarded legacy-completion migration.
BEGIN;
DO $$ BEGIN
  IF current_setting('doorgo.business_access_cutover',true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'business.cutover_approval_required';
  END IF;
END $$;

-- No caller-selected identity, session tracking or module-permission replacement.
CREATE FUNCTION public.dg_business_eligible() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dg_user_profiles p
    WHERE p.user_id = auth.uid() AND p.active AND p.must_change_password IS FALSE
  );
$$;
ALTER FUNCTION public.dg_business_eligible() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_business_eligible() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dg_business_eligible() TO authenticated,service_role;

CREATE FUNCTION public.dg_require_business_access() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.dg_business_eligible() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='business.access_required';
  END IF;
END;
$$;
ALTER FUNCTION public.dg_require_business_access() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_require_business_access() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dg_require_business_access() TO authenticated,service_role;

-- Wrap the EFFECTIVE definitions, including historical dynamic patches, without
-- copying or replacing domain bodies. Explicit allowlist; fail on missing objects,
-- overloads, unexpected language/body, or repeat application. Existing ownership,
-- grants, configuration, arguments and module checks are retained by CREATE OR REPLACE.
-- The outer block runs before original DECLARE initializers/exception handlers.
-- Trigger/internal capacity functions and trusted password operations are excluded.
DO $patch$
DECLARE
  name text;
  count_found integer;
  target record;
  definition text;
  replacement text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'dg_calendar_require_use', 'dg_settings_scope', 'dg_staff_away_scope',
    'dg_calendar_exception_scope',
    'create_production_flow_checkpoint', 'revise_production_flow_checkpoint',
    'void_production_flow_checkpoint', 'read_production_flow_checkpoint_day',
    'read_recent_production_flow_checkpoint_history', 'read_recent_production_recovery_bookings',
    'move_production_booking_to_today', 'reschedule_production_booking',
    'complete_production_booking', 'reopen_production_booking',
    'reorder_production_day', 'reorder_production_needs_attention', 'place_production_booking',
    'dg_create_native_job', 'dg_update_native_job', 'dg_archive_native_job',
    'dg_get_native_job', 'dg_list_native_jobs', 'dg_create_transferred_native_job',
    'dg_delete_native_job', 'search_calendar_linkable_jobs',
    'calendar_place_production_booking', 'calendar_complete_production_booking',
    'calendar_reopen_production_booking', 'calendar_reschedule_production_booking',
    'calendar_reorder_production_day', 'calendar_reorder_production_needs_attention'
  ] LOOP
    SELECT count(*) INTO count_found FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=name;
    IF count_found<>1 THEN RAISE EXCEPTION 'business.unexpected_function: %',name; END IF;
    SELECT p.oid,p.prosrc,l.lanname INTO STRICT target FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid=p.prolang
      WHERE n.nspname='public' AND p.proname=name;
    IF target.lanname<>'plpgsql'
      OR target.prosrc !~* '^\s*(DECLARE|BEGIN)\M'
      OR target.prosrc !~* 'END\s*;?\s*$'
      OR position('dg_require_business_access' in target.prosrc)>0 THEN
      RAISE EXCEPTION 'business.unexpected_body: %',name;
    END IF;
    definition:=pg_catalog.pg_get_functiondef(target.oid);
    IF (length(definition)-length(replace(definition,target.prosrc,'')))<>length(target.prosrc) THEN
      RAISE EXCEPTION 'business.ambiguous_body: %',name;
    END IF;
    replacement:=E'\nBEGIN\n  PERFORM public.dg_require_business_access();\n'
      || regexp_replace(target.prosrc, ';?\s*$', '') || E';\nEND;\n';
    EXECUTE replace(definition,target.prosrc,replacement);
  END LOOP;
END;
$patch$;

-- Restrictive policies AND with the existing permissive module/location policies.
-- Own profile/permission reads stay available for setup. No service-role policy or
-- table grant changes. Older shared tables without local DDL remain a coverage gap.
DO $policies$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'dg_calendar_items', 'dg_calendar_item_events',
    'dg_fulfillment_order_portions', 'dg_calendar_item_orders',
    'dg_production_booking_delete_events',
    'dg_capacity_staff', 'dg_staff_capacity_versions', 'dg_staff_capacity_weekdays',
    'dg_company_workweek_versions', 'dg_company_workweek_weekdays',
    'dg_staff_away_periods', 'dg_staff_away_events',
    'dg_company_calendar_settings', 'dg_capacity_closures', 'dg_special_days',
    'dg_special_day_staff', 'dg_regional_holiday_settings', 'dg_capacity_overrides',
    'dg_capacity_exception_events'
  ] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n
      ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=name AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'business.expected_rls_table: %',name;
    END IF;
    EXECUTE format('CREATE POLICY dg_business_setup_complete ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.dg_business_eligible())',name);
  END LOOP;
END;
$policies$;
COMMIT;
