import assert from 'node:assert/strict';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { defaultDoorLine } from './door-line-contract';
import { createWorkOrderRowGroup, generateWorkOrderDocument } from './work-order-document-contract';
import { renderWorkOrderPdf } from './work-order-pdf-contract';
import type { NativeDoorLine, NativeJobAggregate } from './job-intake-types';

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
  const samples = [
    { mode: 'Interior', config: 'D', customSlab: 'RO', roWidth: '32', roHeight: '60' },
    { mode: 'Interior', config: 'B.P.', roHeight: '75' },
    { mode: 'Interior', config: 'DD', customSlab: 'RO', roWidth: '70', roHeight: '79' },
    { mode: 'Exterior', config: 'D', customSlab: 'RO', roWidth: '37.5', roHeight: '81' },
    { mode: 'Exterior', config: 'T/DD', customSlab: 'RO', roWidth: '73', roHeight: '95', transomTBarSize: '2.25', transomGlassTypeCode: 'CLEAR' },
  ] as const;
  for (const [index, sample] of samples.entries()) {
    const line = { ...defaultDoorLine(sample.mode), ...sample, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active', doorType: 'Test door', updatedAt: '2026-11-16T00:00:00Z', includeDiagramOnWorkOrder: false } as NativeDoorLine;
    const before = JSON.stringify(line);
    const finishedHeight = sample.config === 'T/DD' ? calculateGlassGeometry(line).glassCalc!.finalDoorHeight : calculateNonGlassFrameCut(line).values!.finalSlabHeight.display;
    const text = JSON.stringify(createWorkOrderRowGroup(line, null).detailRows).replaceAll('\u00a0',' ');
    assert.doesNotMatch(text, /CUT DOWN:|Door will be cut down/);
    assert.match(text, /Final slab|Door cut to|Active slab/);
    if (index === 0 || index === 3) assert.match(text, /Slab width cut:/);
    if (index === 4) assert.match(text, /Remove .+ from inactive slab/);
    const job = { internalJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', doorGoReference: 'DG-000001', customer: 'Synthetic fixture', salesperson: 'Fixture', lifecycleStage: 'Confirmed Job', revision: 1, updatedAt: '2026-11-16T00:00:00Z', poNumbers: [], lines: [line] } as unknown as NativeJobAggregate;
    const document = generateWorkOrderDocument(job, { generatedAt: '2026-11-16T00:00:00Z', generatedDate: '2026-11-16' });
    const pdfText = (await extractedWinAnsiText(await renderWorkOrderPdf(document))).replace(/\s+/g,' ');
    assert.doesNotMatch(pdfText, /CUT DOWN:|Door will be cut down/);
    assert.match(pdfText, /Final slab|Door cut to|Active slab/);
    assert.ok(pdfText.includes(String(finishedHeight).replace(/\s+/g,' ')), 'PDF retains the authoritative finished height');
    if (index === 0 || index === 3) assert.match(pdfText, /Slab width cut:/);
    assert.equal(JSON.stringify(line), before, 'output must never change saved/calculation input');
  }
  console.log('Production print regressions passed: Interior/Exterior D, DD, B.P. and glass; finished height and width cuts retained in document/PDF; height reduction amount omitted; source unchanged.');
}
void main();
