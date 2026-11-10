// Runs against a new in-memory PostgreSQL (PGlite) database only.
// Supply the absolute path to a scratch-installed @electric-sql/pglite entry.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = prefix => readFileSync('supabase/migrations/' +
  readdirSync('supabase/migrations').find(file => file.startsWith(prefix)), 'utf8');
const admin = '10000000-0000-4000-8000-000000000001';
const viewer = '10000000-0000-4000-8000-000000000002';
const scheduler = '10000000-0000-4000-8000-000000000003';
const pilot = '10000000-0000-4000-8000-000000000004';
const otherAdmin = '10000000-0000-4000-8000-000000000005';
const west = '20000000-0000-4000-8000-000000000001';
const east = '20000000-0000-4000-8000-000000000002';
const linkedJob = '30000000-0000-4000-8000-000000000001';
const unlinkedJob = '30000000-0000-4000-8000-000000000002';
const date = '2026-11-10';
const exec = sql => db.exec(sql);
async function one(sql, args = []) {
  const {rows} = await db.query(sql,args);
  return Object.values(rows[0])[0];
}
async function actor(id) {
  await exec('RESET ROLE');
  await one("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
  await exec('SET ROLE authenticated');
}
const effective = key => one('SELECT access_level FROM public.dg_user_permissions WHERE permission_key=$1',[key]);
const assignment = (changes = {}) => ({jobs:'none',calendar:'none',production:'none',production_checkpoints:'none',documents:'none',administration:'none',...changes});
const update = (id, grants) => one('SELECT public.dg_admin_update_permissions($1,$2::jsonb)', [id,JSON.stringify(grants)]);
try {
  await exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS $$SELECT pg_catalog.gen_random_uuid()$$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.dg_native_jobs(internal_job_id uuid PRIMARY KEY,notes text,archived_at timestamptz);
    CREATE TABLE public.dg_calendar_items(linked_internal_job_id uuid,item_type text,deleted_at timestamptz);
    CREATE FUNCTION public.dg_delete_native_job(p_internal_job_id uuid,p_expected_revision bigint)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    DECLARE v_actor uuid := auth.uid();
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.dg_user_profiles profile WHERE profile.user_id = v_actor AND profile.is_manager = true)
      THEN RAISE EXCEPTION 'native_job.manager_required'; END IF;
      RETURN '{}'::jsonb;
    END $$;
  `);
  for (const prefix of ['20260710000000','20260712000000','20260712010000','20260712020000',
    '20260825030000','20260825040000','20260911010000','20261009153600']) await exec(migration(prefix));
  const business = migration('20261027120000');
  await exec(business.slice(business.indexOf('CREATE FUNCTION public.dg_business_eligible'),
    business.indexOf('-- Wrap the EFFECTIVE')));
  const scope = migration('20261006201036');
  await exec(scope.slice(scope.indexOf('CREATE OR REPLACE FUNCTION public.dg_staff_away_scope'),scope.lastIndexOf('COMMIT;'))
    .replace('  IF v_actor IS NULL', '  PERFORM public.dg_require_business_access();\n  IF v_actor IS NULL'));
  for (const prefix of ['20261102120000','20261102130000']) await exec(migration(prefix));
  await exec(`
    INSERT INTO auth.users VALUES ('${admin}'),('${viewer}'),('${scheduler}'),('${pilot}'),('${otherAdmin}');
    INSERT INTO public.dg_user_profiles(user_id,display_name,is_manager,company_location,must_change_password)
    SELECT id,id::text,id='${admin}'::uuid,'default',false FROM auth.users;
    INSERT INTO public.dg_user_permissions(user_id,permission_key,access_level) VALUES
      ('${admin}','settings','use'), ('${admin}','users','use'),
      ('${viewer}','calendar','view'), ('${viewer}','jobs','use'), ('${viewer}','production','view'),
      ('${scheduler}','calendar','use'), ('${pilot}','jobs','view'), ('${pilot}','production_checkpoints','use'),
      ('${pilot}','documents','view'), ('${otherAdmin}','settings','use'), ('${otherAdmin}','calendar','view');
    INSERT INTO public.dg_native_jobs VALUES ('${linkedJob}','visible linked note',NULL),('${unlinkedJob}','private note',NULL);
    INSERT INTO public.dg_calendar_items VALUES ('${linkedJob}','delivery',NULL),('${unlinkedJob}','note',NULL);
    INSERT INTO public.dg_capacity_staff(staff_id,company_location,display_name,created_by_user_id,updated_by_user_id)
    VALUES ('${west}','default','West staff','${admin}','${admin}'),('${east}','East','East staff','${admin}','${admin}');
    INSERT INTO public.dg_company_workweek_versions(company_location,effective_from,created_by_user_id)
    VALUES ('default','2020-01-01','${admin}'),('East','2020-01-01','${admin}');
    INSERT INTO public.dg_company_workweek_weekdays(workweek_version_id,weekday)
    SELECT workweek_version_id,2 FROM public.dg_company_workweek_versions;
  `);
  await assert.rejects(exec(migration('20261110142021')), /users.cutover_administrator_required/);
  await exec('ROLLBACK');
  await one("SELECT set_config('doorgo.permission_cutover_administrator',$1,false)",[admin]);
  await exec(migration('20261110142021'));
  const preCompatibility = await one("SELECT pg_get_functiondef('public.dg_staff_away_write_location(uuid,uuid)'::regprocedure)");
  await exec(migration('20261110150301'));
  await exec(readFileSync('scripts/rollback-staff-away-cdw-compatibility.sql','utf8'));
  assert.equal(await one("SELECT pg_get_functiondef('public.dg_staff_away_write_location(uuid,uuid)'::regprocedure)"), preCompatibility);
  await exec(migration('20261110150301'));
  const awayRange = () => one("SELECT public.load_calendar_staff_away_range('2026-11-10','2026-11-17')");
  const notes = () => one('SELECT array_agg(notes) FROM public.calendar_linked_fulfillment_notes($1::uuid[])',[[linkedJob,unlinkedJob]]);
  const save = (staff, periodId = null, revision = null) => one(
    "SELECT public.save_staff_away_period(gen_random_uuid(),$1,$2,$3,$4,$4,'full_day',NULL,'fixture')",
    [periodId,revision,staff,date]);
  const remove = (id, revision) => one('SELECT public.delete_staff_away_period(gen_random_uuid(),$1,$2)',[id,revision]);

  await actor(admin);
  for (const key of Object.keys(assignment())) assert.equal(await effective(key),'use');
  assert.deepEqual(await notes(),['visible linked note']);
  await assert.rejects(update(admin,assignment()),/users.last_administrator/);
  await assert.rejects(update(pilot,assignment({jobs:'use',calendar:'view'})),/users.incompatible_permissions/);
  await assert.rejects(update(pilot,assignment({production:'use'})),/users.incompatible_permissions/);
  const directory = await one('SELECT public.dg_admin_list_users()');
  assert.equal(directory.find(row => row.userId === viewer).permissions.jobs,'use');
  assert.equal(directory.find(row => row.userId === viewer).permissions.production,'view');
  assert.equal((await awayRange()).activeStaff.length,2);
  const foreign = await save(east);
  assert.equal((await awayRange()).periods[0].inEditScope,true);
  await exec('RESET ROLE');
  await assert.rejects(db.query('UPDATE public.dg_user_profiles SET active=false WHERE user_id=$1',[admin]),/users.last_administrator/);

  await actor(viewer);
  assert.equal(await effective('jobs'),'view');
  assert.equal(await effective('production'),'none');
  assert.deepEqual(await notes(),['visible linked note']);
  const viewerRange = await awayRange();
  assert.equal(viewerRange.activeStaff.length,1);
  assert.equal(viewerRange.periods[0].companyLocation,'East');
  await assert.rejects(save(west),/staff_away.permission_required/);
  await assert.rejects(one('SELECT * FROM public.dg_permission_assignments'),/permission denied/);

  await actor(scheduler);
  assert.equal(await effective('jobs'),'none');
  assert.equal(await effective('production'),'none');
  assert.deepEqual(await notes(),['visible linked note']);
  assert.deepEqual(await awayRange(),viewerRange);
  await assert.rejects(save(east),/staff_away.staff_unavailable/);
  await assert.rejects(remove(foreign.periodId,1),/staff_away.not_found/);
  for (const label of ['Central Door & Window', 'Central Door']) {
    await exec('RESET ROLE');
    await db.query('UPDATE public.dg_user_profiles SET company_location=$1 WHERE user_id=$2',[label,scheduler]);
    await actor(scheduler);
    assert.equal((await awayRange()).activeStaff[0].staffId,west);
    const own = await save(west);
    assert.equal((await save(west,own.periodId,1)).revision,2);
    await remove(own.periodId,2);
  }
  await exec('RESET ROLE');
  await db.query("UPDATE public.dg_user_profiles SET company_location='default' WHERE user_id=$1",[scheduler]);
  await actor(scheduler);
  await assert.rejects(update(scheduler,assignment({administration:'use'})),/users.permission_required/);

  await actor(pilot);
  assert.equal(await effective('jobs'),'none');
  assert.equal(await effective('production_checkpoints'),'none');
  assert.equal(await effective('documents'),'view');
  await assert.rejects(notes(),/calendar_item.permission_required/);

  await actor(otherAdmin);
  assert.equal(await effective('jobs'),'none');
  assert.equal(await effective('administration'),'none');
  assert.deepEqual(await notes(),['visible linked note']);
  assert.deepEqual(await awayRange(),viewerRange);
  await assert.rejects(one('SELECT public.dg_admin_list_users()'),/users.permission_required/);

  await actor(admin);
  await remove(foreign.periodId,1);
  await update(pilot,assignment({jobs:'use',calendar:'use',production:'use',production_checkpoints:'use'}));
  await update(otherAdmin,assignment({administration:'use'}));
  await actor(pilot);
  assert.equal(await effective('production'),'use');
  assert.equal(await effective('production_checkpoints'),'use');
  assert.deepEqual(await notes(),['visible linked note']);
  await actor(otherAdmin);
  await update(admin,assignment());
  await assert.rejects(update(otherAdmin,assignment()),/users.last_administrator/);
  console.log('PASS: in-memory PostgreSQL migration, grants, administrator protection, linked Notes and scoped Staff Away RPCs.');
} finally {
  await db.close();
}
