import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput, doorLineEquivalenceKey, calculateJ2AShopHours, withEffectiveShopHours } from './door-line-contract';
import { changeSupplyType, preparationDisplay } from './slab-only-contract';
import { duplicateDoorLine, newDoorFromSession, rememberNewDoor, createNewDoorSession } from './door-line-editor-state';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { renderWorkOrderPdf } from './work-order-pdf-contract';
import { createWorkOrderRowGroup, generateWorkOrderDocument } from './work-order-document-contract';
import { prepareDoorLabels } from './door-label-contract';
import type { DoorLineInput, NativeDoorLine, NativeJobAggregate } from './job-intake-types';
const normalized = (input: DoorLineInput): NativeDoorLine => {
  const result = normalizeDoorLineInput(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Invalid slab fixture');
  return { ...result.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active' } as NativeDoorLine;
};
for (const mode of ['Interior', 'Exterior'] as const) {
  const frame = normalized({ ...defaultDoorLine(mode), doorType: 'Replacement slab', jambType: 'Fir', notes: 'Match supplied slab', doorThickness: '1-3/4', doorId: 'Opening A', individualDoorIds: ['A-1'], productCode: 'FRAME', doorSlabSku: 'SLAB' });
  const slab = normalized({ ...changeSupplyType(frame, 'slab-only'), prep: 'MTM' });
  assert.equal(slab.hand, null); assert.equal(slab.slabDrilling, null);
  assert.equal(preparationDisplay(slab), 'MTM — Machine to Match');
  const group = createWorkOrderRowGroup(slab, null);
  assert.match(group.primaryRow.cells.configuration, /SLAB ONLY/);
  assert.equal(group.primaryRow.cells.drill, 'MTM — Machine to Match');
  for (const field of ['hinge', 'swing', 'jamb', 'sill', 'weatherstrip'] as const) assert.equal(group.primaryRow.cells[field], '');
  assert.deepEqual(group.detailRows, []); assert.equal(group.primaryRow.status, 'Complete');
  const explicit = normalized({ ...slab, slabDrilling: mode === 'Exterior' ? 'STD' : 'YES', hand: 'RH', height: `8'0"` });
  assert.equal(explicit.prep, 'MTM'); assert.match(preparationDisplay(explicit), mode === 'Exterior' ? /Double drilled/ : /Single drilled/);
  assert.equal(createWorkOrderRowGroup(explicit, null).primaryRow.cells.swing, 'RH');
  const restored = normalized(changeSupplyType(normalized({ ...slab, notes: 'Edited', qty: 3 }), 'prehung'));
  for (const key of ['jambWidth','jambType','hingeType','sill','hand','prep','prepSource','doorThickness','doorSlabSku','doorId','productCode'] as const) assert.equal(restored[key], frame[key], key);
  assert.equal(normalized(changeSupplyType(restored, 'slab-only')).prep, 'MTM');
  assert.equal(normalized(changeSupplyType(changeSupplyType(explicit, 'prehung'), 'slab-only')).slabDrilling, explicit.slabDrilling);
  assert.equal(restored.qty, 3); assert.equal(restored.notes, 'Edited');
  const duplicate = duplicateDoorLine(slab, '22222222-2222-4222-8222-222222222222', 2);
  assert.equal(duplicate.prep, 'MTM'); assert.equal(duplicate.supplyType, 'slab-only'); assert.deepEqual(duplicate.framePreparation, slab.framePreparation);
  assert.notEqual(doorLineEquivalenceKey(frame), doorLineEquivalenceKey(slab));
  assert.notEqual(doorLineEquivalenceKey(slab), doorLineEquivalenceKey(explicit));
  const fresh = newDoorFromSession(rememberNewDoor(createNewDoorSession(), slab, null), mode);
  assert.notEqual(fresh.prep, 'MTM'); assert.notEqual(fresh.supplyType, 'slab-only');
  assert.equal(normalized({ ...slab, prep: null }).prep, null);
  assert.equal(normalizeDoorLineInput({ ...slab, hand: 'INVALID' }).ok, false);
  assert.equal(normalizeDoorLineInput({ ...slab, slabDrilling: 'INVALID' }).ok, false);
  const labels = prepareDoorLabels({ customer: 'Fixture', bizTrackSalesOrder: 'TEST', lines: [slab] } as NativeJobAggregate, { [slab.lineId]: { selected: true, quantity: '1', doorIds: ['A-1'] } }, false);
  assert.ok(labels.html); assert.match(labels.html, /SLAB ONLY/); assert.match(labels.html, /MTM/);
  assert.doesNotMatch(labels.html, /<strong>Jamb width|<strong>Sill|<strong>Swing/);
  assert.equal(calculateJ2AShopHours([frame, slab]).shopHoursSource, 'Estimate incomplete');
  assert.equal(withEffectiveShopHours({ shopHours: 2, shopHoursSource: 'Manual' }, [frame, slab]).shopHours, 2);
}
// Stored drilling never becomes valid merely because it is in an inactive field.
assert.equal(normalizeDoorLineInput({ ...changeSupplyType(defaultDoorLine('Interior'), 'slab-only'), prep: 'MTM', slabDrilling: 'STD' }).ok, false);
console.log('Slab Only/MTM defaults, explicit instructions, frame restoration, duplication, mixed estimates and print contracts passed.');

async function verifyPdf() {
  const slab = normalized({ ...changeSupplyType(defaultDoorLine(), 'slab-only'), prep: 'MTM', doorType: 'Replacement', notes: 'Match supplied slab' });
  const job = { internalJobId: slab.lineId, customer: 'Fixture', doorGoReference: 'DG-000001', salesperson: 'Fixture', lifecycleStage: 'Draft', revision: 1, poNumbers: [], lines: [slab] } as unknown as NativeJobAggregate;
  const document = generateWorkOrderDocument(job, { generatedAt: '2026-11-19T00:00:00Z', generatedDate: '2026-11-19' });
  const pdf = await PDFDocument.load(await renderWorkOrderPdf(document));
  assert.equal(pdf.getPageCount(), 1);
  const text = pdf.getPages().flatMap(page => {
    const contents = page.node.Contents();
    const references = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return references.flatMap(reference => {
      const stream = pdf.context.lookup(reference);
      assert.ok(stream instanceof PDFRawStream);
      const source = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
      return [...source.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map(match => Buffer.from(match[1], 'hex').toString('latin1'));
    });
  }).join(' ');
  assert.match(text, /SLAB ONLY/); assert.match(text, /MTM/);
  assert.doesNotMatch(text, /Double drilled|Single drilled|Multipoint/);
  console.log('Slab Only MTM actual work-order PDF retains explicit instructions without default drilling.');
}
verifyPdf().catch(error => { console.error(error); process.exitCode = 1; });
