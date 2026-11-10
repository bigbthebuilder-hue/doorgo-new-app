BEGIN;

-- Read-only correction for existing bridge dates starting with the October 28
-- staff changes. Keep the stored ledger and the exception/booking write paths.
CREATE FUNCTION public.load_effective_daily_capacity(p_start date, p_end_exclusive date)
RETURNS SETOF public.dg_daily_capacity
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  WITH shop AS (
    -- Match the location used by the existing incoming-capacity trigger.
    SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location), ''), 'default') AS location
    FROM public.dg_user_profiles p
    WHERE p.active
    ORDER BY p.created_at
    LIMIT 1
  )
  SELECT
    c.production_date,
    CASE WHEN staff.hours IS NOT NULL
      THEN GREATEST(0::numeric, staff.hours - deductions.hours)
      ELSE c.available_hours END AS available_hours,
    COALESCE(staff.hours, c.staff_capacity_hours) AS staff_capacity_hours,
    COALESCE(deductions.hours, c.deduction_hours) AS deduction_hours,
    c.capacity_source, c.is_closed, c.notes, c.details, c.source_system,
    c.calculated_at, c.mirrored_at, c.created_at, c.updated_at
  FROM public.dg_daily_capacity c
  LEFT JOIN shop ON true
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(w.productive_hours) FILTER (WHERE v.capacity_role = 'direct_production') AS hours
    FROM public.dg_capacity_staff s
    LEFT JOIN LATERAL (
      SELECT version.capacity_version_id, version.capacity_role
      FROM public.dg_staff_capacity_versions version
      WHERE version.staff_id = s.staff_id AND version.effective_from <= c.production_date
      ORDER BY version.effective_from DESC
      LIMIT 1
    ) v ON true
    LEFT JOIN public.dg_staff_capacity_weekdays w
      ON w.capacity_version_id = v.capacity_version_id
      AND w.weekday = EXTRACT(DOW FROM c.production_date)
    WHERE s.active AND s.company_location = shop.location
    HAVING pg_catalog.count(*) FILTER (WHERE w.capacity_version_id IS NULL) = 0
  ) staff ON c.production_date >= DATE '2026-10-28'
    AND c.source_system = 'apps-script-bridge'
    AND c.capacity_source = 'calculated' AND NOT c.is_closed
    AND public.dg_staff_away_is_working_day(shop.location, c.production_date)
    AND NOT public.dg_capacity_exception_is_closed(shop.location, c.production_date)
    AND public.dg_capacity_override_value(shop.location, c.production_date) IS NULL
    AND public.dg_special_day_capacity(shop.location, c.production_date) IS NULL
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN c.details->>'native_capacity_layers_applied' = 'true'
        THEN COALESCE((c.details->>'native_capacity_bridge_deduction_hours')::numeric, 0)
      WHEN c.details->>'native_staff_away_applied' = 'true'
        THEN COALESCE((c.details->>'native_staff_away_baseline_deduction_hours')::numeric, 0)
      ELSE COALESCE(c.deduction_hours, 0)
      END + public.dg_staff_away_deduction(shop.location, c.production_date) AS hours
    WHERE staff.hours IS NOT NULL
  ) deductions ON true
  WHERE c.production_date >= p_start AND c.production_date < p_end_exclusive;
$$;

ALTER FUNCTION public.load_effective_daily_capacity(date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.load_effective_daily_capacity(date,date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_effective_daily_capacity(date,date) TO service_role;

COMMIT;
