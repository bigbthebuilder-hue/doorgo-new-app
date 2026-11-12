import type { NativeDoorLine, NativeJobAggregate } from './job-intake-types';
import { doorSizeDisplay } from './door-size-presentation';

export const MAX_LABEL_BATCH = 500;

// Code 128 symbol widths in value order, including start A/B/C and stop.
const patterns = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export function code128(value: string): { modules: number; bars: { x: number; width: number }[] } | null {
  if (!value || /[^\x20-\x7e]/.test(value)) return null;
  const numericPairs = /^(?:[0-9]{2})+$/.test(value);
  const start = numericPairs ? 105 : 104;
  const codes = numericPairs
    ? (value.match(/.{2}/g) ?? []).map(Number)
    : Array.from(value, (character) => character.charCodeAt(0) - 32);
  const checksum = codes.reduce((sum, code, index) => sum + code * (index + 1), start) % 103;
  const bars: { x: number; width: number }[] = [];
  let x = 10;
  for (const code of [start, ...codes, checksum, 106]) {
    Array.from(patterns[code], Number).forEach((width, index) => {
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
  }
  const modules = x + 10;
  // Leave room for margins and use two printer dots per module at 203 dpi.
  return modules * 2 <= 750 ? { modules, bars } : null;
}

export type LabelSelection = Record<string, { selected: boolean; quantity: string; doorIds: string[] }>;

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

function labelHtml(job: NativeJobAggregate, line: NativeDoorLine, doorId: string, omitNotes: boolean) {
  const code = line.productCode ?? '';
  const barcode = code128(code);
  const fields = [
    ['Door ID', doorId], ['Size', doorSizeDisplay(line, true)], ['Swing', line.hand],
    ['Jamb width', line.jambWidth], ['Configuration', line.config],
    ['Notes', omitNotes ? '' : line.notes],
  ].filter(([, value]) => value?.trim());
  const bars = barcode ? '<svg xmlns="http://www.w3.org/2000/svg" aria-label="Code 128 barcode" viewBox="0 0 ' +
    barcode.modules + ' 135" style="width:' + (barcode.modules * 2 / 203) + 'in">' +
    barcode.bars.map(({ x, width }) => '<rect x="' + x + '" width="' + width + '" height="135"/>').join('') + '</svg>' : '';
  return '<article><section><header><h1>SO# ' + escape(job.bizTrackSalesOrder ?? '') + '</h1><h2>' + escape(job.customer ?? '') +
    '</h2></header>' + (job.siteAddress?.trim() ? '<p class="address">' + escape(job.siteAddress) + '</p>' : '') +
    fields.map(([name, value]) => '<p' + (name === 'Notes' ? ' class="notes"' : '') + '><strong>' + escape(name!) + '</strong> ' + escape(value!) + '</p>').join('') +
    (code ? '<footer>' + bars + '<div>' + escape(code) + '</div></footer>' : '') + '</section></article>';
}

export function prepareDoorLabels(job: NativeJobAggregate, selection: LabelSelection, omitNotes: boolean) {
  const selected = job.lines.filter((line) => line.lineStatus === 'Active' && selection[line.lineId]?.selected);
  const count = selected.reduce((sum, line) => sum + Number(selection[line.lineId].quantity), 0);
  if (!job.bizTrackSalesOrder?.trim() || !job.customer?.trim()) return { error: 'A sales order number and customer name are required.' };
  if (!selected.length) return { error: 'Select at least one door line.' };
  if (selected.some((line) => !/^[0-9]+$/.test(selection[line.lineId].quantity) || Number(selection[line.lineId].quantity) < 1) || count > MAX_LABEL_BATCH) {
    return { error: 'Enter a whole number of labels per selected line, with at most ' + MAX_LABEL_BATCH + ' labels per batch.' };
  }
  const invalid = selected.find((line) => line.productCode && !code128(line.productCode));
  if (invalid) return { error: 'Line ' + invalid.lineIndex + ' has a product code that cannot fit in Code 128 or contains unsupported characters. Edit the code or deselect that line.' };
  const labels = selected.flatMap((line) => {
    const { quantity, doorIds } = selection[line.lineId];
    return Array.from({ length: Number(quantity) }, (_, copy) => labelHtml(job, line, doorIds[copy]?.trim() || line.individualDoorIds?.[copy]?.trim() || line.doorId || '', omitNotes));
  });
  return { count, html: '<!doctype html><html lang="en"><meta charset="utf-8"><title>Door Labels</title><style>' +
    '@page{size:4in 6in;margin:0}*{box-sizing:border-box}body{margin:0;background:#ddd;color:#000;font:16pt/1.18 Arial,sans-serif}' +
    'article{width:4in;height:6in;padding:.15in;background:#fff;overflow:hidden;break-after:page}article:last-child{break-after:auto}' +
    'section{min-height:100%;display:flex;flex-direction:column;overflow-wrap:anywhere;white-space:pre-wrap}' +
    'header{border:2pt solid #000;padding:.06in .08in;margin-bottom:.06in}' +
    'h1{font-size:38pt;line-height:1.04;margin:0;padding-bottom:.04in;border-bottom:1.5pt solid #000}' +
    'h2{font-size:28pt;line-height:1.08;margin:.04in 0 0}' +
    'p{margin:0 0 .02in}.address,.notes{font-size:14pt}strong{font-weight:700}' +
    'footer{margin-top:auto;padding-top:.04in;text-align:center;font:14pt/1.15 monospace;flex-shrink:0}' +
    'svg{display:block;margin:0 auto .05in;height:.66in;max-width:100%;fill:#000}' +
    '@media screen{article{margin:.08in auto .18in}}@media print{body{background:white}}' +
    '</style><body>' + labels.join('') + '</body></html>' };
}
