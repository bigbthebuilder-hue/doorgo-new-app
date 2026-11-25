import { isSlabOnly, preparationDisplay, drillingDisplay } from './slab-only-contract';
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

function labelHtml(job: NativeJobAggregate, line: NativeDoorLine, doorId: string, omitNotes: boolean, copy: number) {
  const code = line.productCode ?? '';
  const slab = line.doorSlabSku ?? '';
  const joined = (values: (string | null | undefined)[]) => values.filter(value => value?.trim()).join(' · ');
  const fields = [
    ['slab-instructions', isSlabOnly(line) ? joined(['SLAB ONLY', line.prep === 'MTM' ? 'MTM' : '', line.prep === 'MTM' ? drillingDisplay(line.slabDrilling) : preparationDisplay(line)]) : ''],
    ['door-id', doorId], ['description', line.doorType],
    ['size-swing', joined([doorSizeDisplay(line, true), line.hand])],
    ['configuration-jamb', joined([line.config, isSlabOnly(line) ? '' : line.jambWidth])],
    ['notes', omitNotes ? '' : line.notes],
  ].filter(([, value]) => value?.trim());
  const barcodeHtml = (value: string) => {
    const barcode = code128(value);
    if (!barcode) return '';
    return '<div class="barcode-block">' +
      '<svg xmlns="http://www.w3.org/2000/svg" aria-label="Code 128 barcode" preserveAspectRatio="none" viewBox="0 0 ' +
      barcode.modules + ' 135" style="width:' + (barcode.modules * 2 / 203) + 'in">' +
      barcode.bars.map(({ x, width }) => '<rect x="' + x + '" width="' + width + '" height="135"/>').join('') + '</svg>' +
      '<div class="barcode-value">' + escape(value) + '</div></div>';
  };
  return '<article data-copy="' + copy + '" data-line="' + line.lineIndex + '"><section><header><h1>SO# ' + escape(job.bizTrackSalesOrder ?? '') + '</h1><h2>' + escape(job.customer ?? '') +
    '</h2></header><div class="details">' + (job.siteAddress?.trim() ? '<p class="address">' + escape(job.siteAddress) + '</p>' : '') +
    fields.map(([name, value]) => '<p class="' + name + '"' + (name === 'door-id' ? ' aria-label="Door ID"' : '') + '><span>' + escape(value!) + '</span></p>').join('') + '</div>' +
    (code || slab ? '<footer' + (code && slab ? ' class="dual-barcode"' : '') + '>' + (code ? barcodeHtml(code) : '') + (slab ? barcodeHtml(slab) : '') + '</footer>' : '') + '</section></article>';
}

// Measure the actual print DOM. Keep a readable minimum; overflow becomes explicit
// continuation labels rather than smaller and smaller text or hidden content.
// Static script text avoids bundler-generated closures in the standalone print document.
const labelLayoutScript = String.raw`(function layoutDoorLabels() {
    const fits = (page) => {
        const section = page.querySelector('section');
        return section.scrollHeight <= section.clientHeight + 1 && section.scrollWidth <= section.clientWidth + 1;
    };
    // Fit only the description to one line where readable; longer descriptions wrap.
    // Preserve a prominent readable floor, then wrap complete descriptions.
    const fitDescription = (page) => {
        for (const description of page.querySelectorAll('.description')) {
            description.style.whiteSpace = 'nowrap';
            for (const points of [28, 26, 24, 22, 20]) {
                description.style.fontSize = points + 'pt';
                if (description.scrollWidth <= description.clientWidth + 1)
                    break;
            }
            description.style.whiteSpace = '';
        }
    };
    for (const original of Array.from(document.querySelectorAll('article'))) {
        const dual = Boolean(original.querySelector('.dual-barcode'));
        let fitted = false;
        // Dual symbols recover vertical space without reducing customer/ID/spec sizes.
        for (const scale of (dual ? [1.08, 1] : [1.16, 1.08, 1, 0.94, 0.88])) {
            original.querySelector('section').style.setProperty('--scale', String(scale));
            fitDescription(original);
            if (fits(original)) {
                fitted = true;
                break;
            }
        }
        // Long identity text gets a selective, readable fit before continuation.
        // SO, description, specifications, notes and barcode dimensions stay fixed.
        if (!fitted) {
            const section = original.querySelector('section');
            section.style.setProperty('--scale', '1');
            for (const [customer, address, id] of [[28, 16, 30], [24, 14, 28]]) {
                section.style.setProperty('--customer-size', customer + 'pt');
                section.style.setProperty('--address-size', address + 'pt');
                section.style.setProperty('--id-size', id + 'pt');
                fitDescription(original);
                if (fits(original)) { fitted = true; break; }
            }
        }
        if (!fitted) {
            // Reclaim paragraph/header gaps only after the normal readable fit.
            // Keep every font, barcode module, quiet zone and note unchanged.
            original.querySelector('section').classList.add('compact-label');
            fitted = fits(original);
        }
        if (fitted)
            continue;
        const units = Array.from(original.querySelectorAll('h2, .details > p'));
        const pages = [];
        const newPage = () => {
            const page = original.cloneNode(true);
            page.querySelector('h2').remove();
            page.querySelector('.details').replaceChildren();
            const reference = document.createElement('div');
            reference.className = 'page-reference';
            reference.textContent = 'Line ' + original.dataset.line + ' · Copy ' + original.dataset.copy + ' · Continued';
            page.querySelector('header').append(reference);
            (pages.at(-1) ?? original).after(page);
            pages.push(page);
            return page;
        };
        let page = newPage();
        for (const unit of units) {
            const value = unit.querySelector('span');
            const characters = Array.from(value?.textContent ?? unit.textContent ?? '');
            let offset = 0;
            do {
                const fragment = unit.cloneNode(true);
                const text = fragment.querySelector('span') ?? fragment;
                const target = page.querySelector(unit.tagName === 'H2' ? 'header' : '.details');
                target.append(fragment);
                text.textContent = characters.slice(offset).join('');
                if (fits(page)) {
                    offset = characters.length;
                    continue;
                }
                // Binary search by Unicode code point, preserving every character.
                let low = 0, high = characters.length - offset;
                while (low < high) {
                    const middle = Math.ceil((low + high) / 2);
                    text.textContent = characters.slice(offset, offset + middle).join('');
                    if (fits(page))
                        low = middle;
                    else
                        high = middle - 1;
                }
                if (!low) {
                    fragment.remove();
                    if (!page.querySelector('h2, .details > p')) {
                        document.body.dataset.layoutError = 'true';
                        return; // Fail closed: the dialog will not offer a clipped printout.
                    }
                    page = newPage();
                    continue;
                }
                // Prefer a word boundary when it does not waste most of the available space.
                const candidate = characters.slice(offset, offset + low).join('');
                const boundary = candidate.lastIndexOf(' ');
                if (boundary > candidate.length * 0.6)
                    low = Array.from(candidate.slice(0, boundary + 1)).length;
                text.textContent = characters.slice(offset, offset + low).join('');
                offset += low;
                page = newPage();
            } while (offset < characters.length);
        }
        original.remove();
        pages.forEach((part, index) => {
            part.dataset.part = String(index + 1);
            part.querySelector('.page-reference').textContent = 'Line ' + part.dataset.line + ' · Copy ' + part.dataset.copy + ' · ' + (index ? 'Continued · ' : '') + (index + 1) + ' of ' + pages.length;
        });
    }
    if (Array.from(document.querySelectorAll('article')).some(page => !fits(page))) {
        document.body.dataset.layoutError = 'true';
        return;
    }
    document.body.dataset.labelsReady = 'true';
})();`;

export function prepareDoorLabels(job: NativeJobAggregate, selection: LabelSelection, omitNotes: boolean) {
  const selected = job.lines.filter((line) => line.lineStatus === 'Active' && selection[line.lineId]?.selected);
  const count = selected.reduce((sum, line) => sum + Number(selection[line.lineId].quantity), 0);
  if (!job.bizTrackSalesOrder?.trim() || !job.customer?.trim()) return { error: 'A sales order number and customer name are required.' };
  if (!selected.length) return { error: 'Select at least one door line.' };
  if (selected.some((line) => !/^[0-9]+$/.test(selection[line.lineId].quantity) || Number(selection[line.lineId].quantity) < 1) || count > MAX_LABEL_BATCH) {
    return { error: 'Enter a whole number of labels per selected line, with at most ' + MAX_LABEL_BATCH + ' labels per batch.' };
  }
  const invalidSlab = selected.find((line) => line.doorSlabSku && !code128(line.doorSlabSku));
  if (invalidSlab) return { error: 'Line ' + invalidSlab.lineIndex + ' Door Slab SKU cannot fit a scannable Code 128 barcode on this label or contains unsupported characters. The complete SKU remains saved. Shorten the SKU or deselect this line to print.' };
  const invalid = selected.find((line) => line.productCode && !code128(line.productCode));
  if (invalid) return { error: 'Line ' + invalid.lineIndex + ' has a product code that cannot fit in Code 128 or contains unsupported characters. Edit the code or deselect that line.' };
  const labels = selected.flatMap((line) => {
    const { quantity, doorIds } = selection[line.lineId];
    return Array.from({ length: Number(quantity) }, (_, copy) => labelHtml(job, line, doorIds[copy]?.trim() || line.individualDoorIds?.[copy]?.trim() || line.doorId || '', omitNotes, copy + 1));
  });
  return { count, html: '<!doctype html><html lang="en"><meta charset="utf-8"><title>Door Labels</title><style>' +
    '@page{size:4in 6in;margin:0}*{box-sizing:border-box}body{margin:0;background:#ddd;color:#000;font:16pt/1.18 Arial,sans-serif}' +
    'article{width:4in;height:6in;padding:.15in;background:#fff;overflow:hidden;break-after:page}article:last-of-type{break-after:auto}' +
    'section{height:100%;display:flex;flex-direction:column;overflow-wrap:anywhere;white-space:pre-wrap;--scale:1}' +
    'header{border:2pt solid #000;padding:.05in .07in;margin-bottom:.04in;flex-shrink:0}' +
    'h1{font-size:38pt;line-height:1.04;margin:0;padding-bottom:.03in;border-bottom:1.5pt solid #000}' +
    'h2{font-size:var(--customer-size,calc(32pt * var(--scale)));line-height:1.05;margin:.03in 0 0}' +
    '.details{flex-shrink:0;font-size:calc(20pt * var(--scale));line-height:1.08}' +
    'p{margin:0 0 .04in}.door-id{font-size:var(--id-size,calc(32pt * var(--scale)));font-weight:800;line-height:1.04;margin:.04in 0 .06in}.description{font-size:28pt;font-weight:800;line-height:1.06;margin-bottom:.06in}.size-swing{font-size:calc(22pt * var(--scale))}.configuration-jamb{font-size:calc(20pt * var(--scale))}' +
    '.slab-instructions{font-size:14pt;line-height:1.1;font-weight:700}.address{font-size:var(--address-size,calc(18pt * var(--scale)))}.notes{font-size:11pt;line-height:1.15;margin-top:.05in}.page-reference{font:11pt/1.1 Arial,sans-serif;margin-top:.03in}' +
    '.compact-label .details>p{margin:0 0 .015in}.compact-label .details>.notes{margin-top:.02in}.compact-label header{padding:.035in .055in;margin-bottom:.025in}' +
    'footer{margin-top:auto;padding-top:.04in;text-align:center;font:16pt/1.1 monospace;flex-shrink:0}' +
    '.barcode-block + .barcode-block{margin-top:.04in}.dual-barcode svg{height:.30in}' +
    'svg{display:block;margin:0 auto .03in;height:.66in;max-width:100%;fill:#000}' +
    '@media screen{article{margin:.08in auto .18in}}@media print{body{background:white}}' +
    '</style><body>' + labels.join('') + '<script>' + labelLayoutScript + '</script></body></html>' };
}
