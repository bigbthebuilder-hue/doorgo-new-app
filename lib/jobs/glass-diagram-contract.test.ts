import assert from 'node:assert/strict';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { calculateGlassCompositionSchematic, calculateGlassDiagramLayout } from './glass-diagram-contract';
import type { DoorLineInput } from './job-intake-types';

function fixture(config: string): DoorLineInput {
  const line: DoorLineInput = {
    lineId: config, mode: 'Exterior', config, width: `3'0"`, height: `6'8"`, material: 'fiberglass',
    customSlab: 'No', hand: 'LH', roWidth: '96', roHeight: config.startsWith('T/') ? '100' : '',
    sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomGlass: 'CLR_SB60_K4SG',
  };
  const result = calculateGlassGeometry(line);
  return { ...line, glassCalc: result.glassCalc };
}

for (const config of ['DS', 'SD', 'SDS', 'DSS', 'DSSS', 'SSD', 'SDDS', 'T/DSSS']) {
  const layout = calculateGlassDiagramLayout(fixture(config));
  assert.ok(layout, config);
  const expected = config.replace(/^T\//, '').replace('DD', '').replace('D', '').length;
  assert.equal(layout.parts.filter((part) => part.kind === 'glass' && !part.id.startsWith('transom')).length, expected, config);
  assert.equal(layout.parts.filter((part) => part.kind === 'divider').length, expected, config);
}
assert.equal(calculateGlassDiagramLayout({ mode: 'Exterior', config: 'D', glass: 'decorative' }), null);
assert.deepEqual(calculateGlassDiagramLayout(fixture('DSS'))?.parts.filter((part) => part.kind === 'glass').map((part) => part.id), ['right-sidelight-1', 'right-sidelight-2']);
for (const [config, expectedSides] of [['DSSS', 3], ['SSSD', 3], ['SDDS', 2], ['T/DSSS', 3]] as const) {
  const schematic = calculateGlassCompositionSchematic({ mode: 'Exterior', config, sidelightType: 'Glass' });
  assert.ok(schematic, `${config} has a pre-measurement schematic`);
  assert.equal(schematic.parts.filter((part) => part.kind === 'glass' && part.id !== 'transom').length, expectedSides);
  assert.equal(schematic.parts.filter((part) => part.kind === 'divider').length, expectedSides);
  assert.equal(schematic.parts.some((part) => part.id === 'transom'), config.startsWith('T/'));
}
assert.deepEqual(
  calculateGlassCompositionSchematic({ mode: 'Exterior', config: 'SSSD', sidelightType: 'Glass' })?.parts.filter((part) => part.kind === 'glass').map((part) => part.id),
  ['left-sidelight-1', 'left-sidelight-2', 'left-sidelight-3'],
);
const mixedLine: DoorLineInput = {
  ...fixture('SDS'), roWidth: '76.75',
  sidelightSpecifications: [
    { side: 'left', index: 1, finishedWidth: '11.75', tBarSize: '1.5', glassTypeCode: 'CLEAR', customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null },
    { side: 'right', index: 1, finishedWidth: '20', tBarSize: '2.25', glassTypeCode: 'SATIN_ETCH', customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null },
  ],
};
mixedLine.glassCalc = calculateGlassGeometry(mixedLine).glassCalc;
const mixedLayout = calculateGlassDiagramLayout(mixedLine);
assert.equal(mixedLayout?.parts.find((part) => part.id === 'left-sidelight-1')?.kind, 'glass');
assert.equal(mixedLayout?.parts.find((part) => part.id === 'right-sidelight-1')?.kind, 'glass');
assert.equal(mixedLayout?.parts.find((part) => part.id === 'left-divider-1')?.width, 1.5);
assert.equal(mixedLayout?.parts.find((part) => part.id === 'right-divider-1')?.width, 1.5, 'one unit-wide T-bar drives every divider');
console.log('Glass Unit Builder diagram contract: PASS');
