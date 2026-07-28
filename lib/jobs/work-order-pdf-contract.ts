import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { WorkOrderDetailRow, WorkOrderDocument, WorkOrderPage, WorkOrderPrimaryRow, WorkOrderRowGroup } from './work-order-document-contract';
import type { WorkOrderOutputMode } from './work-order-preview-contract';

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 24;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const WORK_ORDER_PDF_COLUMN_WIDTHS = [28, 40, 60, 38, 70, 64, 55, 48, 65, 48, 36, 192] as const;
const FOOTER_CLEARANCE = 34;
export const WORK_ORDER_PDF_TEXT_SIZES = { headerLabel: 8.5, headerValue: 10, tableHeader: 9, primary: 10.5, detail: 10 } as const;
const DIAGRAM_MAX_WIDTH = 110;
const DIAGRAM_MAX_HEIGHT = 58;

export function printedWorkOrderStatusLabel(status: WorkOrderPrimaryRow['status']): string {
  return status === 'Complete' ? '' : status.toUpperCase();
}

export const WORK_ORDER_PDF_UNSUPPORTED_CHARACTER_FALLBACK = '?';

const supportedCodePointsByFont = new WeakMap<PDFFont, ReadonlySet<number>>();

/** Preserves every printable character supported by the active PDF font and explicitly falls back otherwise. */
export function normalizeWorkOrderPdfText(font: PDFFont, value: unknown): string {
  let supported = supportedCodePointsByFont.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    supportedCodePointsByFont.set(font, supported);
  }
  return Array.from(String(value ?? ''), (character) => {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return ' ';
    if (codePoint < 0x20 || codePoint === 0x7f) return WORK_ORDER_PDF_UNSUPPORTED_CHARACTER_FALLBACK;
    return supported.has(codePoint) ? character : WORK_ORDER_PDF_UNSUPPORTED_CHARACTER_FALLBACK;
  }).join('');
}

function drawText(page: PDFPage, font: PDFFont, value: unknown, x: number, y: number, size = 8, color = rgb(0.08, 0.11, 0.16)) {
  page.drawText(normalizeWorkOrderPdfText(font, value), { x, y, size, font, color });
}

function wrapText(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const safe = normalizeWorkOrderPdfText(font, value);
  if (!safe) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of safe.split(/\s+/)) {
    const pending = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(pending, size) <= maxWidth) { current = pending; continue; }
    if (current) lines.push(current);
    current = '';
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function drawInlineLabelValue(page: PDFPage, regular: PDFFont, bold: PDFFont, label: string, value: string, x: number, y: number, width: number) {
  const labelText = `${label}:`;
  drawText(page, bold, labelText, x, y, WORK_ORDER_PDF_TEXT_SIZES.headerLabel);
  const valueX = x + bold.widthOfTextAtSize(labelText, WORK_ORDER_PDF_TEXT_SIZES.headerLabel) + 5;
  wrapText(regular, value, WORK_ORDER_PDF_TEXT_SIZES.headerValue, Math.max(20, width - (valueX - x))).forEach((line, index) => drawText(page, regular, line, valueX, y - index * 11, WORK_ORDER_PDF_TEXT_SIZES.headerValue));
}

function drawFirstHeader(page: PDFPage, document: WorkOrderDocument, regular: PDFFont, bold: PDFFont): number {
  const header = document.header;
  drawText(page, bold, 'CENTRAL BUILDERS SUPPLY - DOOR WORK ORDER', MARGIN, PAGE_HEIGHT - 28, 17);
  const top = PAGE_HEIGHT - 42;
  const leftWidth = 500;
  const rightX = MARGIN + leftWidth + 8;
  const rightWidth = CONTENT_WIDTH - leftWidth - 8;
  page.drawRectangle({ x: MARGIN, y: top - 104, width: leftWidth, height: 104, borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 1.2 });
  page.drawRectangle({ x: rightX, y: top - 104, width: rightWidth, height: 104, borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 1.2 });
  drawInlineLabelValue(page, regular, bold, 'Customer', header.customer, MARGIN + 7, top - 15, 238);
  drawInlineLabelValue(page, regular, bold, 'Site / Address', header.siteAddress, MARGIN + 252, top - 15, 241);
  drawInlineLabelValue(page, regular, bold, 'Contact', `Phone ${header.phone || 'Not provided'} | Email ${header.email || 'Not provided'}`, MARGIN + 7, top - 39, 486);
  drawInlineLabelValue(page, regular, bold, 'Salesperson', header.salesperson || 'Not selected', MARGIN + 7, top - 63, 155);
  drawInlineLabelValue(page, regular, bold, 'Shop Hours', [header.shopHours, header.shopHoursSource].filter(Boolean).join(' - ') || 'Not set', MARGIN + 168, top - 63, 155);
  drawInlineLabelValue(page, regular, bold, 'Fulfillment', [header.fulfillmentType, header.fulfillmentDate].filter(Boolean).join(' - ') || 'Not set', MARGIN + 329, top - 63, 164);
  drawInlineLabelValue(page, regular, bold, 'Notes', header.notes || 'None', MARGIN + 7, top - 88, 486);
  drawText(page, bold, 'Sales Order / Job ID', rightX + 7, top - 14, 9);
  drawText(page, bold, header.visibleIdentifier, rightX + 7, top - 34, 16);
  drawInlineLabelValue(page, regular, bold, 'Printed', header.generatedDate, rightX + 7, top - 53, rightWidth - 14);
  drawInlineLabelValue(page, regular, bold, 'Shop Date', header.shopDate || 'Not set', rightX + 7, top - 76, rightWidth - 14);
  drawInlineLabelValue(page, regular, bold, 'PO Numbers', header.poDisplay || 'None', rightX + 7, top - 98, rightWidth - 14);
  return top - 112;
}

function drawContinuationHeader(page: PDFPage, modelPage: WorkOrderPage, bold: PDFFont): number {
  drawText(page, bold, 'DOORGO WORK ORDER - CONTINUED', MARGIN, PAGE_HEIGHT - 31, 13);
  drawText(page, bold, modelPage.visibleIdentifier, PAGE_WIDTH - MARGIN - 170, PAGE_HEIGHT - 31, 11);
  if (modelPage.continuationHeader?.customer) drawText(page, bold, modelPage.continuationHeader.customer, MARGIN, PAGE_HEIGHT - 47, WORK_ORDER_PDF_TEXT_SIZES.headerValue);
  return PAGE_HEIGHT - 61;
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number, columns: readonly string[]): number {
  const height = 22;
  page.drawRectangle({ x: MARGIN, y: y - height, width: CONTENT_WIDTH, height, color: rgb(0.9, 0.9, 0.9), borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 1 });
  let x = MARGIN;
  columns.forEach((column, index) => {
    if (index) page.drawLine({ start: { x, y }, end: { x, y: y - height }, color: rgb(0.05, 0.05, 0.05), thickness: 0.7 });
    drawText(page, bold, column, x + 3, y - 14, WORK_ORDER_PDF_TEXT_SIZES.tableHeader);
    x += WORK_ORDER_PDF_COLUMN_WIDTHS[index];
  });
  return y - height;
}

function primaryCells(row: WorkOrderPrimaryRow): string[] {
  const cells = row.cells;
  return [cells.quantity, cells.configuration, cells.size, cells.thickness, cells.doorType, cells.drill, cells.hinge, cells.swing, cells.jamb, cells.sill, cells.weatherstrip, cells.notesGlass];
}

function detailLines(detail: WorkOrderDetailRow): string[] {
  return detail.lines;
}

type DetailLayout = { exception: boolean; label: string; lines: string[] };

export type WorkOrderGroupLayout = {
  primaryLines: string[][];
  primaryHeight: number;
  detailLayouts: DetailLayout[];
  detailHeight: number;
  totalHeight: number;
  diagramReservedWidth: number;
  detailTextWidth: number;
};

export function measureWorkOrderGroup(row: WorkOrderPrimaryRow, details: readonly WorkOrderDetailRow[], regular: PDFFont, diagram: WorkOrderRowGroup['diagram'] = null): WorkOrderGroupLayout {
  const diagramReservedWidth = diagram ? DIAGRAM_MAX_WIDTH + 12 : 0;
  const primaryLines = primaryCells(row).map((value, index) => wrapText(regular, value, WORK_ORDER_PDF_TEXT_SIZES.primary, Math.max(12, WORK_ORDER_PDF_COLUMN_WIDTHS[index] - 6 - (diagram && index === WORK_ORDER_PDF_COLUMN_WIDTHS.length - 1 ? diagramReservedWidth : 0))));
  const primaryHeight = Math.max(26, Math.max(...primaryLines.map((lines) => lines.length)) * 12 + 10);
  const detailWidth = CONTENT_WIDTH - 38 - diagramReservedWidth;
  const detailLayouts = details.map((detail): DetailLayout => {
    const exception = detail.kind === 'warning' || detail.kind === 'blocker' || detail.kind === 'detail-needed' || detail.kind === 'manual-override';
    const label = detail.kind === 'warning' ? 'WARNING: ' : detail.kind === 'manual-override' ? 'MANUAL OVERRIDE: ' : detail.kind === 'detail-needed' ? 'GLASS DETAIL NEEDED: ' : detail.kind === 'blocker' ? 'BLOCKED: ' : '';
    let first = true;
    const lines = detailLines(detail).flatMap((line) => {
      const wrapped = wrapText(regular, `${first ? label : ''}${line}`, WORK_ORDER_PDF_TEXT_SIZES.detail, detailWidth);
      first = false;
      return wrapped;
    });
    return { exception, label, lines };
  });
  const physicalDetailLines = detailLayouts.reduce((sum, detail) => sum + detail.lines.length, 0);
  const detailHeight = physicalDetailLines ? physicalDetailLines * 11 + 10 : 0;
  return { primaryLines, primaryHeight, detailLayouts, detailHeight, totalHeight: primaryHeight + detailHeight, diagramReservedWidth, detailTextWidth: detailWidth };
}

export function calculateWorkOrderDiagramBounds(diagram: NonNullable<WorkOrderRowGroup['diagram']>, top: number, groupHeight: number) {
  const availableHeight = Math.max(8, Math.min(DIAGRAM_MAX_HEIGHT, groupHeight - 8));
  const scale = Math.min(DIAGRAM_MAX_WIDTH / diagram.width, availableHeight / diagram.height);
  const width = diagram.width * scale;
  const height = diagram.height * scale;
  const left = MARGIN + CONTENT_WIDTH - width - 8;
  const diagramBottom = top - 4 - height;
  return { left, bottom: diagramBottom, width, height, scale };
}

function drawDiagram(page: PDFPage, diagram: NonNullable<WorkOrderRowGroup['diagram']>, top: number, groupHeight: number) {
  const { left, bottom: diagramBottom, scale } = calculateWorkOrderDiagramBounds(diagram, top, groupHeight);
  for (const part of diagram.parts) {
    const x = left + part.x * scale;
    const y = diagramBottom + (diagram.height - part.y - part.height) * scale;
    const partWidth = part.width * scale;
    const partHeight = part.height * scale;
    const structural = part.kind === 'divider' || part.kind === 'transom-divider' || part.kind === 'mullion';
    const fill = structural ? rgb(0.2, 0.2, 0.2) : part.kind === 'glass' ? rgb(0.84, 0.84, 0.84) : rgb(0.97, 0.97, 0.97);
    page.drawRectangle({ x, y, width: partWidth, height: partHeight, color: fill, borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 0.45 });
  }
}

function drawDoorGroup(page: PDFPage, group: WorkOrderRowGroup, regular: PDFFont, bold: PDFFont, y: number): number {
  const { primaryRow: row, detailRows: details, diagram } = group;
  const layout = measureWorkOrderGroup(row, details, regular, diagram);
  const bottom = y - layout.totalHeight;
  page.drawRectangle({ x: MARGIN, y: bottom, width: CONTENT_WIDTH, height: layout.totalHeight, borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 0.9 });
  let x = MARGIN;
  layout.primaryLines.forEach((lines, index) => {
    if (index) page.drawLine({ start: { x, y }, end: { x, y: y - layout.primaryHeight }, color: rgb(0.1, 0.1, 0.1), thickness: 0.6 });
    lines.forEach((line, lineIndex) => drawText(page, regular, line, x + 3, y - 14 - lineIndex * 12, WORK_ORDER_PDF_TEXT_SIZES.primary));
    x += WORK_ORDER_PDF_COLUMN_WIDTHS[index];
  });
  let detailY = y - layout.primaryHeight - 10;
  for (const detail of layout.detailLayouts) {
    detail.lines.forEach((line, index) => {
      drawText(page, detail.exception && index === 0 ? bold : regular, line, MARGIN + 12, detailY, WORK_ORDER_PDF_TEXT_SIZES.detail);
      detailY -= 11;
    });
  }
  if (diagram) drawDiagram(page, diagram, y, layout.totalHeight);
  page.drawLine({ start: { x: MARGIN, y: bottom }, end: { x: PAGE_WIDTH - MARGIN, y: bottom }, color: rgb(0.05, 0.05, 0.05), thickness: 1.4 });
  return bottom;
}

function drawFooter(page: PDFPage, modelPage: WorkOrderPage, regular: PDFFont) {
  page.drawLine({ start: { x: MARGIN, y: 24 }, end: { x: PAGE_WIDTH - MARGIN, y: 24 }, color: rgb(0.7, 0.72, 0.76), thickness: 0.5 });
  drawText(page, regular, modelPage.footerText, MARGIN, 12, 7);
}

export async function renderWorkOrderPdf(document: WorkOrderDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const metadataDate = new Date(document.generatedAt);
  pdf.setTitle(document.pdfFilename.replace(/\.pdf$/i, ''));
  pdf.setSubject(`DoorGo work order ${document.visibleIdentifier}`);
  pdf.setCreator('DoorGo');
  pdf.setProducer('DoorGo');
  pdf.setCreationDate(metadataDate);
  pdf.setModificationDate(metadataDate);
  for (const modelPage of document.pages) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: rgb(1, 1, 1) });
    let y = modelPage.kind === 'First'
      ? drawFirstHeader(page, document, regular, bold)
      : drawContinuationHeader(page, modelPage, bold);
    y = drawTableHeader(page, bold, y, document.columns);
    for (const group of modelPage.rowGroups) {
      y = drawDoorGroup(page, group, regular, bold, y);
      y -= 2;
    }
    if (y < FOOTER_CLEARANCE) throw new Error(`J3A page ${modelPage.pageNumber} does not fit the printable work-order area.`);
    drawFooter(page, modelPage, regular);
  }
  return pdf.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
}

function asciiFilename(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}

export function workOrderPdfHeaders(document: Pick<WorkOrderDocument, 'pdfFilename'>, mode: WorkOrderOutputMode): Headers {
  const disposition = mode === 'attachment' ? 'attachment' : 'inline';
  const fallback = asciiFilename(document.pdfFilename);
  const encoded = encodeURIComponent(document.pdfFilename).replace(/['()]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
}
