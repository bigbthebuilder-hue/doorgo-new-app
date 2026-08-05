import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'lib/jobs/work-order-pdf-contract.ts', 'lib/jobs/work-order-pdf-service-contract.ts',
  'lib/jobs/work-order-preview-contract.ts', 'components/jobs/WorkOrderPreview.tsx',
  'lib/jobs/work-order-preflight-contract.ts',
  'app/jobs/[internalJobId]/work-order/page.tsx', 'app/jobs/[internalJobId]/work-order/pdf/route.ts',
];
const entries = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')]));
const source = entries.map(([, value]) => value).join('\n');
for (const [label, pattern] of [
  ['hosted intake write', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(|\.rpc\s*\(/],
  ['hosted storage upload', /\.storage\b|upload\s*\(/],
  ['repository write', /repository\.(?:create|update)\s*\(/],
  ['production, fulfillment, or scheduling mutation', /createProductionBooking|createFulfillment|production-booking-actions|reschedule/i],
  ['Calendar mutation', /CalendarApp|createCalendar|updateCalendar|deleteCalendar/],
  ['network request', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|node:https?|axios/i],
]) assert.equal(pattern.test(source), false, `J3B must not contain ${label}`);

const pdf = entries.find(([file]) => file.endsWith('work-order-pdf-contract.ts'))?.[1] ?? '';
assert.ok(pdf.includes('for (const modelPage of document.pages)'), 'PDF must render J3A pages');
assert.ok(pdf.includes('for (const group of modelPage.rowGroups)'), 'PDF must preserve J3A row groups');
assert.equal(/paginateWorkOrder|calculateNonGlassFrameCut|calculateGlassGeometry/.test(pdf), false, 'PDF must not recalculate or repaginate');
assert.equal(/truncate|['"`]\.\.\.['"`]/i.test(pdf), false, 'PDF must not truncate printed work-order content');
assert.equal(/Date\.now\s*\(|Math\.random\s*\(|crypto\.randomUUID/.test(pdf), false, 'PDF content path must remain deterministic');
assert.ok(pdf.includes("'Cache-Control': 'private, no-store, max-age=0'"));
assert.ok(pdf.includes('drawDoorGroup(page, group, regular, bold, y)'), 'renderer must draw each J3A row group as one physical block');
assert.equal(/function drawPrimary|function drawDetails/.test(pdf), false, 'primary and detail rows must not have detached drawing paths');
const groupDrawing = pdf.slice(pdf.indexOf('function drawDoorGroup'), pdf.indexOf('function drawFooter'));
assert.equal((groupDrawing.match(/page\.drawRectangle/g) ?? []).length, 1, 'one outer rectangle must surround the complete door group');
assert.ok(groupDrawing.includes('thickness: 1.4'), 'each complete door group must end with a strong bottom boundary');
assert.equal(groupDrawing.includes('start: { x: MARGIN, y: y - layout.primaryHeight }'), false, 'no horizontal divider may separate a primary row from its details');
assert.ok(groupDrawing.includes('y: y - layout.primaryHeight'), 'primary cells must have aligned vertical divisions');
assert.ok(pdf.includes('WORK_ORDER_PDF_TEXT_SIZES = { headerLabel: 8.5, headerValue: 10, tableHeader: 9, primary: 10.5, detail: 10 }'));
assert.ok(pdf.includes('function drawDiagram(') && pdf.includes('if (diagram) drawDiagram('));
assert.equal(/calculateGlassGeometry|calculateGlassDiagramLayout/.test(pdf), false, 'PDF renderer must not calculate diagram business geometry');
const diagramDrawing = pdf.slice(pdf.indexOf('function drawDiagram'), pdf.indexOf('function drawDoorGroup'));
assert.equal(diagramDrawing.includes('drawText('), false, 'printed diagrams must contain no text');
assert.ok(diagramDrawing.includes("part.kind === 'glass' ? rgb(0.84, 0.84, 0.84) : rgb(0.97, 0.97, 0.97)"), 'glass is shaded while panels share the door fill');
assert.equal(/pending\.slice|slice\(0,\s*end\)/.test(pdf), false, 'normal PDF wrapping must not split words by character');

const route = entries.find(([file]) => file.endsWith('pdf/route.ts'))?.[1] ?? '';
assert.ok(route.includes('generateCurrentSavedWorkOrder(internalJobId'));
assert.equal(/request\.json\s*\(|NativeJobAggregate|WorkOrderDocument/.test(route), false, 'route must not trust a client document or aggregate');
assert.ok(route.includes('sourceAggregateRevision !== expectedRevision'));
assert.ok(route.includes('assertWorkOrderPreflight(document'));
const page = entries.find(([file]) => file.endsWith('work-order/page.tsx'))?.[1] ?? '';
assert.ok(page.includes("hasAtLeastView(access, 'jobs')"));
assert.ok(page.includes('generateSavedWorkOrderWithAccess(access, internalJobId'));
const preview = entries.find(([file]) => file.endsWith('WorkOrderPreview.tsx'))?.[1] ?? '';
assert.ok(preview.includes('<iframe'));
assert.ok(preview.includes('Download PDF'));
assert.ok(preview.includes('contentWindow?.print()'));
assert.ok(preview.includes('Acknowledge and Preview'));
assert.ok(preview.includes("initialAction === 'download'") && preview.includes("initialAction === 'print'"));
assert.equal(/resend|RESEND_API_KEY|DOORGO_EMAIL_FROM/i.test(pdf + route), false, 'J3B renderer and PDF route remain provider-independent');
const form = await readFile('components/jobs/JobHeaderForm.tsx', 'utf8');
assert.ok(form.includes('workOrderOutputDecision({ hasSavedJob: Boolean(job), dirty, canEdit, hasUnappliedLineChanges })'));
assert.ok(form.includes('const saved = await persistAggregate()') && form.includes('router.push(outputPath(saved.internalJobId, intent))'), 'dirty output must wait for save and use its returned identity');
assert.ok(form.indexOf('const saved = await persistAggregate()') < form.indexOf('router.push(outputPath(saved.internalJobId, intent))'));
assert.ok(form.includes("openWorkOrder('download')") && form.includes("openWorkOrder('print')"));
assert.equal(/Save the job before printing the work order/.test(form), false, 'old generic Save-first blocker must be absent');
assert.ok(form.includes('onUnappliedChange={setHasUnappliedLineChanges}'));
assert.ok(form.includes('Preview Work Order'));
assert.ok(form.includes('<select') && form.includes('HINGE_COLOR_OPTIONS'), 'job hinge color must use the controlled selector');
assert.equal(/label="Hinge Color"[\s\S]{0,160}<input/.test(form), false, 'job hinge color must not accept free text');
const lineEditor = await readFile('components/jobs/DoorLineWorkspace.tsx', 'utf8');
assert.ok(lineEditor.includes('hingeTypeOptions(mode)'));
assert.ok(lineEditor.includes('hingeTypeAfterModeChange(nextMode'));
const glassBuilder = await readFile('components/jobs/GlassUnitBuilder.tsx', 'utf8');
assert.ok(glassBuilder.includes('Include diagram on work order'));
assert.ok(glassBuilder.includes("setField('includeDiagramOnWorkOrder', event.target.checked)"), 'diagram preference must remain explicit unsaved builder state');
assert.ok(lineEditor.includes('nextApplicable ? (previouslyApplicable ? editor.includeDiagramOnWorkOrder !== false : true) : false'), 'new applicable configurations default on');
assert.ok(lineEditor.includes('structuredClone(line)'), 'edit and duplicate flows preserve saved line fields');
const documentContract = await readFile('lib/jobs/work-order-document-contract.ts', 'utf8');
assert.ok(documentContract.includes('workOrderHingeDisplay({ ...outputLine, hingeColor })'));
assert.ok(documentContract.includes('withDerivedGlassGeometry(line)'), 'saved work-order output must derive current glass geometry from source inputs');
assert.equal(/function hingeDisplay/.test(documentContract), false, 'J3A must consume the shared hinge display contract');
assert.equal(/hingeType|hingeColor/.test(pdf), false, 'PDF renderer must consume final J3A hinge-cell text');
console.log('Native Job Intake J3B architecture and no-side-effect verifier: PASS');
