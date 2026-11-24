import assert from 'node:assert/strict';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import { defaultDoorLine } from './door-line-contract';
import type { NativeJobAggregate } from './job-intake-types';
import { loadSavedJobPrintWithAccess } from './saved-job-print-contract';
import { clampActionCard, centreActionCard } from '../calendar/action-card-position';
const id = '11111111-1111-4111-8111-111111111111';
const access = (jobs: 'none'|'view'|'use', active = true) => resolveCurrentDoorGoAccess({ user: { id: 'fixture' }, profile: { user_id: 'fixture', display_name: 'Fixture', active, is_manager: false, company_location: null, must_change_password: false }, permissionRows: [{ permission_key: 'calendar', access_level: 'use' }, { permission_key: 'jobs', access_level: jobs }] });
async function main() {
  let calls = 0, revision = 1;
  const repository = { findById: async () => { calls++; return { internalJobId: id, doorGoReference: 'DG-000001', customer: 'Latest ' + revision, revision, updatedAt: '2026-11-23T00:00:00Z', lifecycleStage: 'Draft', poNumbers: [], lines: [{ ...defaultDoorLine(), lineId: id, lineIndex: 1, lineStatus: 'Active' }] } as unknown as NativeJobAggregate; } };
  for (const kind of ['labels','work-order'] as const) for (const denied of [access('none'), access('view', false), resolveCurrentDoorGoAccess({user:null,profile:null,permissionRows:[]})]) {
    const before = calls;
    await assert.rejects(loadSavedJobPrintWithAccess(denied, id, kind, repository));
    assert.equal(calls, before, 'Calendar-only/inactive callers cannot discover protected Job information');
  }
  for (const jobs of ['view','use'] as const) {
    const labels = await loadSavedJobPrintWithAccess(access(jobs), id, 'labels', repository);
    assert.equal(labels.kind, 'labels'); if (labels.kind === 'labels') assert.equal(labels.job.customer, 'Latest ' + revision);
    revision++;
    const preview = await loadSavedJobPrintWithAccess(access(jobs), id, 'work-order', repository);
    assert.equal(preview.kind, 'work-order'); if (preview.kind === 'work-order') assert.equal(preview.sourceRevision, revision);
  }
  await assert.rejects(loadSavedJobPrintWithAccess(access('view'), 'arbitrary', 'labels', repository));
  await assert.rejects(loadSavedJobPrintWithAccess(access('view'), id, 'labels', {findById: async()=>null}));
  for (const viewport of [{ left: 0, top: 0, width: 390, height: 844 }, { left: 0, top: 0, width: 1600, height: 1000 }, { left: 50, top: 120, width: 700, height: 500 }]) {
    const size = { width: Math.min(352, viewport.width - 16), height: Math.min(450, viewport.height - 16) };
    assert.deepEqual(centreActionCard(size, viewport), { x: viewport.left + (viewport.width-size.width)/2, y: viewport.top+(viewport.height-size.height)/2 });
    assert.deepEqual(clampActionCard({ x: -999, y: -999 }, size, viewport), { x: viewport.left+8,y:viewport.top+8 });
    const edge = clampActionCard({ x: 99999, y: 99999 }, size, viewport);
    assert.ok(edge.x+size.width<=viewport.left+viewport.width-8); assert.ok(edge.y+size.height<=viewport.top+viewport.height-8);
  }
  console.log('Saved-print authorization, fresh reads, missing jobs, viewport centering and bounds passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
