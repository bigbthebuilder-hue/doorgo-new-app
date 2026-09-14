import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const migration=fs.readFileSync('supabase/migrations/20260902000000_complete_first_class_calendar_notes.sql','utf8');
const productionIdentityFix=fs.readFileSync('supabase/migrations/20260902010000_fix_calendar_production_native_link_inference.sql','utf8');
const actions=fs.readFileSync('lib/calendar/calendar-item-actions.ts','utf8');
const workspace=fs.readFileSync('components/CalendarWorkspace.tsx','utf8');
const editor=fs.readFileSync('components/calendar/NoteDetailsActions.tsx','utf8');
const page=fs.readFileSync('app/calendar/page.tsx','utf8');
const itemMapping=fs.readFileSync('lib/calendar/calendar-items.ts','utf8');
const styles=fs.readFileSync('app/globals.css','utf8');

assert.match(migration,/^BEGIN;[\s\S]*COMMIT;\s*$/);
assert.match(migration,/SECURITY DEFINER SET search_path=''/g);
assert.match(migration,/public\.dg_calendar_require_use\(false\)/);
assert.match(migration,/public\.dg_calendar_require_use\(p_destination IN\('production','staff_away'\)\)/);
assert.match(migration,/permission_key='jobs' AND access_level IN\('view','use'\)/);
assert.match(migration,/v_item\.revision<>p_expected_revision/);
assert.match(migration,/v_note\.revision<>p_expected_revision/);
assert.match(migration,/completed_at IS NOT NULL THEN RAISE EXCEPTION/);
assert.match(migration,/scheduled_date IS DISTINCT FROM p_scheduled_date/);
assert.match(migration,/COALESCE\(p_scheduled_date::text,'needs_attention'\)/);
assert.match(migration,/pg_advisory_xact_lock/);
for(const existingAction of ['split','merge','included_orders'])assert.match(migration,new RegExp(`action_type IN \\([^)]*'${existingAction}'`));
assert.match(migration,/max\(x\.day_order\)[\s\S]*\+1024/);
assert.match(migration,/public\.save_staff_away_period/);
assert.match(migration,/public\.schedule_linked_fulfillment/);
assert.match(migration,/public\.create_calendar_item/);
assert.match(migration,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon/);
assert.match(migration,/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/);
assert.match(productionIdentityFix,/^BEGIN;[\s\S]*COMMIT;\s*$/);
assert.match(productionIdentityFix,/CREATE OR REPLACE FUNCTION public\.assign_native_production_job_link\(\)/);
assert.match(productionIdentityFix,/NEW\.source IS DISTINCT FROM 'DoorGo Calendar'/);
assert.match(productionIdentityFix,/linked_internal_job_id\)\s*VALUES\([\s\S]*p_linked_internal_job_id\)/);
assert.match(productionIdentityFix,/calendar_item\.production_already_scheduled/);
assert.match(productionIdentityFix,/b\.linked_internal_job_id=p_linked_internal_job_id[\s\S]*b\.booking_kind='production'[\s\S]*b\.completed_at IS NULL[\s\S]*b\.status='active'[\s\S]*b\.schedule_status='confirmed'[\s\S]*b\.board_visible IS DISTINCT FROM false/);
assert.doesNotMatch(productionIdentityFix,/DROP\s+(?:INDEX|TABLE)/i);
assert.doesNotMatch(productionIdentityFix,/dg_production_one_current_linked_job_idx/);

const conversion=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.convert_calendar_note'));
const destinationCreation=Math.min(...['public.save_staff_away_period','public.schedule_linked_fulfillment','public.create_calendar_item'].map(token=>conversion.indexOf(token)).filter(index=>index>=0));
const sourceRemoval=conversion.indexOf('UPDATE public.dg_calendar_items SET deleted_at=');
const conversionEvent=conversion.indexOf("'convert'");
assert.ok(destinationCreation>=0&&sourceRemoval>destinationCreation&&conversionEvent>sourceRemoval,'destination creation must precede source removal and its audit event');
assert.match(conversion,/IF EXISTS\(SELECT 1 FROM public\.dg_calendar_item_events WHERE command_id=p_command_id\)/);
assert.match(conversion,/SELECT \* INTO v_note[\s\S]*FOR UPDATE/);

assert.match(actions,/update_calendar_note/);
assert.match(actions,/convert_calendar_note/);
assert.match(actions,/messages\[code\]\?\?'Calendar could not save this change\. Please try again\.'/);
assert.match(actions,/production_already_scheduled:'This job already has a current Production booking\.'/);
assert.doesNotMatch(actions,/Calendar Note conversion RPC failed|conversionDiagnostic/,'temporary conversion diagnostics must not remain in the stabilized tree');
assert.match(actions,/\.ilike\('details',pattern\)/);
assert.match(editor,/linkedInternalJobId:jobId/);
assert.match(editor,/linkedInternalJobId:card\.internalJobId\?\?null/);
assert.match(editor,/destination==='staff_away'/);
assert.match(editor,/date\|\|null/);
assert.match(page,/canInteract=\{canUse\(access, ['"]calendar['"]\)\}/);
assert.match(workspace,/noteCard&&canDelete/);
assert.match(itemMapping,/calendarItemType==='note'\|\|card\.bookingKind==='note'/);
assert.match(editor,/if\(card\.completedAt\)return null/);
for(const currentValue of ['card.title','card.details','card.productionDate','card.salesperson','card.internalJobId'])assert.match(editor,new RegExp(currentValue.replace('.','\\.')));
assert.match(editor,/itemId:card\.bookingId\.slice\(5\)/);
assert.match(editor,/onClick=\{onClose\} type="button">Cancel/);
assert.doesNotMatch(editor,/<div className="calendar-note-actions">/);assert.ok(editor.indexOf('>Edit</button>')<editor.indexOf('>Convert</button>'));
assert.match(workspace,/<div className="calendar-note-actions"><button[^\n]*<NoteDetailsActions[^\n]*className="calendar-detail-delete"/);
assert.match(styles,/\.calendar-note-actions \{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*gap:/);
assert.match(styles,/\.calendar-note-actions button \{[^}]*flex: 1 1 4\.5rem;[^}]*margin: 0;[^}]*border:[^}]*border-radius:[^}]*padding:/);
assert.match(styles,/\.calendar-note-actions button:focus-visible \{[^}]*outline:/);
assert.match(workspace,/const \[noteAction,setNoteAction\]=useState/);
assert.match(workspace,/onNoteAction=\{\(mode,card\)=>\{setDetailBookingId\(null\);setQuickAdd\(null\);setOperationalEditCard\(null\);setNoteAction\(\{mode,card\}\);\}\}/);
assert.match(workspace,/setQuickAdd\(null\);\s*setNoteAction\(null\);\s*setOperationalEditCard\(null\);\s*setDetailBookingId\(card\.bookingId\)/);
assert.match(workspace,/setDetailBookingId\(null\);\s*setNoteAction\(null\);\s*setOperationalEditCard\(null\);\s*setQuickAdd\(\{date\}\)/);
assert.match(workspace,/noteAction \? <NoteActionPanel/);
assert.match(workspace,/onCardUpdated\([^;]+\);onClose\(\)/);
assert.match(editor,/event\.key==='Escape'/);
assert.match(editor,/input\.focus\(\);try\{input\.showPicker\(\)\}catch/);
const noteEditor=editor.slice(editor.indexOf('function NoteEditor('),editor.indexOf('function NoteConverter('));
assert.match(noteEditor, /label className="calendar-note-date-field" htmlFor="calendar-note-edit-date"/);
assert.match(noteEditor, /DateOnlyPicker ariaLabel="Note date" disabled=\{saving\} id="calendar-note-edit-date" onChange=\{setDate\} value=\{date\}/);
assert.doesNotMatch(noteEditor, /type="date"/, 'Note editing uses the existing full-field picker, not the native icon target');
assert.match(productionIdentityFix, /CASE WHEN p_linked_internal_job_id IS NULL THEN p_shop_hours ELSE v_job\.shop_hours END/);
assert.match(productionIdentityFix, /CASE WHEN p_scheduled_date IS NULL THEN NULL ELSE p_scheduled_date::text END/);
assert.match(editor, /shopHours:hours===''\?null:Number\(hours\)/);
assert.match(editor,/onSaved\(result\.card\);onClose\(\)/);
assert.match(editor,/onConverted\([^;]+\);onClose\(\)/);
assert.match(editor,/disabled=\{saving\} type="submit"/);
assert.doesNotMatch(styles,/input\[type="date"\]::\-webkit-calendar-picker-indicator/);
assert.match(itemMapping,/replaceCalendarCardLocally[\s\S]*filter\(\(current\)=>current\.bookingId!==card\.bookingId\)[\s\S]*day\.date===card\.productionDate[\s\S]*card\.productionDate===null/);
assert.match(workspace,/removeCalendarCardLocally\(current,noteAction\.card\.bookingId\)/);
assert.doesNotMatch(actions,/for\s*\([^)]*\)[^{]*\{[^}]*\.from\(/s,'server actions must not query per rendered Note');
assert.doesNotMatch(actions,/console\.(?:log|error|warn)/,'Calendar server actions must not retain temporary development logging');

console.log('Calendar Notes database contract verification passed (static; PostgreSQL execution not proven)');

// Exercise actual server-action argument forwarding with isolated session/RPC/read boundaries.
// These checks never connect to Supabase or execute migration SQL.
let allowed = true;
let calls = [];
let card = { bookingId: 'item:note', productionDate: null, title: 'Measure opening', revision: 1 };
const actionModule = { exports: {} };
const compiled = ts.transpileModule(actions, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { exports: actionModule.exports, module: actionModule, require(name) {
  if (name.endsWith('/auth/current-access')) return { getCurrentDoorGoAccess: async () => ({}) };
  if (name.endsWith('/auth/access')) return { getPermissionAccess: () => allowed ? 'use' : 'none' };
  if (name.endsWith('/supabase/server')) return { createAuthenticatedSupabaseServerClient: async () => ({ rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: { id: 'note', record_kind: 'calendar_item' }, error: null };
  } }) };
  if (name.endsWith('/production-board/queries')) return { loadProductionBoardReadOnly: async () => ({ needsAttentionCards: card.productionDate === null ? [card] : [], days: [{ cards: card.productionDate ? [card] : [] }] }) };
  return new Proxy({}, { get: () => () => { throw new Error(`Unexpected dependency: ${name}`); } });
} });
const api = actionModule.exports;
const context = { commandId: 'command', itemId: 'note', expectedRevision: 1, boardStart: '2026-09-14', boardEndExclusive: '2026-09-28', weeks: 2, today: '2026-09-14' };
const noteInput = { ...context, itemType: 'note', scheduledDate: null, linkedInternalJobId: null, name: 'Measure opening', title: 'Measure opening', details: 'Check dimensions', salesOrder: '', salesperson: '', shopHours: null, timing: '', fulfillmentNote: '' };
assert.equal((await api.createCalendarItem(noteInput)).ok, true);
assert.equal(calls.at(-1).name, 'create_calendar_item');
assert.equal(calls.at(-1).args.p_item_type, 'note');
assert.equal(calls.at(-1).args.p_scheduled_date, null);
for (const date of ['2026-09-15', null, '2026-09-16']) {
  card = { ...card, productionDate: date, revision: card.revision + 1 };
  const saved = await api.updateCalendarNote({ ...noteInput, scheduledDate: date });
  assert.equal(saved.ok, true);
  assert.equal(saved.card.productionDate, date);
  assert.equal(calls.at(-1).args.p_scheduled_date, date);
}
for (const completed of [true, false]) {
  assert.equal((await api.setCalendarItemCompletion({ ...context, completed })).ok, true);
  assert.equal(calls.at(-1).name, 'set_calendar_item_completion');
  assert.equal(calls.at(-1).args.p_completed, completed);
}
assert.equal((await api.deleteCalendarItem(context)).ok, true);
assert.equal(calls.at(-1).name, 'delete_calendar_item');
for (const linkedInternalJobId of [null, 'explicit-native-job']) {
  const result = await api.convertCalendarNote({ ...noteInput, destination: 'production', salesOrder: 'DG-000006', salesperson: 'Test', linkedInternalJobId });
  assert.equal(result.ok, true);
  assert.equal(calls.at(-1).name, 'convert_calendar_note');
  assert.equal(calls.at(-1).args.p_linked_internal_job_id, linkedInternalJobId);
  assert.equal(calls.at(-1).args.p_sales_order, 'DG-000006');
  assert.equal(calls.at(-1).args.p_shop_hours, null);
  assert.equal(calls.at(-1).args.p_scheduled_date, null);
}
allowed = false; calls = [];
for (const request of [() => api.createCalendarItem(noteInput), () => api.updateCalendarNote(noteInput), () => api.setCalendarItemCompletion({ ...context, completed: true }), () => api.deleteCalendarItem(context), () => api.convertCalendarNote({ ...noteInput, destination: 'production' })]) {
  assert.equal((await request()).ok, false);
}
assert.equal(calls.length, 0, 'Denied callers cannot reach mutation RPCs');
console.log('Calendar Notes mocked server-action regressions passed: create/edit/date/complete/reopen/delete/conversion/permission denial');

// Retain the existing relocation model tests in the focused Notes command.
const mappingModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(itemMapping, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: mappingModule, exports: mappingModule.exports });
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/calendar/calendar-items.test.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports: {}, console, require(name) {
  if (name === 'node:assert/strict') return assert;
  if (name === './calendar-items') return mappingModule.exports;
  throw new Error(`Unexpected relocation test dependency: ${name}`);
} });
