import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Emit a SELECT-only regression using the exact migration query, with inline
// fixture relations and stubbed boundaries for the existing exception helpers.
const migration = readFileSync(new URL('../supabase/migrations/20261110000000_resolve_bridge_capacity_from_staff.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const body = migration.split('AS $$\n')[1].split(';\n$$;')[0];
const helpers = {
  dg_staff_away_is_working_day: "c.production_date <> DATE '2026-11-07'",
  dg_capacity_exception_is_closed: "c.production_date = DATE '2026-11-11'",
  dg_capacity_override_value: "CASE WHEN c.production_date = DATE '2026-11-12' THEN 9::numeric END",
  dg_special_day_capacity: "CASE WHEN c.production_date = DATE '2026-11-13' THEN 5::numeric END",
  dg_staff_away_deduction: "CASE c.production_date WHEN DATE '2026-11-10' THEN 4::numeric ELSE 0::numeric END",
};
let fixtureBody = body
  .replace(/public\.(dg_\w+)(?![\w(])/g, '$1')
  .replace(/\bp_start\b/g, "DATE '2026-10-27'")
  .replace(/\bp_end_exclusive\b/g, "DATE '2026-11-15'");
for (const [helper, expression] of Object.entries(helpers)) {
  const call = `public.${helper}(shop.location, c.production_date)`;
  assert.ok(fixtureBody.includes(call), helper);
  fixtureBody = fixtureBody.replace(call, `(${expression})`);
}
console.log(`WITH dg_user_profiles(company_location, active, created_at) AS (
  VALUES ('default', true, DATE '2026-01-01')
), dg_capacity_staff(staff_id, company_location, active) AS (
  VALUES (1,'default',true),(2,'default',true),(3,'default',true),
         (4,'default',true),(5,'default',false),(6,'other',true)
), dg_staff_capacity_versions(staff_id, capacity_version_id, capacity_role, effective_from) AS (
  SELECT i, i, CASE WHEN i=4 THEN 'support' ELSE 'direct_production' END, DATE '2026-08-25'
  FROM generate_series(1,6) i
  UNION ALL SELECT i, 10+i, 'direct_production', DATE '2026-10-29' FROM generate_series(1,3) i
  UNION ALL SELECT 3, 23, 'direct_production', DATE '2026-11-09'
), dg_staff_capacity_weekdays AS (
  SELECT capacity_version_id, weekday,
    CASE capacity_version_id WHEN 1 THEN 7 WHEN 2 THEN 7 WHEN 3 THEN 5
      WHEN 11 THEN 6.5 WHEN 12 THEN 6.5 WHEN 13 THEN 4 WHEN 23 THEN 3 ELSE 20 END AS productive_hours
  FROM dg_staff_capacity_versions CROSS JOIN generate_series(0,6) weekday
  WHERE NOT (capacity_version_id = 23 AND weekday = 6)
), fixtures(production_date, available_hours, deduction_hours, capacity_source, details, expected_hours, expected_deductions) AS (
  VALUES
    (DATE '2026-10-27',18,0,'calculated','{}'::jsonb,18,0),
    (DATE '2026-10-28',18,0,'calculated','{}',19,0),
    (DATE '2026-10-29',18,0,'calculated','{}',17,0),
    (DATE '2026-11-07',18,0,'calculated','{}',18,0),
    (DATE '2026-11-09',18,0,'calculated','{}',16,0),
    (DATE '2026-11-10',11,7,'calculated','{"native_capacity_layers_applied":true,"native_capacity_bridge_deduction_hours":2}',10,6),
    (DATE '2026-11-11',0,0,'closure','{}',0,0),
    (DATE '2026-11-12',9,0,'override','{}',9,0),
    (DATE '2026-11-13',5,0,'calculated','{}',5,0),
    (DATE '2026-11-14',18,0,'calculated','{}',18,0)
), dg_daily_capacity AS (
  SELECT fixtures.*, 18::numeric AS staff_capacity_hours, capacity_source='closure' AS is_closed,
    NULL::text AS notes, 'apps-script-bridge' AS source_system,
    NULL::timestamptz AS calculated_at, NULL::timestamptz AS mirrored_at,
    NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at
  FROM fixtures
), actual AS (
${fixtureBody}
)
SELECT count(*) AS cases, count(*) FILTER (WHERE a.production_date IS NULL
  OR a.available_hours IS DISTINCT FROM f.expected_hours
  OR a.deduction_hours IS DISTINCT FROM f.expected_deductions
  OR a.capacity_source IS DISTINCT FROM f.capacity_source) AS failures
FROM fixtures f LEFT JOIN actual a USING (production_date);`);
