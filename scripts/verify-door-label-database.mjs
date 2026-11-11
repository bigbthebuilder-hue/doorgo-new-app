import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// Disposable, network-isolated PostgreSQL. Never accepts a database URL or uses env credentials.
const container = 'doorgo-label-tests-' + process.pid;
const image = 'public.ecr.aws/supabase/postgres:17.11.0.011';
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const psql = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'label_tests', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const sql = (input) => docker(psql, input);
const actor = '33333333-3333-4333-8333-333333333333';
const job = '11111111-1111-4111-8111-111111111111';
const line = '22222222-2222-4222-8222-222222222222';
const auth = `SET ROLE authenticated; SET request.jwt.claim.sub='${actor}';`;
const change = (changes, lineId = line, jobId = job) => `SELECT public.dg_update_native_door_labels('${jobId}','${lineId}','${JSON.stringify(changes).replaceAll("'", "''")}'::jsonb);`;
const save = (changes) => sql(auth + change(changes));
function reject(input, pattern) {
  const result = spawnSync('docker', psql, { input, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0, 'expected database rejection');
  assert.match(result.stderr, pattern);
}
function concurrent(input) {
  const child = spawn('docker', psql, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { errors += data; });
  child.stdin.end(input);
  return new Promise((resolve) => child.on('exit', (status) => resolve({ status, output, errors })));
}

async function waitForHeldTransaction(name) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND wait_event='PgSleep';`) === '1') return;
    await delay(50);
  }
  throw new Error('Concurrent test transaction did not acquire its locks');
}

docker(['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', container, '-e', 'POSTGRES_PASSWORD=local-tests-only', image]);
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { encoding: 'utf8' });
    if (probe.status === 0) { ready = true; break; }
    await delay(250);
  }
  assert.ok(ready, 'local postgres startup');
  docker(['exec', container, 'createdb', '-U', 'supabase_admin', '-O', 'postgres', 'label_tests']);
  // Real native job/line schema and update body from the repository. Auth is a
  // small synthetic fixture. Unrelated glass-source validation is stubbed here.
  const read = (file) => readFileSync('supabase/migrations/' + file, 'utf8').replaceAll('\r\n', '\n');
  const original = read('20260728000000_create_native_job_persistence.sql');
  const tables = original.slice(original.indexOf('CREATE SEQUENCE'), original.indexOf('CREATE TABLE public.dg_native_job_create_commands'));
  const source = read('20260805010000_fix_direct_dimension_update_rpc_allowlist.sql');
  const update = source.slice(source.indexOf('CREATE OR REPLACE FUNCTION'), source.indexOf('DO $post$'));
  sql(`CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE OR REPLACE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT pg_catalog.gen_random_uuid()';
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.dg_user_profiles(user_id uuid PRIMARY KEY,active boolean,must_change_password boolean);
    CREATE TABLE public.dg_user_permissions(user_id uuid,permission_key text,access_level text);
    CREATE OR REPLACE FUNCTION public.dg_require_business_access() RETURNS void LANGUAGE plpgsql AS $$BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.dg_user_profiles WHERE user_id=auth.uid() AND active AND must_change_password=false)
      THEN RAISE EXCEPTION 'business.access_required'; END IF; END;$$;
    ${tables}
    ALTER TABLE public.dg_native_job_lines ADD COLUMN sidelight_specifications jsonb,
      ADD COLUMN transom_t_bar_size text, ADD COLUMN transom_glass_type_code text, ADD COLUMN transom_custom_glass_description text;
    CREATE FUNCTION public.dg_validate_direct_dimension_glass_source(jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    ${update}
    INSERT INTO auth.users VALUES('${actor}');
    INSERT INTO public.dg_user_profiles VALUES('${actor}',true,false);
    INSERT INTO public.dg_user_permissions VALUES('${actor}','jobs','use');
    INSERT INTO public.dg_native_jobs(internal_job_id,door_go_reference,visible_identifier,visible_identifier_kind,origin,customer,created_by_user_id,updated_by_user_id)
      VALUES('${job}','DG-000001','DG-000001','door_go_reference','native','Fixture','${actor}','${actor}');
    INSERT INTO public.dg_native_job_lines(line_id,internal_job_id,line_index,mode,config,width,height,glass_calc,created_by_user_id,updated_by_user_id)
      VALUES('${line}','${job}',1,'Interior','D','30','80','{"unknown":{"nested":[1,2]},"construction":"standard"}','${actor}','${actor}');
    -- Any parent write is a side-effect failure during the label-only tests.
    CREATE FUNCTION public.label_test_no_parent_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'unexpected_parent_update'; END;$$;
    CREATE TRIGGER label_test_parent_guard BEFORE UPDATE ON public.dg_native_jobs FOR EACH ROW EXECUTE FUNCTION public.label_test_no_parent_write();
  `);
  sql(read('20261111020255_save_native_door_labels.sql'));
  sql(read('20261111142016_persist_individual_door_ids.sql'));
  const beforeJob = sql(`SELECT row_to_json(j) FROM public.dg_native_jobs j;`);
  const beforeSpecs = sql(`SELECT to_jsonb(l)-'glass_calc' FROM public.dg_native_job_lines l;`);
  for (const stage of ['Draft', 'Confirmed Job']) {
    sql(`ALTER TABLE public.dg_native_jobs DISABLE TRIGGER label_test_parent_guard; UPDATE public.dg_native_jobs SET lifecycle_stage='${stage}'; ALTER TABLE public.dg_native_jobs ENABLE TRIGGER label_test_parent_guard;`);
    save({ individualDoorIds: { expected: [], value: ['A', '', 'C'] } });
    assert.equal(save({ individualDoorIds: { expected: [], value: ['A', '', 'C'] } }), 't');
    reject(auth + change({ individualDoorIds: { expected: [], value: ['X'] } }), /stale_labels/);
    reject(auth + change({ individualDoorIds: { expected: ['A', '', 'C'], value: [3] } }), /validation_failed/);
    save({ individualDoorIds: { expected: ['A', '', 'C'], value: [] } });
    sql(`UPDATE public.dg_native_job_lines SET glass_calc=glass_calc-'labelIndividualDoorIds';`);
    const before = sql(`SELECT row_to_json(j) FROM public.dg_native_jobs j;`);
    assert.equal(save({ doorId: { expected: null, value: 'Room' }, productCode: { expected: null, value: ' 001_A ' } }), 't');
    assert.equal(save({ doorId: { expected: null, value: 'Room' } }), 't', 'lost-response retry');
    reject(auth + change({ doorId: { expected: null, value: 'Other' } }), /stale_labels/);
    assert.equal(sql(`SELECT row_to_json(j) FROM public.dg_native_jobs j;`), before, 'entire parent including revision unchanged');
    assert.equal(sql(`SELECT to_jsonb(l)-'glass_calc' FROM public.dg_native_job_lines l;`), beforeSpecs, 'all non-JSON columns unchanged');
    save({ doorId: { expected: 'Room', value: null }, productCode: { expected: ' 001_A ', value: null } });
    assert.deepEqual(JSON.parse(sql(`SELECT glass_calc FROM public.dg_native_job_lines;`)), { unknown: { nested: [1, 2] }, construction: 'standard' });
  }
  assert.equal(JSON.parse(beforeJob).revision, 1);
  reject('SET ROLE anon;' + change({ doorId: { expected: null, value: 'x' } }), /permission denied/);
  reject('SET ROLE authenticated;' + change({ doorId: { expected: null, value: 'x' } }), /authentication_required/);
  reject(`SET ROLE authenticated; SET request.jwt.claim.sub='99999999-9999-4999-8999-999999999999';` + change({ doorId: { expected: null, value: 'x' } }), /active_profile_required/);
  assert.equal(sql(`SELECT has_function_privilege('service_role','public.dg_update_native_door_labels(uuid,uuid,jsonb)','execute');`), 'f');
  sql(`UPDATE public.dg_user_permissions SET access_level='view';`);
  reject(auth + change({ doorId: { expected: null, value: 'x' } }), /permission_required/);
  sql(`UPDATE public.dg_user_permissions SET access_level='use'; UPDATE public.dg_user_profiles SET active=false;`);
  reject(auth + change({ doorId: { expected: null, value: 'x' } }), /active_profile_required/);
  sql(`UPDATE public.dg_user_profiles SET active=true,must_change_password=true;`);
  reject(auth + change({ doorId: { expected: null, value: 'x' } }), /business.access_required/);
  sql(`UPDATE public.dg_user_profiles SET must_change_password=false; ALTER TABLE public.dg_native_jobs DISABLE TRIGGER label_test_parent_guard;
    UPDATE public.dg_native_jobs SET archived_at=now(),archived_by_user_id='${actor}'; ALTER TABLE public.dg_native_jobs ENABLE TRIGGER label_test_parent_guard;`);
  reject(auth + change({ doorId: { expected: null, value: 'x' } }), /native_job.archived/);
  sql(`ALTER TABLE public.dg_native_jobs DISABLE TRIGGER label_test_parent_guard; UPDATE public.dg_native_jobs SET archived_at=null,archived_by_user_id=null; ALTER TABLE public.dg_native_jobs ENABLE TRIGGER label_test_parent_guard;`);
  reject(auth + change({ doorId: { expected: null, value: 'x' } }, line, '99999999-9999-4999-8999-999999999999'), /not_found/);
  reject(auth + change({ qty: { expected: null, value: '5' } }), /validation_failed/);
  reject(auth + change({ doorId: { value: 'x' } }), /validation_failed/);
  reject(auth + change({ doorId: { expected: null, value: 'x' }, productCode: { expected: 'wrong', value: 'y' } }), /stale_labels/);
  assert.equal(sql(`SELECT glass_calc ? 'labelDoorId' FROM public.dg_native_job_lines;`), 'f', 'multi-field failure is atomic');

  // Independent connections genuinely overlap while the first holds the row locks.
  save({ individualDoorIds: { expected: [], value: ['one', 'two', 'three'] } });
  const first = concurrent(auth + `SET application_name='label-first'; BEGIN;` + change({ doorId: { expected: null, value: 'A' } }) + `SELECT pg_sleep(3); COMMIT;`);
  await waitForHeldTransaction('label-first');
  const second = concurrent(auth + change({ productCode: { expected: null, value: 'B' } }));
  const copyEditor = concurrent(auth + change({ individualDoorIds: { expected: ['one', 'two', 'three'], value: ['updated', 'two', 'three'] } }));
  const contender = concurrent(auth + change({ doorId: { expected: null, value: 'C' } }));
  assert.equal((await first).status, 0);
  assert.equal((await second).status, 0);
  assert.equal((await copyEditor).status, 0);
  const conflict = await contender;
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.errors, /stale_labels/);
  assert.equal(sql(`SELECT glass_calc->>'labelProductCode' FROM public.dg_native_job_lines;`), 'B');

  // Exercise the patched REAL aggregate upsert with stale/missing label metadata.
  sql(`DROP TRIGGER label_test_parent_guard ON public.dg_native_jobs;`);
  function aggregateSave() {
    const revision = sql(`SELECT revision FROM public.dg_native_jobs WHERE internal_job_id='${job}';`);
    const lines = sql(`SELECT jsonb_build_array(jsonb_build_object('line_id',line_id,'line_index',line_index,'line_status',line_status,
      'mode',mode,'config',config,'width',width,'height',height,'qty',qty,'glass_calc',jsonb_build_object('unknown','keep','labelDoorId','stale')))
    FROM public.dg_native_job_lines WHERE line_id='${line}';`);
    return `SELECT public.dg_update_native_job('${job}',${revision},'{"lifecycle_stage":"Confirmed Job","customer":"Fixture","po_numbers":[]}', '${lines.replaceAll("'", "''")}');`;
  }
  sql(auth + aggregateSave());
  const calc = JSON.parse(sql(`SELECT glass_calc FROM public.dg_native_job_lines;`));
  assert.equal(calc.labelDoorId, 'A'); assert.equal(calc.labelProductCode, 'B'); assert.equal(calc.unknown, 'keep'); assert.deepEqual(calc.labelIndividualDoorIds, ['updated', 'two', 'three']);
  save({ individualDoorIds: { expected: ['updated', 'two', 'three'], value: [] } });
  save({ doorId: { expected: 'A', value: null }, productCode: { expected: 'B', value: null } });
  sql(auth + aggregateSave());
  assert.equal(sql(`SELECT glass_calc ?| ARRAY['labelDoorId','labelProductCode'] FROM public.dg_native_job_lines;`), 'f', 'old saves cannot resurrect cleared labels');
  save({ doorId: { expected: null, value: 'Clear me' } });
  save({ doorId: { expected: 'Clear me', value: '' } });
  save({ doorId: { expected: 'Clear me', value: '' } });
  const staleAggregate = aggregateSave();
  const labelFirst = concurrent(auth + "SET application_name='label-before-aggregate'; BEGIN;" + change({ doorId: { expected: null, value: 'Latest' } }) + 'SELECT pg_sleep(3); COMMIT;');
  await waitForHeldTransaction('label-before-aggregate');
  const aggregateSecond = concurrent(auth + staleAggregate);
  assert.equal((await labelFirst).status, 0);
  assert.equal((await aggregateSecond).status, 0);
  assert.equal(sql(`SELECT glass_calc->>'labelDoorId' FROM public.dg_native_job_lines;`), 'Latest');
  const aggregateFirst = concurrent(auth + "SET application_name='aggregate-before-label'; BEGIN;" + aggregateSave() + 'SELECT pg_sleep(3); COMMIT;');
  await waitForHeldTransaction('aggregate-before-label');
  const labelSecond = concurrent(auth + change({ doorId: { expected: 'Latest', value: 'After full save' } }));
  assert.equal((await aggregateFirst).status, 0);
  assert.equal((await labelSecond).status, 0);
  assert.equal(sql(`SELECT glass_calc->>'labelDoorId' FROM public.dg_native_job_lines;`), 'After full save');
  console.log('PostgreSQL label tests passed: Draft/Confirmed, clearing, auth, atomicity, overlapping field saves, stale conflicts, unchanged parent/specifications, and stale full-job saves.');
} finally {
  docker(['rm', '-f', container]);
}
