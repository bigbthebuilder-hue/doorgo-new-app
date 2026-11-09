// Static SQL/security preservation guards; not database execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read = file => fs.readFileSync(file,'utf8');
const file = 'supabase/migrations/20261102130000_calendar_shared_staff_away_read.sql';
const sql = read(file).replace(/--[^\n]*/g,'');
assert.equal((sql.match(/CREATE FUNCTION/g)??[]).length,1);
assert.match(sql,/CREATE FUNCTION public.load_calendar_staff_away_range\(p_start date,p_end_exclusive date\)/);
assert.match(sql,/SECURITY DEFINER SET search_path='' STABLE/);
assert.match(sql,/v_actor uuid:=auth.uid\(\)/);
assert.match(sql,/IF v_actor IS NULL[\s\S]*authentication_required/);
assert.match(sql,/PERFORM public.dg_require_business_access\(\)/);
assert.match(sql,/p.user_id=v_actor AND p.active=true/);
assert.match(sql,/p.permission_key='calendar' AND p.access_level IN \('view','use'\)/);
assert.match(sql,/p_end_exclusive-p_start>370/);
assert.match(sql,/'companyLocation',a.company_location,'inEditScope',a.company_location=v_location/);
assert.match(sql,/WHERE public.dg_staff_away_is_working_day\(a.company_location,d.day\)/);
assert.match(sql,/ELSE public.dg_staff_away_full_day_impact\(a.staff_id,d.day\) END/);
assert.match(sql,/WHERE a.deleted_at IS NULL AND a.start_date<p_end_exclusive AND a.end_date>=p_start/);
assert.doesNotMatch(sql,/WHERE a.company_location=v_location|dg_staff_away_scope\(|is_manager|permission_key='jobs'/);
assert.match(sql,/FROM public.dg_capacity_staff s WHERE s.company_location=v_location AND s.active/);
assert.match(sql,/ALTER FUNCTION public.load_calendar_staff_away_range\(date,date\) OWNER TO postgres/);
assert.match(sql,/REVOKE ALL ON FUNCTION public.load_calendar_staff_away_range\(date,date\) FROM PUBLIC,anon,authenticated,service_role/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public.load_calendar_staff_away_range\(date,date\) TO authenticated/);
assert.doesNotMatch(sql,/CREATE (?:OR REPLACE|POLICY|TABLE|TRIGGER)|INSERT INTO|UPDATE public|DELETE FROM|GRANT SELECT/);
assert.match(read('lib/calendar/staff-away-queries.ts'),/rpc\('load_calendar_staff_away_range'/);
assert.doesNotMatch(read('lib/calendar/staff-away-queries.ts'),/rpc\('load_staff_away_calendar_range'/);
assert.match(read('components/calendar/StaffAwayEditor.tsx'),/const canEdit=canEditStaffAwayPeriod\(canUseCalendar,card\)/);
assert.match(read('components/calendar/StaffAwayEditor.tsx'),/Location: \{card.staffAwayCompanyLocation\}/);

// Pin historical authoritative scope/mutation/capacity SQL and actions. A new
// Calendar read projection must never be used to rewrite these shared boundaries.
const unchanged = {
  'supabase/migrations/20260825040000_add_staff_away_operations.sql':'3fb4d40383e51555462384333a1f2904cea58f5dea11c8133b92f90bf5773c3f',
  'supabase/migrations/20261006201036_calendar_operational_permissions.sql':'63eae59202004ca8a9a50a2290954881851fc1a62d91e07ffb878169a333d47e',
  'supabase/migrations/20261009153600_staff_away_capacity_drag_max.sql':'51e3eae9d02ef54474afc7457a227b2d39628a8957ca4c83fa4ade6dad335b03',
  'lib/calendar/staff-away-actions.ts':'be271cca62d6ffcd8570b0a48a4556ce1f42762a261b76b598727153378a730b',
  'lib/production-board/capacity-queries.ts':'c2f7d68f1ebed384260f4a1d29f780acdf98cc159f722a5ce5b125c454ddd693',
  'lib/production-board/capacity-normalize.ts':'6a10300e44c8a01c8787e921ce3330d480066da304fbf26659808b8468b58d18',
  'lib/production-board/normalize.ts':'abc9df609df7b8b9b20dae405ad6fa5b4bacb2b2879c8b356e359a602bd18b00',
};
for (const [file,hash] of Object.entries(unchanged)) assert.equal(crypto.createHash('sha256').update(read(file).replace(/\r\n/g,'\n')).digest('hex'),hash,file+': preserve existing mutation/scope/capacity authority');
console.log('PASS: Calendar-only Staff Away SQL projection, own-location occurrences, scoped roster/ACLs, and unchanged historical scope/edit/capacity authority (static checks, not SQL execution).');
