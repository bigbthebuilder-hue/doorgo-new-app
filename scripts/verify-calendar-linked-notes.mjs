import assert from 'node:assert/strict';
import fs from 'node:fs';

// Static regression guard only. Runtime authorization is exercised by the SQL companion.
const file = 'supabase/migrations/20261102120000_calendar_view_linked_fulfillment_notes.sql';
const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
assert.match(sql, /^BEGIN; CREATE OR REPLACE FUNCTION public\.calendar_linked_fulfillment_notes\(p_internal_job_ids uuid\[\]\)/);
assert.match(sql, /LANGUAGE plpgsql SECURITY DEFINER SET search_path=''/);
assert.match(sql, /PERFORM public\.dg_require_business_access\(\);/);
assert.match(sql, /p.access_level IN \('view','use'\)/);
assert.match(sql, /IF p_internal_job_ids IS NULL THEN RETURN; END IF;/);
assert.match(sql, /WHERE job\.internal_job_id = ANY\(p_internal_job_ids\) AND job\.archived_at IS NULL AND EXISTS \( SELECT 1 FROM public\.dg_calendar_items item WHERE item\.linked_internal_job_id = job\.internal_job_id AND item\.item_type IN \('delivery', 'customer_pickup'\) AND item\.deleted_at IS NULL \);/);
assert.doesNotMatch(sql, /completed_at|salesperson|created_by_user_id|company_location/);
assert.match(sql, /ALTER FUNCTION public\.calendar_linked_fulfillment_notes\(uuid\[\]\) OWNER TO postgres;/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.calendar_linked_fulfillment_notes\(uuid\[\]\) FROM PUBLIC, anon;/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.calendar_linked_fulfillment_notes\(uuid\[\]\) TO authenticated; COMMIT;$/);
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
console.log('Calendar linked-notes static contract passed (not database authorization proof).');
