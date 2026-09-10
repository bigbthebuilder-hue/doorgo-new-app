import { StandardFontEmbedder, StandardFonts, type PDFFont } from 'pdf-lib';
import type { WorkOrderDetailRow, WorkOrderPage, WorkOrderPrimaryRow, WorkOrderRowGroup } from './work-order-document-contract';

export type WorkOrderFontMetrics = Pick<PDFFont, 'widthOfTextAtSize' | 'getCharacterSet'>;
// PDFFont uses this same standard-font embedder for widths and supported characters.
const helvetica = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as Parameters<typeof StandardFontEmbedder.for>[0]);
export const WORK_ORDER_FONT_METRICS: WorkOrderFontMetrics = {
  widthOfTextAtSize: (text, size) => helvetica.widthOfTextAtSize(text, size),
  getCharacterSet: () => helvetica.encoding.supportedCodePoints,
};

export const PAGE_WIDTH = 792;
export const PAGE_HEIGHT = 612;
export const MARGIN = 24;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const WORK_ORDER_PDF_COLUMN_WIDTHS = [28, 64, 76, 38, 64, 58, 55, 48, 61, 48, 36, 168] as const;
export const FOOTER_CLEARANCE = 34;
export const WORK_ORDER_PDF_TEXT_SIZES = { headerLabel: 8.5, headerValue: 10, tableHeader: 9, primary: 10.5, detail: 10 } as const;
export const DIAGRAM_MAX_WIDTH = 110;
export const DIAGRAM_MAX_HEIGHT = 58;


export const GROUP_SPACING = 2;
export const TABLE_HEADER_HEIGHT = 22;
export const FIRST_HEADER_BOTTOM = PAGE_HEIGHT - 42 - 112;
export const CONTINUATION_HEADER_BOTTOM = PAGE_HEIGHT - 61;
export function workOrderPrintableHeight(kind: WorkOrderPage['kind']): number {
  return (kind === 'First' ? FIRST_HEADER_BOTTOM : CONTINUATION_HEADER_BOTTOM) - TABLE_HEADER_HEIGHT - FOOTER_CLEARANCE;
}

export const WORK_ORDER_PDF_UNSUPPORTED_CHARACTER_FALLBACK = '?';

const supportedCodePointsByFont = new WeakMap<WorkOrderFontMetrics, ReadonlySet<number>>();

/** Preserves every printable character supported by the active PDF font and explicitly falls back otherwise. */
export function normalizeWorkOrderPdfText(font: WorkOrderFontMetrics, value: unknown): string {
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

export function wrapText(font: WorkOrderFontMetrics, value: string, size: number, maxWidth: number): string[] {
  const safe = normalizeWorkOrderPdfText(font, value);
  if (!safe) return [''];
  const lines: string[] = [];
  let current = '';
  const rawWords = safe.split(/[ \t\r\n]+/);
  const words: string[] = [];
  for (let index = 0; index < rawWords.length; index += 1) {
    const word = rawWords[index];
    if (word === '×' && rawWords[index + 1]) words.push(`${word} ${rawWords[index += 1]}`);
    else words.push(word);
  }
  for (const word of words) {
    const pending = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(pending, size) <= maxWidth) { current = pending; continue; }
    if (current) lines.push(current);
    current = '';
    current = word;
  }
  if (current) lines.push(current);
  return lines;
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

export function measureWorkOrderGroup(row: WorkOrderPrimaryRow, details: readonly WorkOrderDetailRow[], regular: WorkOrderFontMetrics, diagram: WorkOrderRowGroup['diagram'] = null): WorkOrderGroupLayout {
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
