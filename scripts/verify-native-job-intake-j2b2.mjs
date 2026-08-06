import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'components/jobs/DoorLineWorkspace.tsx', 'components/jobs/GlassUnitBuilder.tsx', 'components/jobs/GlassUnitDiagram.tsx',
  'lib/jobs/glass-diagram-contract.ts',
  'lib/jobs/job-intake-actions.ts', 'lib/jobs/job-intake-service.ts', 'lib/jobs/glass-geometry-contract.ts',
  'lib/jobs/door-line-contract.ts', 'lib/jobs/local-job-intake-repository.ts',
];
const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
for (const [label, pattern] of [
  ['browser Supabase write', /lib\/supabase\/client|createBrowserClient/],
  ['trusted/service-role write', /trusted-read-server|service[_-]?role/i],
  ['hosted mutation', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/],
  ['intake RPC', /\.rpc\s*\(/],
  ['production mutation', /createProductionBooking|production-booking-actions|createFulfillment|CalendarApp/],
]) assert.equal(pattern.test(source), false, `J2B2 must not contain ${label}`);

const workspace = await readFile('components/jobs/DoorLineWorkspace.tsx', 'utf8');
for (const required of [
  'retainCompatibleGlassFields', 'calculateGlassGeometry', 'Configure Glass Unit', 'Edit Glass Unit',
  'Apply Manual Override', 'Remove Override', 'GlassUnitBuilder', 'Needs Attention',
  '54, 54 1/2, 54-1/2, or 54.5', 'aria-label={`${label}, inches`',
  'explicitGlassDetailNeeded', 'commitEditor()', 'setExplicitGlassDetailNeeded(explicitDetailNeeded)',
  'resolvedConfiguration(config)', 'prepAfterHeightChange', 'replaceDoorLineAtIndex(lines, editingIndex, saved)',
]) assert.ok(workspace.includes(required), `J2B2 workspace missing ${required}`);
assert.equal(workspace.includes('onChange((current)'), false, 'workspace must not update child state from a parent updater');
const builder = await readFile('components/jobs/GlassUnitBuilder.tsx', 'utf8');
for (const required of [
  'Use Configuration', 'Leave Glass Detail Needed', 'Cancel', 'calculateGlassGeometry',
  'calculateGlassCompositionSchematic', 'nextGlassBuilderDraft', 'GlassUnitDiagram',
  'Sidelight positions', 'Custom Glass Sidelight Width', 'Custom Panel Sidelight Width',
  'T-bar Size', 'Custom Transom Width', 'Copy Vendor Text', 'includeDiagramOnWorkOrder',
  'EXTERIOR_WIDTHS', 'DOOR_HEIGHTS', 'Slab Width', 'Slab Height', 'prepAfterHeightChange',
]) assert.ok(builder.includes(required), `Glass Unit Builder missing ${required}`);
assert.equal(builder.includes("normalizeSidelightType(draft.sidelightType) ?? 'Glass'"), false, 'builder must not display a sidelight type absent from the authoritative draft');
assert.ok(builder.includes("calculation.status === 'Glass Detail Needed'"), 'progressive action must be limited to incomplete detail');
assert.ok(builder.includes("['Complete', 'Warning', 'Manual Override'].includes(calculation.status)"), 'normal use must be limited to applicable calculated states');
assert.ok(builder.includes('tabIndex={-1}'), 'header Cancel must not interrupt normal forward tab order');
assert.ok(builder.includes('}, []);'), 'modal focus management must initialize only once, not after each draft update');
assert.equal(/repository\.|createBrowserClient|\.rpc\s*\(/.test(builder), false, 'builder must only update its isolated client draft');
assert.deepEqual([...builder.matchAll(/<option value="(1\.5|2\.25)">/g)].map((match) => match[1]).filter((value, index, values) => values.indexOf(value) === index).sort(), ['1.5', '2.25'], 'builder exposes only canonical T-bar sizes');

const diagram = await readFile('components/jobs/GlassUnitDiagram.tsx', 'utf8');
for (const required of ['preserveAspectRatio="xMidYMid meet"', 'calculateGlassDiagramLayout(line)', 'layout.parts.map', 'data-kind', 'diagram-background', 'var(--glass-diagram-background', 'var(--glass-diagram-stroke']) assert.ok(diagram.includes(required));
assert.equal(/sideWidth\s*=\s*\d|transomHeight\s*=\s*\d|viewBox="0 0 100 100"/.test(diagram), false, 'React must not independently approximate physical diagram geometry');
assert.equal(/https?:\/\//.test(diagram), false, 'diagram must not depend on external images');
const css = await readFile('app/globals.css', 'utf8');
for (const required of ['.glass-unit-diagram', '.diagram-background { fill: rgb(241 245 249)', '.diagram-frame { fill: none', '@media (prefers-color-scheme: dark)', '@media print']) assert.ok(css.includes(required));
for (const required of ['--glass-diagram-background', '--glass-diagram-door', '--glass-diagram-glass', '--glass-diagram-bar', '.dark .glass-unit-diagram']) assert.ok(css.includes(required));
assert.equal(/diagram-background[^}]*fill:\s*(?:black|#000|rgb\(0\s+0\s+0\))/i.test(css), false, 'light diagram background must not be solid black');
const actions = await readFile('lib/jobs/job-intake-actions.ts', 'utf8');
const service = await readFile('lib/jobs/job-intake-service.ts', 'utf8');
assert.ok(actions.includes('prepareGlassOverrideWithAccess(access'));
assert.ok(actions.includes('removeGlassOverrideWithAccess(access)'));
assert.ok(service.includes('assertJobsWriteAccess(access)'));
console.log('Native Job Intake J2B2 hosted-write and UI verifier: PASS');
