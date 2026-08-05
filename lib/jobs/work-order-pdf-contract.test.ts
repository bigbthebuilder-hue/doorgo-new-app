import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, StandardFonts } from 'pdf-lib';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import { JobIntakeFailure, type NativeDoorLine, type NativeJobAggregate } from './job-intake-types';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { createWorkOrderRowGroup, generateWorkOrderDocument, type WorkOrderDocument, type WorkOrderRowGroup } from './work-order-document-contract';
import { calculateWorkOrderDiagramBounds, measureWorkOrderGroup, normalizeWorkOrderPdfText, printedWorkOrderStatusLabel, renderWorkOrderPdf, WORK_ORDER_PDF_COLUMN_WIDTHS, WORK_ORDER_PDF_TEXT_SIZES, WORK_ORDER_PDF_UNSUPPORTED_CHARACTER_FALLBACK, workOrderPdfHeaders } from './work-order-pdf-contract';
import { generateRevisionPinnedSavedWorkOrderPdfWithAccess, generateSavedWorkOrderPdfWithAccess } from './work-order-pdf-service-contract';
import { APPLY_LINE_BEFORE_OUTPUT_MESSAGE, buildWorkOrderPdfUrl, workOrderOutputDecision } from './work-order-preview-contract';
import { assertWorkOrderPreflight, evaluateWorkOrderPreflight } from './work-order-preflight-contract';

function access(level: 'none' | 'view' | 'use', manager = false, includePermission = true) {
  return resolveCurrentDoorGoAccess({ user: { id: 'user' }, profile: { user_id: 'user', display_name: 'User', active: true, is_manager: manager, company_location: null, must_change_password: false }, permissionRows: includePermission ? [{ permission_key: 'jobs', access_level: level }] : [] });
}

function line(overrides: Partial<NativeDoorLine> = {}): NativeDoorLine {
  return {
    lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active', mode: 'Interior', doorType: 'Molded', config: 'B.P.', width: `3'0"`, height: `6'8"`, customSlab: 'No', customSlabWidth: null, customSlabHeight: null, hand: null, prep: 'NO', glass: null, jambWidth: null, jambType: null, sill: null, weatherstrip: null, hingeType: null, notes: null, qty: 1, roWidth: null, roHeight: null, material: 'wood', doorThickness: null, ripJamb: null, glassCalcStatus: 'Ready', glassWorkorderDetail: null, glassWarnings: [], glassBlockers: [], glassOverride: null, glassUnits: [], glassCalc: null, vendorCopyText: null, sidelightType: null, sidelightGlass: null, transomGlass: null, sidelightMeasurementLeft: null, sidelightMeasurementRight: null, panelSidelightWidth: null, panelSidelights: [], createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z', createdByUserId: 'user', updatedByUserId: 'user', ...overrides, includeDiagramOnWorkOrder: overrides.includeDiagramOnWorkOrder ?? false,
  };
}

function aggregate(overrides: Partial<NativeJobAggregate> = {}): NativeJobAggregate {
  return {
    internalJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', doorGoReference: 'DG-000123', bizTrackSalesOrder: null, customer: 'Customer', siteAddress: 'Site', phone: '555', email: 'customer@example.com', salesperson: 'Barrett', lifecycleStage: 'Confirmed Job', notes: 'Notes', hingeColor: 'C15', shopHours: 4.5, shopHoursSource: 'Manual', poNumbers: ['1234502', '1234500', '1234501'], fulfillmentPlan: null, deliveryDate: null, customerPickupDate: null, shopDate: null, shopDateSource: null, createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z', revision: 4, createdByUserId: 'user', updatedByUserId: 'user', lines: [line()], ...overrides,
  };
}

const generation = { generatedAt: '2026-07-22T18:00:00.000Z', generatedDate: '2026-07-22' };

function extractedWinAnsiText(bytes: Uint8Array): Promise<string> {
  return PDFDocument.load(bytes).then((pdf) => {
    const decoder = new TextDecoder('windows-1252');
    return pdf.getPages().flatMap((page) => {
      const contents = page.node.Contents();
      const references = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
      return references.flatMap((reference) => {
        const stream = pdf.context.lookup(reference);
        assert.ok(stream instanceof PDFRawStream, 'page content is a decodable raw PDF stream');
        const decoded = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
        return [...decoded.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((match) => {
          const pairs = match[1].match(/.{2}/g) ?? [];
          return decoder.decode(Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16)));
        });
      });
    }).join('\n');
  });
}

async function main() {
  assert.deepEqual(workOrderOutputDecision({ hasSavedJob: true, dirty: false, canEdit: false, hasUnappliedLineChanges: false }), { ok: true, saveRequired: false });
  assert.deepEqual(workOrderOutputDecision({ hasSavedJob: true, dirty: true, canEdit: true, hasUnappliedLineChanges: false }), { ok: true, saveRequired: true });
  assert.deepEqual(workOrderOutputDecision({ hasSavedJob: true, dirty: true, canEdit: false, hasUnappliedLineChanges: false }), { ok: false, message: 'You do not have permission to save pending job changes.' });
  assert.deepEqual(workOrderOutputDecision({ hasSavedJob: true, dirty: true, canEdit: true, hasUnappliedLineChanges: true }), { ok: false, message: APPLY_LINE_BEFORE_OUTPUT_MESSAGE });
  const url = buildWorkOrderPdfUrl({ internalJobId: 'job/id', sourceRevision: 4, mode: 'attachment' });
  assert.match(url, /job%2Fid\/work-order\/pdf/);
  assert.match(url, /revision=4/);
  assert.match(url, /download=1/);
  assert.equal(printedWorkOrderStatusLabel('Complete'), '');
  assert.equal(printedWorkOrderStatusLabel('Warning'), 'WARNING');

  const base = generateWorkOrderDocument(aggregate(), generation);
  const cleanedGlassDocument = generateWorkOrderDocument(aggregate({ lines: [line({
    mode: 'Exterior', config: 'T/D', notes: null, roWidth: '75', roHeight: '99', glassCalcStatus: 'Complete',
    glassCalc: { transomWidth: `72 7/16"`, transomHeight: `15 1/8"` },
    glassUnits: [{ position: 'Transom', width: `72 7/16"`, height: `15 1/8"`, glassType: 'Clear', termCode: 'CLR', qty: 1 }],
  })] }), generation);
  assert.equal(cleanedGlassDocument.rowGroups[0].primaryRow.cells.notesGlass, 'RO 75" × 99"', 'preview document model omits the generic Glass marker');
  assert.ok((await renderWorkOrderPdf(cleanedGlassDocument)).length > 500, 'PDF consumes the same cleaned projected document model');
  const acceptedTransomSource = line({
    mode: 'Exterior', config: 'T/DS', width: `3'0"`, height: `6'8"`, material: 'fiberglass', hand: 'RHOUT',
    roWidth: '54', roHeight: '98', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomGlass: 'CLR_SB60_K4SG',
    glassCalcStatus: 'Complete', glassCalc: { jambLeg: `81"` }, glassWorkorderDetail: 'Jamb legs: 81"',
  });
  assert.equal(calculateGlassGeometry(acceptedTransomSource).glassCalc?.jambLeg, `97 1/2"`);
  const acceptedTransomDocument = generateWorkOrderDocument(aggregate({ lines: [acceptedTransomSource] }), generation);
  const acceptedTransomPdfText = await extractedWinAnsiText(await renderWorkOrderPdf(acceptedTransomDocument));
  assert.ok(acceptedTransomPdfText.includes('Jamb legs: 97 1/2"'), 'PDF text uses the shared corrected transom jamb-leg result');
  assert.equal(acceptedTransomPdfText.includes('Jamb legs: 81"'), false);
  const measurementPdf = await PDFDocument.create();
  const measurementFont = await measurementPdf.embedFont(StandardFonts.Helvetica);
  const measurementBold = await measurementPdf.embedFont(StandardFonts.HelveticaBold);
  const supportedPunctuation = '–—‘’“”°¼½¾';
  assert.equal(normalizeWorkOrderPdfText(measurementFont, supportedPunctuation), supportedPunctuation, 'required WinAnsi punctuation remains intact');
  assert.equal(normalizeWorkOrderPdfText(measurementFont, 'unsupported 😀'), `unsupported ${WORK_ORDER_PDF_UNSUPPORTED_CHARACTER_FALLBACK}`, 'unsupported font characters use the explicit fallback');
  const detailedLayout = measureWorkOrderGroup(base.rowGroups[0].primaryRow, base.rowGroups[0].detailRows, measurementFont);
  assert.ok(detailedLayout.detailHeight > 0);
  assert.equal(detailedLayout.totalHeight, detailedLayout.primaryHeight + detailedLayout.detailHeight, 'primary and details share one measured physical group');
  const noDetailsLayout = measureWorkOrderGroup(base.rowGroups[0].primaryRow, [], measurementFont);
  assert.equal(noDetailsLayout.detailHeight, 0, 'doors without details do not reserve an empty detail area');
  assert.equal(noDetailsLayout.totalHeight, noDetailsLayout.primaryHeight);
  const wrappedDrill = generateWorkOrderDocument(aggregate({ lines: [line({ prep: 'HALF' })] }), generation).rowGroups[0];
  const wrappedLayout = measureWorkOrderGroup(wrappedDrill.primaryRow, wrappedDrill.detailRows, measurementFont);
  assert.ok(wrappedLayout.primaryLines[5].length >= 2, 'long drill wording wraps instead of truncating');
  assert.ok(wrappedLayout.primaryHeight >= wrappedLayout.primaryLines[5].length * 12 + 10, 'wrapped primary cells receive top and bottom padding');
  const safeWordRow = { ...base.rowGroups[0].primaryRow, cells: { ...base.rowGroups[0].primaryRow.cells, doorType: 'Custom Fiberglass', drill: 'Half drill for finger pulls' } };
  const safeWordLayout = measureWorkOrderGroup(safeWordRow, [], measurementFont);
  assert.deepEqual(safeWordLayout.primaryLines[4], ['Custom', 'Fiberglass'], 'Door Type wraps only between words');
  assert.equal(safeWordLayout.primaryLines.flat().some((value) => value === 'Fiberg' || value === 'lass'), false, 'normal words are never split mid-word');
  assert.deepEqual(WORK_ORDER_PDF_TEXT_SIZES, { headerLabel: 8.5, headerValue: 10, tableHeader: 9, primary: 10.5, detail: 10 });
  base.columns.forEach((heading, index) => assert.ok(measurementBold.widthOfTextAtSize(heading, WORK_ORDER_PDF_TEXT_SIZES.tableHeader) <= WORK_ORDER_PDF_COLUMN_WIDTHS[index] - 6, `${heading} remains on one line`));
  assert.equal(base.rowGroups[0].detailRows.flatMap((row) => row.lines).some((value) => /FRAME\/CUT|F\.O\.\/CUT|^GLASS:/i.test(value)), false, 'production detail has no category prefixes');

  const diagramGroup = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'T/SDS', includeDiagramOnWorkOrder: true, hand: 'LH', jambWidth: `6-9/16"`, jambType: 'Primed', hingeType: 'BB', glassCalcStatus: 'Complete', glassCalc: { headerWidth: `75"`, slabWidth: `36"`, finalDoorHeight: `80"`, divider: `2 1/4"`, sidelightWidth: `14"`, sidelightHeight: `80"`, transomWidth: `75"`, transomHeight: `16"`, sidelightType: 'Glass' } }), 'L1');
  assert.ok(diagramGroup.diagram);
  const diagramLayout = measureWorkOrderGroup(diagramGroup.primaryRow, diagramGroup.detailRows, measurementFont, diagramGroup.diagram);
  const diagramlessLayout = measureWorkOrderGroup(diagramGroup.primaryRow, diagramGroup.detailRows, measurementFont, null);
  assert.equal(diagramLayout.detailHeight, diagramlessLayout.detailHeight, 'diagram reuses existing group height instead of creating a diagram row');
  assert.equal(diagramLayout.diagramReservedWidth, 122, 'diagram column is reserved before text layout');
  assert.ok(diagramLayout.detailTextWidth < diagramlessLayout.detailTextWidth, 'detail text wraps inside the left-side region');
  const longDiagramLayout = measureWorkOrderGroup(
    { ...diagramGroup.primaryRow, cells: { ...diagramGroup.primaryRow.cells, notesGlass: 'A very long saved detail note that must wrap without displacing the diagram from its reserved upper-right region' } },
    [{ kind: 'glass', lines: ['3 sidelights @ 11 5/8" × 79 1/8" Clear with a deliberately long saved production detail'] }],
    measurementFont,
    diagramGroup.diagram,
  );
  assert.equal(longDiagramLayout.diagramReservedWidth, 122);
  assert.ok(longDiagramLayout.primaryLines.at(-1)!.length > 1, 'long notes wrap beside the reserved diagram');
  const diagramBounds = calculateWorkOrderDiagramBounds(diagramGroup.diagram!, 400, longDiagramLayout.totalHeight);
  assert.ok(diagramBounds.left >= 24 + 744 - 122, 'diagram remains inside the reserved upper-right region');
  const diagramOffGroup = { ...diagramGroup, diagram: null };
  assert.ok(measureWorkOrderGroup(diagramOffGroup.primaryRow, [], measurementFont, null).detailHeight === 0, 'diagram-off group reserves no diagram space');
  const statuses = ['Complete', 'Glass Detail Needed', 'Warning', 'Blocked', 'Manual Override'] as const;
  const groups: WorkOrderRowGroup[] = statuses.map((status, index) => ({
    ...base.rowGroups[0], primaryRow: { ...base.rowGroups[0].primaryRow, lineId: String(index + 1), lineIndex: index + 1, status },
    detailRows: status === 'Complete' ? base.rowGroups[0].detailRows : [{ kind: status === 'Glass Detail Needed' ? 'detail-needed' : status === 'Manual Override' ? 'manual-override' : status.toLowerCase() as 'warning' | 'blocker', lines: [status], ...(status === 'Manual Override' ? { calculatedValues: { headerWidth: `58"` }, acceptedValues: { headerWidth: `58 1/8"` }, overrideReason: 'Site verified' } : {}) }],
  }));
  assert.ok(measureWorkOrderGroup(groups[2].primaryRow, groups[2].detailRows, measurementFont).detailLayouts.some((detail) => detail.label === 'WARNING: '), 'warning remains in its parent group');
  assert.ok(measureWorkOrderGroup(groups[4].primaryRow, groups[4].detailRows, measurementFont).detailLayouts.some((detail) => detail.label === 'MANUAL OVERRIDE: '), 'manual override remains in its parent group');
  const first = { ...base.pages[0], rowGroups: groups.slice(0, 2), totalPages: 2, footerText: 'Sales Order / Job ID: DG-000123 | Page 1 of 2' };
  const second = { ...base.pages[0], pageNumber: 2, totalPages: 2, kind: 'Continuation' as const, header: null, continuationHeader: { customer: 'Customer', visibleIdentifier: 'DG-000123', label: 'Continued' as const }, rowGroups: groups.slice(2), footerText: 'Sales Order / Job ID: DG-000123 | Page 2 of 2' };
  const multi: WorkOrderDocument = { ...base, rowGroups: groups, pages: [first, second] };
  const preflight = evaluateWorkOrderPreflight(multi);
  assert.equal(preflight.blocked, true);
  assert.equal(preflight.acknowledgementRequired, true);
  assert.match(preflight.issues.find((issue) => issue.status === 'Manual Override')?.message ?? '', /Manual Override/);
  assert.throws(() => assertWorkOrderPreflight(multi, true), /blocked door lines/);
  const loaded = await PDFDocument.load(await renderWorkOrderPdf(multi));
  assert.equal(loaded.getPageCount(), 2, 'renderer follows the J3A page model exactly');
  assert.equal(loaded.getTitle(), 'Work_Order_DG-000123');

  const fiveLine = generateWorkOrderDocument(aggregate({ lines: Array.from({ length: 5 }, (_, index) => line({ lineId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, lineIndex: index + 1 })) }), generation);
  assert.equal(fiveLine.pages.length, 1, 'representative five-line work order stays on one J3A page');
  assert.equal((await PDFDocument.load(await renderWorkOrderPdf(fiveLine))).getPageCount(), 1, 'all five allocated groups physically render on the page');

  const inline = workOrderPdfHeaders(base, 'inline');
  const attachment = workOrderPdfHeaders(base, 'attachment');
  assert.equal(inline.get('content-type'), 'application/pdf');
  assert.match(inline.get('content-disposition') ?? '', /^inline;.*Work_Order_DG-000123\.pdf/);
  assert.match(attachment.get('content-disposition') ?? '', /^attachment;.*Work_Order_DG-000123\.pdf/);
  assert.equal(inline.get('cache-control'), 'private, no-store, max-age=0');
  const sales = generateWorkOrderDocument(aggregate({ bizTrackSalesOrder: 'SO/900' }), generation);
  assert.equal(sales.pdfFilename, 'Work_Order_SO_900.pdf');

  let reads = 0;
  const repository = { findById: async () => { reads += 1; return aggregate(); } };
  for (const level of ['view', 'use'] as const) {
    const rendered = await generateSavedWorkOrderPdfWithAccess(access(level), 'id', 'inline', repository);
    assert.equal(rendered.document.internalCorrelation.sourceAggregateRevision, 4);
    assert.ok(rendered.bytes.length > 500);
  }
  assert.equal(reads, 2);
  await assert.rejects(generateSavedWorkOrderPdfWithAccess(access('none'), 'id', 'inline', repository), JobIntakeFailure);
  await assert.rejects(generateSavedWorkOrderPdfWithAccess(access('none', true), 'id', 'inline', repository), JobIntakeFailure);
  await assert.rejects(generateSavedWorkOrderPdfWithAccess(access('none', false, false), 'id', 'inline', repository), JobIntakeFailure);
  assert.equal(reads, 2, 'unauthorized generation does not read the repository');

  const warningRepository = { findById: async () => aggregate({ lines: [line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Warning', glassWarnings: [{ code: 'review', message: 'Review opening.' }], glassCalc: { headerWidth: `58"` } })] }) };
  await assert.rejects(generateSavedWorkOrderPdfWithAccess(access('view'), 'id', 'inline', warningRepository), /acknowledged/);
  assert.ok((await generateSavedWorkOrderPdfWithAccess(access('view'), 'id', 'inline', warningRepository, true)).bytes.length > 500);
  const blockedRepository = { findById: async () => aggregate({ lines: [line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Blocked', glassBlockers: [{ code: 'blocked', message: 'Impossible geometry.' }] })] }) };
  await assert.rejects(generateSavedWorkOrderPdfWithAccess(access('use'), 'id', 'inline', blockedRepository, true), /blocked door lines/);

  const invalidColorAggregate = aggregate({ hingeColor: 'Long arbitrary black hinge description' });
  const invalidColorDocument = generateWorkOrderDocument(invalidColorAggregate, generation);
  assert.equal(evaluateWorkOrderPreflight(invalidColorDocument).blocked, true);
  assert.equal(invalidColorDocument.rowGroups.some((group) => group.primaryRow.cells.hinge.includes('arbitrary')), false);
  await assert.rejects(generateSavedWorkOrderPdfWithAccess(access('view'), 'id', 'inline', { findById: async () => invalidColorAggregate }), /blocked door lines/);
  const invalidInteriorDocument = generateWorkOrderDocument(aggregate({ lines: [line({ mode: 'Interior', config: 'D', hand: 'LH', jambWidth: `4-9/16"`, jambType: 'Primed', hingeType: 'NRP' })] }), generation);
  assert.equal(evaluateWorkOrderPreflight(invalidInteriorDocument).blocked, true);
  assert.match(evaluateWorkOrderPreflight(invalidInteriorDocument).issues[0]?.message ?? '', /Interior doors may use REG or BB/);

  const dirtyBrowserAggregate = aggregate({ customer: 'Unsaved Browser Customer' });
  const savedRepository = { findById: async () => aggregate({ customer: 'Saved Customer' }) };
  const savedResult = await generateSavedWorkOrderPdfWithAccess(access('view'), dirtyBrowserAggregate.internalJobId, 'inline', savedRepository);
  assert.equal(savedResult.document.header.customer, 'Saved Customer');
  assert.equal(savedResult.document.header.customer.includes('Unsaved Browser'), false);

  const punctuationAggregate = aggregate({
    updatedAt: '2026-07-28T14:56:57.698Z',
    revision: 5,
    notes: 'NON-PRODUCTION TEST – DO NOT BUILD OR SCHEDULE — ‘single’ “double” ° ¼ ½ ¾',
  });
  const punctuationRepository = { findById: async () => structuredClone(punctuationAggregate) };
  const download = await generateSavedWorkOrderPdfWithAccess(access('view'), punctuationAggregate.internalJobId, 'attachment', punctuationRepository);
  const sendAttachment = await generateRevisionPinnedSavedWorkOrderPdfWithAccess(access('view'), punctuationAggregate.internalJobId, 5, punctuationRepository);
  assert.equal(download.document.pdfFilename, sendAttachment.document.pdfFilename, 'Download and Send use the same authoritative filename');
  assert.deepEqual(download.bytes, sendAttachment.bytes, 'Download and Send are byte-for-byte identical independent of wall-clock time');
  assert.equal(createHash('sha256').update(download.bytes).digest('hex'), createHash('sha256').update(sendAttachment.bytes).digest('hex'), 'Download and Send SHA-256 values match');
  const loadedDeterministic = await PDFDocument.load(download.bytes, { updateMetadata: false });
  const pdfMetadataTimestamp = punctuationAggregate.updatedAt.replace(/\.\d{3}Z$/, '.000Z');
  assert.equal(loadedDeterministic.getCreationDate()?.toISOString(), pdfMetadataTimestamp, 'PDF CreationDate uses the saved revision timestamp at PDF date precision');
  assert.equal(loadedDeterministic.getModificationDate()?.toISOString(), pdfMetadataTimestamp, 'PDF ModDate uses the saved revision timestamp at PDF date precision');
  const extracted = await extractedWinAnsiText(download.bytes);
  assert.ok(extracted.includes(punctuationAggregate.notes!), 'final PDF text extraction preserves required punctuation');
  assert.ok(extracted.includes('NON-PRODUCTION TEST – DO NOT BUILD OR SCHEDULE'));
  assert.equal(extracted.includes('NON-PRODUCTION TEST ? DO NOT BUILD OR SCHEDULE'), false, 'the saved en dash is never replaced with U+003F');
  console.log('Native Job Intake J3B saved PDF workflow: PASS');
}

void main();
