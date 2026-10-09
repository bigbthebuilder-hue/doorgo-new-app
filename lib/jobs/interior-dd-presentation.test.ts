import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { showsMagCatch } from './interior-dd-presentation';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';
import type { NativeDoorLine } from './job-intake-types';

async function main() {
  for (const astragal of [null, 'standard-metal-ds347', 'wood-ferco-astra-lock'] as const) {
    const input = { ...defaultDoorLine('Interior'), doorType: 'Molded', config: 'DD', doubleDoorAstragal: astragal };
    const normalized = normalizeDoorLineInput(input);
    assert.ok(normalized.ok);
    const line: NativeDoorLine = { ...normalized.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active', createdAt: '', updatedAt: '', createdByUserId: 'user', updatedByUserId: 'user' };
    const before = structuredClone(line);
    const geometry = calculateNonGlassFrameCut(line);
    assert.equal(geometry.values?.jambLeg?.display, '81 7/8"');
    assert.equal(geometry.values?.headerWidth?.display, astragal === 'wood-ferco-astra-lock' ? '60 1/2"' : '60 1/4"');
    assert.equal(geometry.values?.frameWidth?.display, astragal === 'wood-ferco-astra-lock' ? '62"' : '61 3/4"');
    const output = JSON.stringify(createWorkOrderRowGroup(line, null));
    assert.equal(output.match(/Mag Catch/g)?.length, 1);
    assert.doesNotMatch(output, /astragal|ferco|DS347|standard metal/i);
    assert.deepEqual(line, before, 'presentation does not mutate saved inputs');
    assert.deepEqual(calculateNonGlassFrameCut(line), geometry);
    assert.equal(line.doubleDoorAstragal, astragal ?? 'standard-metal-ds347');
    assert.equal(line.glassCalc?.doubleDoorAstragal, line.doubleDoorAstragal);
    assert.equal(line.vendorCopyText, null, 'no shop instruction added to vendor copy');

    // Exercise the actual hosted serialization and rehydration boundary, without a database.
    const repository = createHostedJobIntakeRepository({ client: { rpc: async (_name, args) => {
      const written = (args.p_lines as Record<string, unknown>[])[0];
      assert.equal((written.glass_calc as Record<string, unknown>).doubleDoorAstragal, line.doubleDoorAstragal);
      assert.doesNotMatch(JSON.stringify(written), /Mag Catch/);
      return { data: { job: { internal_job_id: 'job', door_go_reference: 'DG-000001', po_numbers: [], revision: 1 }, lines: [written] }, error: null };
    } } });
    const saved = await repository.create({ commandId: 'command', actorUserId: 'user', defaultSalesperson: null, input: { customer: 'Test' }, lines: [line] });
    assert.equal(saved.lines[0].doubleDoorAstragal, line.doubleDoorAstragal);
    assert.equal(saved.lines[0].glassCalc?.doubleDoorAstragal, line.doubleDoorAstragal);

    const single = { ...line, config: 'D' };
    assert.equal(showsMagCatch(single), false);
    assert.doesNotMatch(JSON.stringify(createWorkOrderRowGroup(single, null)), /Mag Catch|Astragal|Ferco/);
    const exterior = { ...line, mode: 'Exterior' as const, material: 'fiberglass' as const };
    const exteriorOutput = JSON.stringify(createWorkOrderRowGroup(exterior, null));
    assert.doesNotMatch(exteriorOutput, /Mag Catch/);
    assert.equal(exteriorOutput.includes('Wood / Ferco Astra Lock'), astragal === 'wood-ferco-astra-lock');
  }
  for (const config of ['D', 'PKT', 'B.P.', 'SDDS', 'T/DD']) {
    assert.equal(showsMagCatch({ ...defaultDoorLine('Interior'), config }), false);
  }
  for (const construction of ['low-profile-quarter-sill', 'jamb-four-sides'] as const) {
    assert.equal(showsMagCatch({ ...defaultDoorLine('Interior'), config: 'DD', construction }), false);
  }
  console.log('Interior DD presentation, geometry and hosted round-trip: PASS');
}

void main();
