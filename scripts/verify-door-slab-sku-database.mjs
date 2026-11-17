import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Embedded, disposable PostgreSQL only. No database URL, credentials or network.
// Supply the installed PGlite package path; do not install it into app dependencies.
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2], 'dist/index.js')).href);
const db = new PGlite();
const read = name => readFileSync('supabase/migrations/' + name, 'utf8').replaceAll('\r\n', '\n');
const actor = '33333333-3333-4333-8333-333333333333';
const job = '11111111-1111-4111-8111-111111111111';
const line = '22222222-2222-4222-8222-222222222222';
const other = '22222222-2222-4222-8222-222222222223';
async function asUser(sql, args = [], role = 'authenticated') {
  await db.exec(`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claim.sub='${actor}';`);
  try { const result = await db.query(sql, args); await db.exec('COMMIT'); return result; }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
const save = (changes, lineId = line, jobId = job) => asUser('SELECT dg_update_native_door_labels($1,$2,$3)', [jobId, lineId, changes]);
const current = async () => (await db.query('SELECT glass_calc FROM dg_native_job_lines WHERE line_id=$1', [line])).rows[0].glass_calc;
const catalog = () => db.query("SELECT oid::regprocedure::text AS name, proowner, proacl::text FROM pg_proc WHERE proname IN ('dg_update_native_door_labels','dg_update_native_job') ORDER BY proname");
try {
  const original = read('20260728000000_create_native_job_persistence.sql');
  const tables = original.slice(original.indexOf('CREATE SEQUENCE'), original.indexOf('CREATE TABLE public.dg_native_job_create_commands'));
  const source = read('20260805010000_fix_direct_dimension_update_rpc_allowlist.sql');
  const update = source.slice(source.indexOf('CREATE OR REPLACE FUNCTION'), source.indexOf('DO $post$'));
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE dg_user_profiles(user_id uuid PRIMARY KEY,active boolean,must_change_password boolean);
    CREATE TABLE dg_user_permissions(user_id uuid,permission_key text,access_level text);
    CREATE FUNCTION dg_require_business_access() RETURNS void LANGUAGE plpgsql AS $$BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=auth.uid() AND active AND NOT must_change_password)
      THEN RAISE EXCEPTION 'business.access_required'; END IF; END;$$;
    ${tables}
    ALTER TABLE dg_native_job_lines ADD COLUMN sidelight_specifications jsonb, ADD COLUMN transom_t_bar_size text,
      ADD COLUMN transom_glass_type_code text, ADD COLUMN transom_custom_glass_description text;
    CREATE FUNCTION dg_validate_direct_dimension_glass_source(jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    ${update}
    INSERT INTO auth.users VALUES('${actor}');
    INSERT INTO dg_user_profiles VALUES('${actor}',true,false);
    INSERT INTO dg_user_permissions VALUES('${actor}','jobs','use');
    INSERT INTO dg_native_jobs(internal_job_id,door_go_reference,visible_identifier,visible_identifier_kind,origin,customer,created_by_user_id,updated_by_user_id)
    VALUES('${job}','DG-000001','DG-000001','door_go_reference','native','Fixture','${actor}','${actor}');
    INSERT INTO dg_native_job_lines(line_id,internal_job_id,line_index,mode,config,width,height,glass_calc,created_by_user_id,updated_by_user_id)
    VALUES('${line}','${job}',1,'Interior','D','30','80','{"unknown":true,"labelProductCode":"FRAME"}','${actor}','${actor}'),
    ('${other}','${job}',2,'Interior','D','30','80',null,'${actor}','${actor}');
  `);
  await db.exec(read('20261111020255_save_native_door_labels.sql'));
  await db.exec(read('20261111142016_persist_individual_door_ids.sql'));
  // Optional read-only hosted definition capture checks the exact current functions,
  // still in this synthetic database; it never imports hosted rows or accounts.
  if (process.argv[3]) for (const entry of JSON.parse(readFileSync(process.argv[3], 'utf8'))) await db.exec(entry.definition);
  const before = (await catalog()).rows;
  const beforeRows = (await db.query('SELECT to_jsonb(l) AS value FROM dg_native_job_lines l ORDER BY line_id')).rows;
  const oldDefinitions = (await db.query("SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('dg_update_native_door_labels','dg_update_native_job') ORDER BY proname")).rows;
  await db.exec(read('20261116200927_door_slab_sku.sql'));
  assert.deepEqual((await catalog()).rows, before, 'ownership and grants unchanged');
  assert.deepEqual((await db.query('SELECT to_jsonb(l) AS value FROM dg_native_job_lines l ORDER BY line_id')).rows, beforeRows, 'migration rewrites no rows');
  const parent = (await db.query('SELECT to_jsonb(j) AS value FROM dg_native_jobs j')).rows;
  await db.exec("CREATE FUNCTION no_parent_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'unexpected_parent_update'; END;$$; CREATE TRIGGER no_parent_write BEFORE UPDATE ON dg_native_jobs FOR EACH ROW EXECUTE FUNCTION no_parent_write()");
  const long = 'zz_SO_DOOR_0123_' + 'x'.repeat(300);
  await save({ doorSlabSku: { expected: null, value: long } });
  await save({ doorSlabSku: { expected: null, value: long } }); // exact retry
  assert.equal((await current()).labelSlabSku, long);
  await save({ doorSlabSku: { expected: null, value: 'SECOND' } }, other);
  assert.equal((await current()).labelSlabSku, long, 'independent door lines');
  await assert.rejects(save({ doorSlabSku: { expected: null, value: 'STALE' } }), /stale_labels/);
  await assert.rejects(save({ doorSlabSku: { expected: long, value: 'BAD' }, productCode: { expected: 'STALE', value: 'BAD' } }), /stale_labels/);
  assert.equal((await current()).labelSlabSku, long, 'atomic rejection');
  await assert.rejects(save({ doorSlabSku: { expected: long, value: 2 } }), /validation_failed/);
  await assert.rejects(save({ qty: { expected: null, value: '2' } }), /validation_failed/);
  await assert.rejects(save({ doorSlabSku: { expected: long, value: 'x' } }, line, '99999999-9999-4999-8999-999999999999'), /not_found/);
  for (const level of ['view', 'none']) {
    await db.exec(`UPDATE dg_user_permissions SET access_level='${level}'`);
    await assert.rejects(save({ doorSlabSku: { expected: long, value: 'x' } }), /permission_required/);
  }
  await db.exec("UPDATE dg_user_permissions SET access_level='use'; UPDATE dg_user_profiles SET active=false");
  await assert.rejects(save({ doorSlabSku: { expected: long, value: 'x' } }), /active_profile_required/);
  await db.exec('UPDATE dg_user_profiles SET active=true,must_change_password=true');
  await assert.rejects(save({ doorSlabSku: { expected: long, value: 'x' } }), /business.access_required/);
  await db.exec('UPDATE dg_user_profiles SET must_change_password=false');
  await assert.rejects(asUser('SELECT dg_update_native_door_labels($1,$2,$3)', [job,line,{doorSlabSku:{expected:long,value:'x'}}], 'anon'), /permission denied/);
  await save({ doorId: { expected: null, value: 'Door 1' }, individualDoorIds: { expected: [], value: ['A','B'] } });
  assert.equal((await current()).labelProductCode, 'FRAME');
  assert.deepEqual((await current()).labelIndividualDoorIds, ['A','B']);
  assert.deepEqual((await db.query('SELECT to_jsonb(j) AS value FROM dg_native_jobs j')).rows,parent,'quick save never writes parent/revision');
  await db.exec('DROP TRIGGER no_parent_write ON dg_native_jobs');
  const header = (await db.query('SELECT revision FROM dg_native_jobs')).rows[0];
  const headerInput = { customer: 'Fixture', lifecycle_stage: 'Draft', po_numbers: [] };
  const lines = (await db.query('SELECT to_jsonb(l) AS value FROM dg_native_job_lines l ORDER BY line_index')).rows.map(r => r.value);
  for (const item of lines) for (const key of ['internal_job_id','created_at','updated_at','created_by_user_id','updated_by_user_id']) delete item[key];
  lines[0].glass_calc = { staleGeometry: true, labelSlabSku: 'STALE', labelProductCode: 'STALE' };
  await asUser('SELECT dg_update_native_job($1,$2,$3,$4)',[job,header.revision,headerInput,lines]);
  assert.equal((await current()).labelSlabSku,long,'ordinary job saves preserve newer SKU');
  assert.equal((await current()).labelProductCode,'FRAME');
  await save({ doorSlabSku: { expected: long, value: '' } });
  assert.equal((await current()).labelSlabSku,undefined,'clear');
  for (const { definition } of oldDefinitions) await db.exec(definition);
  assert.deepEqual((await catalog()).rows,before,'rollback restores original function ACL/owner');
  await assert.rejects(save({ doorSlabSku: { expected: null, value: 'x' } }), /validation_failed/);
  console.log('Slab SKU database checks passed: exact migration, roles, independent lines, atomic conflicts, retries, clear, ordinary saves, unchanged rows/ACL and function rollback.');
} catch (error) { console.error(error.message, error.where ?? ''); process.exitCode = 1; } finally { await db.close(); }
