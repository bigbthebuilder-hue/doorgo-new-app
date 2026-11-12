import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Provide an installed PGlite package path. This verifier uses only disposable in-memory data.');
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]));
const db = new PGlite();
const listSql = readFileSync('supabase/migrations/20260730000000_add_legacy_transfer_persistence.sql','utf8');
const list = listSql.slice(listSql.indexOf('CREATE OR REPLACE FUNCTION public.dg_list_native_jobs('), listSql.indexOf('ALTER FUNCTION public.dg_list_native_jobs('))
  .replace('BEGIN\n', 'BEGIN\n  PERFORM public.dg_require_business_access();\n');
try {
  await db.exec([
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;",
    "CREATE FUNCTION fixture_job() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-4000-8000-000000000002'::uuid$$;",
    "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-4000-8000-000000000001'::uuid$$;",
    "CREATE FUNCTION dg_require_business_access() RETURNS void LANGUAGE plpgsql AS $$BEGIN IF current_setting('fixture.business',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'business_access_required'; END IF; END;$$;",
    "CREATE FUNCTION parse_production_booking_date(text) RETURNS date LANGUAGE sql IMMUTABLE AS $$SELECT $1::date$$;",
    "CREATE TABLE dg_user_profiles(user_id uuid,active boolean);",
    "CREATE TABLE dg_user_permissions(user_id uuid,permission_key text,access_level text);",
    "CREATE TABLE dg_native_jobs(internal_job_id uuid PRIMARY KEY,biztrack_sales_order text,door_go_reference text,legacy_job_id text,legacy_identifier_kind text,visible_identifier text,visible_identifier_kind text,origin text DEFAULT 'native',revision int DEFAULT 1,lifecycle_stage text DEFAULT 'Draft',customer text,site_address text,salesperson text,fulfillment_plan text,delivery_date date,customer_pickup_date date,archived_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),CONSTRAINT dg_native_jobs_lifecycle CHECK(lifecycle_stage IN ('Draft','Confirmed Job')));",
    "CREATE TABLE dg_native_job_lines(internal_job_id uuid,line_status text);",
    "CREATE TABLE dg_production_bookings(booking_id text,linked_internal_job_id uuid,job_id text,production_date text,booking_kind text DEFAULT 'production',deleted_at timestamptz,cancelled_at timestamptz,status text DEFAULT 'active',schedule_status text DEFAULT 'confirmed',board_visible boolean DEFAULT true,completed_at timestamptz);",
    "CREATE TABLE dg_calendar_items(item_id uuid PRIMARY KEY,linked_internal_job_id uuid,current_portion_id uuid,item_type text,deleted_at timestamptz,completed_at timestamptz,scheduled_date date);",
    "CREATE TABLE dg_fulfillment_order_portions(portion_id uuid PRIMARY KEY,linked_internal_job_id uuid,deleted_at timestamptz);",
    "CREATE TABLE dg_calendar_item_orders(item_id uuid,portion_id uuid,send_on_completion boolean DEFAULT true);",
    "INSERT INTO dg_user_profiles VALUES (auth.uid(),true);",
    "INSERT INTO dg_user_permissions VALUES (auth.uid(),'jobs','view'),(auth.uid(),'calendar','view'); SET fixture.business='yes';",
    "INSERT INTO dg_native_jobs(internal_job_id,lifecycle_stage,visible_identifier,salesperson) VALUES (fixture_job(),'Confirmed Job','SO-1','Aaron');",
  ].join('\n'));
  await db.exec(list);
  await db.exec('REVOKE ALL ON FUNCTION dg_list_native_jobs(boolean,integer,timestamptz,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION dg_list_native_jobs(boolean,integer,timestamptz,uuid) TO authenticated;');
  const before = (await db.query('SELECT to_jsonb(j) AS value FROM dg_native_jobs j')).rows;
  const aclQuery = "SELECT proacl::text, proowner FROM pg_proc WHERE oid='dg_list_native_jobs(boolean,integer,timestamptz,uuid)'::regprocedure";
  const acl = (await db.query(aclQuery)).rows;
  await db.exec(readFileSync('supabase/migrations/20261112152017_organize_jobs_and_complete_confirmed.sql','utf8'));
  assert.deepEqual((await db.query('SELECT to_jsonb(j) AS value FROM dg_native_jobs j')).rows, before);
  assert.deepEqual((await db.query(aclQuery)).rows, acl);
  const expectComplete = async (expected, message) => assert.equal((await db.query('SELECT dg_job_production_is_complete(fixture_job()) AS value')).rows[0].value, expected, message);
  await expectComplete(false,'no production items keeps a Confirmed Job active');
  await db.exec("INSERT INTO dg_production_bookings(booking_id,linked_internal_job_id,production_date) VALUES ('booking',fixture_job(),'2026-11-12')");
  await expectComplete(false,'unfinished production remains active');
  await db.exec("UPDATE dg_production_bookings SET completed_at=now()");
  await expectComplete(true,'completed production finishes the Jobs grouping');
  await db.exec("INSERT INTO dg_production_bookings(booking_id,linked_internal_job_id,production_date) VALUES ('second',fixture_job(),'2026-11-13')");
  await expectComplete(false,'one unfinished production item keeps a multiple-item job active');
  await db.exec("UPDATE dg_production_bookings SET completed_at=now() WHERE booking_id='second'");
  await expectComplete(true,'all required production items complete');
  await db.exec("UPDATE dg_production_bookings SET completed_at=null WHERE booking_id='booking'");
  await expectComplete(false,'reopening any production returns the job to active');
  await db.exec("UPDATE dg_production_bookings SET completed_at=now()");
  await db.exec("UPDATE dg_native_jobs SET lifecycle_stage='Draft'");
  await expectComplete(false,'Draft stays active even with all production complete');
  await db.exec("UPDATE dg_native_jobs SET lifecycle_stage='Confirmed Job',fulfillment_plan='Delivery',delivery_date='2026-11-14'");
  await expectComplete(true,'outstanding configured Delivery does not affect Jobs grouping');
  await db.exec("INSERT INTO dg_calendar_items VALUES('00000000-0000-4000-8000-000000000003',fixture_job(),null,'delivery',null,null,null)");
  await expectComplete(true,'unscheduled unfinished Delivery does not block completed production');
  await db.exec("INSERT INTO dg_fulfillment_order_portions VALUES('00000000-0000-4000-8000-000000000004',fixture_job(),null); INSERT INTO dg_calendar_items VALUES('00000000-0000-4000-8000-000000000005',null,'00000000-0000-4000-8000-000000000004','customer_pickup',null,null,null)");
  await expectComplete(true,'outstanding Pickup and backorders do not affect Jobs grouping');
  await db.exec("UPDATE dg_calendar_items SET completed_at=now()");
  await expectComplete(true,'fulfillment completion does not change production grouping');
  await db.exec("UPDATE dg_calendar_items SET completed_at=null");
  await expectComplete(true,'fulfillment reopening does not change production grouping');
  await db.exec("UPDATE dg_production_bookings SET completed_at=null WHERE booking_id='booking'; UPDATE dg_calendar_items SET completed_at=now()");
  await expectComplete(false,'completed fulfillment cannot complete unfinished production');
  await db.exec("UPDATE dg_production_bookings SET completed_at=now(); INSERT INTO dg_production_bookings(booking_id,linked_internal_job_id,production_date,cancelled_at) VALUES ('cancelled',fixture_job(),'2026-11-15',now())");
  await expectComplete(true,'cancelled production does not block remaining completed production');
  await db.exec("INSERT INTO dg_production_bookings(booking_id,linked_internal_job_id,production_date,deleted_at) VALUES ('deleted',fixture_job(),'2026-11-15',now())");
  await expectComplete(true,'deleted production does not block remaining completed production');
  await db.exec("UPDATE dg_production_bookings SET linked_internal_job_id=null,job_id='SO-1' WHERE booking_id='booking'");
  await expectComplete(true,'existing legacy visible-identifier link remains supported');
  await db.exec("UPDATE dg_production_bookings SET deleted_at=now() WHERE booking_id IN ('booking','second')");
  await expectComplete(false,'no remaining required production stays active');
  await db.exec("UPDATE dg_production_bookings SET deleted_at=null WHERE booking_id IN ('booking','second')");
  assert.equal((await db.query('SELECT dg_list_native_jobs() AS value')).rows[0].value.items[0].is_complete,true);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT dg_job_production_is_complete(fixture_job())'),/permission denied/);
  const authorizedList = async () => (await db.query('SELECT dg_list_native_jobs() AS value')).rows[0].value;
  assert.equal((await authorizedList()).items[0].is_complete,true,'Jobs View receives the computed result');
  await db.exec("RESET ROLE; UPDATE dg_user_permissions SET access_level='use' WHERE permission_key='jobs'; SET ROLE authenticated");
  assert.equal((await authorizedList()).items[0].is_complete,true,'Jobs Use receives the same result');
  await db.exec("RESET ROLE; UPDATE dg_user_permissions SET access_level='none' WHERE permission_key='jobs'; SET ROLE authenticated");
  await assert.rejects(authorizedList(),/permission_required/);
  await db.exec("RESET ROLE; UPDATE dg_user_permissions SET access_level='view' WHERE permission_key='jobs'; UPDATE dg_user_profiles SET active=false; SET ROLE authenticated");
  await assert.rejects(authorizedList(),/active_profile_required/);
  await db.exec("RESET ROLE; UPDATE dg_user_profiles SET active=true; SET fixture.business='no'; SET ROLE authenticated");
  await assert.rejects(authorizedList(),/business_access_required/);
  console.log('Production-only Jobs PostgreSQL regressions passed: Drafts, no/multiple production items, reopening, fulfillment independence, cancelled/deleted work, legacy links, permissions and preserved records.');
} finally {
  await db.close();
}
