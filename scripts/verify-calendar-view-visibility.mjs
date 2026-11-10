// Dependency-free focused runtime checks. No network, database or hosted writes.
// Run: node --experimental-vm-modules scripts/verify-calendar-view-visibility.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// Git checkouts may use CRLF or LF; compare source content consistently.
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const migration = 'supabase/migrations/20261102120000_calendar_view_linked_fulfillment_notes.sql';
const sql = read(migration);
const prior = read('supabase/migrations/20261015120000_restrict_calendar_linked_fulfillment_notes.sql');
assert.equal(sql.slice(sql.indexOf('  IF p_internal_job_ids IS NULL')), prior.slice(prior.indexOf('  IF p_internal_job_ids IS NULL')), 'query, linkage restrictions and ACLs unchanged');
assert.match(sql, /v_actor uuid:=auth.uid\(\)/);
assert.match(sql, /IF v_actor IS NULL[\s\S]*authentication_required/);
assert.match(sql, /PERFORM public.dg_require_business_access\(\)/);
assert.match(sql, /p.user_id=v_actor AND p.active=true/);
assert.match(sql, /p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level IN \('view','use'\)/);
assert.doesNotMatch(sql, /CREATE POLICY|GRANT SELECT|UPDATE |DELETE FROM|dg_calendar_require_use\(/);
const querySource = read('lib/production-board/queries.ts');
assert.match(querySource, /await enrichCalendarLinkedFulfillmentNotes\(itemRows\)/);
for (const file of ['app/calendar/page.tsx', 'lib/production-bookings/calendar-production-actions.ts']) {
  assert.match(read(file), /loadProductionBoardReadOnly/);
  assert.match(read(file), /includeStaffAway:hasAtLeastView\(access,'calendar'\)/);
}
// The historical read/write location boundary remains intact; Calendar uses its new read projection.
assert.match(read('supabase/migrations/20260825040000_add_staff_away_operations.sql'), /a.company_location=v_location AND a.deleted_at IS NULL/);

let access, noteFailure = null, nativeCalls = 0, boardCalls = 0;
const calls = [];
const jobId = '11111111-1111-4111-8111-111111111111';
const date = '2026-11-02';
const item = (type = 'delivery', job = jobId) => ({ item_id: type, item_type: type, linked_internal_job_id: job, scheduled_date: date, customer_name: 'Calendar customer', sales_order: 'SO1', fulfillment_note: 'stale', revision: 1, day_order: 1 });
const awayPeriods = ['North','South','default'].map((location,index)=>({periodId:'away-'+index,staffId:'staff-'+index,staffName:['Jordan','Alex','Sam'][index],companyLocation:location,startDate:date,endDate:date,mode:'full_day',revision:1,occurrences:[{date,deductionHours:7}]}));
awayPeriods[1].endDate='2026-11-07';
awayPeriods[1].occurrences.push({date:'2026-11-07',deductionHours:7});
awayPeriods.push({...awayPeriods[1],periodId:'away-future',startDate:'2026-11-09',endDate:'2026-11-09',occurrences:[{date:'2026-11-09',deductionHours:7}]});
const awayPayload = (args) => ({activeStaff:[...new Map(awayPeriods.filter(period=>period.companyLocation===(access?.profile?.companyLocation?.trim()||'default')).map(period=>[period.staffId,{staffId:period.staffId,displayName:period.staffName}])).values()],periods:awayPeriods.filter(period=>period.startDate<args.p_end_exclusive&&period.endDate>=args.p_start).map(period=>({...period,inEditScope:period.companyLocation===(access?.profile?.companyLocation?.trim()||'default')}))});
const warnings = [];
const context = vm.createContext({ console: { ...console, warn: message => warnings.push(message) }, Date, Map, Set, Intl, crypto: globalThis.crypto });
const cache = new Map();
const rpc = async (name, args) => {
  calls.push({ name, args });
  if (name === 'calendar_linked_fulfillment_notes') {
    if (noteFailure === 'throw') throw new Error('transport failed');
    if (noteFailure === 'malformed') return { data:{bad:true}, error:null };
    return { data:[{internal_job_id:jobId, notes:'Authorized note'}], error: noteFailure ? {message:'denied'} : null };
  }
  if (name === 'load_calendar_staff_away_range') return { data:awayPayload(args), error:null };
  assert.notEqual(name,'load_staff_away_calendar_range','Calendar must not use the old location-filtered RPC');
  return { data:{}, error:null };
};
function resultQuery(table) {
  const result = { data:table === 'dg_calendar_items' ? [item(), item('customer_pickup'), item('note', null)] : [], error:null };
  return new Proxy({}, { get: (_, key) => key === 'then' ? (resolve => resolve(result)) : () => resultQuery(table) });
}
const mocks = {
  'server-only': {},
  '@/lib/supabase/server': { createAuthenticatedSupabaseServerClient: async () => { if (noteFailure === 'client') throw new Error('client failed'); return { rpc }; } },
  '@/lib/supabase/trusted-read-server': { createTrustedReadOnlySupabaseClient: () => { boardCalls++; return { from: resultQuery }; } },
  '@/lib/auth/current-access': { getCurrentDoorGoAccess: async () => access },
  '@/lib/jobs/job-intake-service': { updateJobWithAccess:async()=>{throw new Error('Unexpected Jobs write');} },
  '@/lib/jobs/job-intake-repository': { createJobIntakeRepository: () => { nativeCalls++; throw new Error('Unexpected Jobs access'); } },
  '@/lib/production-flow/checkpoint-queries': { loadLatestConfirmedCheckpointOnOrBefore:async()=>null, loadConfirmedCheckpointsInRange:async()=>[] },
  '@/lib/production-board/capacity-queries': { loadDailyCapacityReadOnly:async()=>[] },
  '@/lib/production-board/native-job-links': { loadCalendarNativeJobLinks:async()=>({byVisibleIdentifier:new Map(),byInternalJobId:new Map()}) },
  '@/lib/calendar/capacity-exception-queries': { loadCalendarCapacityExceptions:async()=>({records:[],exceptionalDates:[]}) },
};
async function load(specifier, parent = path.join(process.cwd(), 'entry.ts')) {
  const resolved = specifier.startsWith('@/') ? path.resolve(specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
  const key = mocks[specifier] ? specifier : Object.keys(mocks).find(key => key.startsWith('@/') && path.resolve(key.slice(2)) === resolved);
  if (key) {
    if (!cache.has(key)) cache.set(key, new vm.SyntheticModule(Object.keys(mocks[key]), function () { for (const [name, value] of Object.entries(mocks[key])) this.setExport(name, value); }, {context}));
    return cache.get(key);
  }
  const filename = resolved.endsWith('.ts') ? resolved : resolved + '.ts';
  if (cache.has(filename)) return cache.get(filename);
  const sourceModule = new vm.SourceTextModule(stripTypeScriptTypes(read(filename)), { context, identifier:filename });
  cache.set(filename, sourceModule);
  await sourceModule.link((name) => load(name, filename));
  return sourceModule;
}
const helper = await load('./lib/calendar/linked-fulfillment-notes.ts');
await helper.evaluate();
const actions = await load('./lib/production-bookings/calendar-production-actions.ts');
await actions.evaluate();
const itemActions = await load('./lib/calendar/calendar-item-actions.ts');
await itemActions.evaluate();
const awayActions = await load('./lib/calendar/staff-away-actions.ts');
await awayActions.evaluate();
const accessModule = await load('./lib/auth/access.ts');
await accessModule.evaluate();
const presentation = await load('./lib/calendar/presentation.ts');
await presentation.evaluate();
const makeAccess = (level, manager = false, active = true, setup = false, location = 'default') => accessModule.namespace.resolveCurrentDoorGoAccess({ user:{ id:jobId }, profile:{ user_id:jobId, display_name:'Employee', active, is_manager:manager, company_location:location, must_change_password:setup }, permissionRows:[{permission_key:'calendar', access_level:level}, {permission_key:'jobs', access_level:'none'}] });
const request = { boardStart:date, boardEndExclusive:'2026-11-09', weeks:1, today:date, dates:[date] };
const signatures = [];
for (const manager of [false, true]) for (const level of ['view','use']) {
  access = makeAccess(level, manager);
  noteFailure = null;
  const loaded = await actions.namespace.loadCalendarWindow(request);
  assert.equal(loaded.ok, true);
  const cards = loaded.board.days[0].cards;
  assert.equal(cards.filter(card=>card.fulfillmentNote==='Authorized note').length,2);
  assert.equal(cards.filter(card=>card.recordKind==='staff_away').length,3);
  const layers = presentation.namespace.buildCalendarLayers(cards);
  assert.equal(layers.find(layer=>layer.key==='other:away').available,true);
  assert.equal(cards.filter(card=>presentation.namespace.needsAttentionToolbarModel([card],['other:away']).visibleCards?.length).length,3);
  assert.equal(presentation.namespace.needsAttentionToolbarModel(cards,[]).visibleCards.length,0);
  const refreshed = await actions.namespace.reloadCalendarProductionDays(request);
  assert.equal(refreshed.ok,true);
  assert.equal(refreshed.days[0].cards.filter(card=>card.fulfillmentNote==='Authorized note').length,2);
  signatures.push(JSON.stringify(cards));
}
assert.ok(signatures.every(value=>value===signatures[0]), 'view/use/admin display parity with the same authorized RPC payload');
assert.equal(nativeCalls,0,'Jobs No Access never opens native Job repository');
const awayModel = await load('./lib/calendar/staff-away.ts');
await awayModel.evaluate();
for (const location of ['North','South',null,' default ']) {
  let expected;
  for (const level of ['view','use']) {
    access=makeAccess(level,false,true,false,location);
    const loaded=await actions.namespace.loadCalendarWindow(request);
    const refreshed=await actions.namespace.reloadCalendarProductionDays(request);
    assert.equal(loaded.ok,true);assert.equal(refreshed.ok,true);
    assert.equal(loaded.board.days.find(day=>day.date==='2026-11-07').cards.filter(card=>card.recordKind==='staff_away').length,1,'Own-location weekend occurrence remains visible');
    const cards=loaded.board.days[0].cards.filter(card=>card.recordKind==='staff_away');
    assert.deepEqual(JSON.parse(JSON.stringify(cards.map(card=>card.staffAwayCompanyLocation).sort())),['North','South','default']);
    const info=JSON.stringify(cards,(key,value)=>key==='staffAwayInEditScope'?undefined:value);
    if(expected)assert.equal(info,expected,'View and Use see identical employee/location/event information');
    expected=info;
    assert.equal(JSON.stringify(refreshed.days[0].cards),JSON.stringify(loaded.board.days[0].cards));
    const roster=loaded.board.staffAwayRoster;
    assert.equal(roster.length,1,'Shared visibility never broadens editable roster');
    for(const card of cards){
      assert.equal(awayModel.namespace.canEditStaffAwayPeriod(level==='use',card),level==='use'&&card.staffAwayCompanyLocation===(location?.trim()||'default'));
      assert.equal(card.staffId,awayPeriods.find(period=>period.companyLocation===card.staffAwayCompanyLocation).staffId);
    }
  }
}

const reader = await load('./lib/production-board/queries.ts');
await reader.evaluate();
const initial = await reader.namespace.loadProductionBoardReadOnly({...request, includeNativeJobLinks:false, includeOperationalCalendarItems:true, includeStaffAway:true, includeCapacityExceptions:true});
assert.equal(initial.days[0].cards.filter(card=>card.fulfillmentNote==='Authorized note').length,2);
const withoutAway = await reader.namespace.loadProductionBoardReadOnly({...request,includeNativeJobLinks:false,includeOperationalCalendarItems:true,includeCapacityExceptions:true});
for(const day of withoutAway.days){
 const withAway=initial.days.find(candidate=>candidate.date===day.date);
 assert.equal(JSON.stringify({...withAway,cards:[]}),JSON.stringify({...day,cards:[]}),'Adding shared Staff Away must not change existing daily capacity/flow values');
}
const extension = {...request, boardStart:'2026-11-09', boardEndExclusive:'2027-01-04', weeks:8};
for(const level of ['view','use']){
 access=makeAccess(level,false,true,false,'North');
 const extended=await actions.namespace.loadCalendarWindow(extension);
 assert.equal(extended.ok,true);
 const future=extended.board.days.flatMap(day=>day.cards).find(card=>card.staffAwayPeriodId==='away-future');
 assert.equal(future.staffAwayCompanyLocation,'South','Range extension includes another location');
 assert.equal(future.staffAwayInEditScope,false);
}
assert.ok(calls.some(call=>call.name==='load_calendar_staff_away_range' && call.args.p_start===extension.boardStart && call.args.p_end_exclusive===extension.boardEndExclusive));
for (const failure of ['error','throw','malformed']) {
  access = makeAccess('view'); noteFailure = failure;
  const loaded = await actions.namespace.loadCalendarWindow(request);
  const refreshed = await actions.namespace.reloadCalendarProductionDays(request);
  const extended = await actions.namespace.loadCalendarWindow(extension);
  const initialFailed = await reader.namespace.loadProductionBoardReadOnly({...request, includeOperationalCalendarItems:true});
  assert.ok(initialFailed.days[0].cards.length);
  assert.equal(extended.ok,true,failure);
  assert.equal(loaded.ok,true, failure);
  assert.equal(refreshed.ok,true, failure);
  assert.equal(loaded.board.days[0].cards.filter(card=>card.recordKind==='calendar_item').length,3);
  assert.equal(loaded.board.days[0].cards.find(card=>card.calendarItemType==='delivery').fulfillmentNote,null);
}
noteFailure = 'client';
const failedRows = [item()];
await helper.namespace.enrichCalendarLinkedFulfillmentNotes(failedRows);
assert.equal(failedRows[0].fulfillment_note,null);
noteFailure = null;
const rows = [item(), item('customer_pickup'), item('note'), item('delivery',null)];
calls.length=0;
await helper.namespace.enrichCalendarLinkedFulfillmentNotes(rows);
assert.equal(calls.length,1);
assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_internal_job_ids)),[jobId]);
assert.equal(rows[2].fulfillment_note,'stale','Calendar note content untouched');
assert.equal(rows[3].fulfillment_note,'stale','Unlinked item content untouched');
for (const denied of [accessModule.namespace.resolveCurrentDoorGoAccess({user:null,profile:null}),makeAccess('none'),makeAccess('view',false,false),makeAccess('view',false,true,true)]) {
  access=denied; const before=boardCalls;
  assert.equal((await actions.namespace.loadCalendarWindow(request)).ok,false);
  assert.equal((await actions.namespace.reloadCalendarProductionDays(request)).ok,false);
  assert.equal(boardCalls,before,'Denied users never enter privileged board reader');
}
for (const level of ['none','view']) {
  access=makeAccess(level); calls.length=0;
  for (const [name,input] of [
    ['placeCalendarProductionBooking',{}],['reorderCalendarProductionDay',{}],['reorderCalendarNeedsAttention',{}],
    ['completeCalendarProductionBooking',{}],['reopenCalendarProductionBooking',{}],['deleteCalendarProductionBooking',{}],['rescheduleCalendarProductionBooking',{}],
  ]) assert.equal((await actions.namespace[name](input)).ok,false,name);
  for (const name of ['createCalendarItem','moveCalendarItem','setCalendarItemCompletion','deleteCalendarItem','updateCalendarNote','convertCalendarNote']) {
    assert.equal((await itemActions.namespace[name]({})).ok,false,name);
  }
  assert.equal((await itemActions.namespace.saveCalendarEdit({}, {}, false)).ok,false);
  assert.equal((await awayActions.namespace.saveStaffAway({})).ok,false);
  assert.equal((await awayActions.namespace.deleteStaffAway({})).ok,false);
  assert.equal(calls.length,0,'View/none mutations never reach RPC');
}
console.log('PASS: SQL restriction preservation; real shared reader/window/refresh; View/Use + Jobs none; admin parity; Staff Away merge/layer; optional RPC/client/malformed failures; no-access/inactive/setup denial; read-only production actions. RPCs mocked; real board normalization; NOT SQL/RLS execution or browser acceptance.');
