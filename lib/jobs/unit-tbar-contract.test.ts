import assert from 'node:assert/strict';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import type { NativeDoorLine } from './job-intake-types';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { automaticUnitTBar, calculateGlassGeometry, GLASS_CONFIGS } from './glass-geometry-contract';
import { unitTBarControl, withUnitTBarControl } from './unit-tbar-contract';
import { parseGlassUnitConfiguration, totalSidelightCount, resolveGlassUnitConfiguration } from './glass-unit-composition-contract';

const configurations = [...GLASS_CONFIGS];
for (const door of ['D','DD'] as const) for (let left=0;left<=3;left++) for(let right=0;right<=3;right++) for(const hasTransom of [false,true]) configurations.push(resolveGlassUnitConfiguration({door,leftSidelightCount:left,rightSidelightCount:right,hasTransom,transomSections:hasTransom?1:0}) as typeof GLASS_CONFIGS[number]);
for (const config of configurations) {
  const parsed = parseGlassUnitConfiguration(config); assert.ok(parsed.ok);
  const expected = parsed.value.hasTransom && parsed.value.door === 'D' && totalSidelightCount(parsed.value) === 0 ? '1.5' : '2.25';
  assert.equal(automaticUnitTBar(config), expected, config);
}
const plain = defaultDoorLine('Exterior');
const single = withUnitTBarControl({ ...plain, config:'T/D', roWidth:'38', roHeight:'95', transomGlassTypeCode:'CLEAR' });
for (const [hand,size,height] of [['LH','1.5','11 5/8"'],['LHOUT','1.5','11 7/8"'],['LH','2.25','10 7/8"']] as const) {
  const result = calculateGlassGeometry({...single, hand, transomTBarSize:size});
  assert.equal(result.glassCalc?.transomWidth, '35 7/8"');
  assert.equal(result.glassCalc?.transomHeight, height);
}
assert.equal(single.transomTBarSize,'1.5');
const double = withUnitTBarControl({...single,config:'T/DD'},single);
assert.equal(double.transomTBarSize,'2.25');
assert.equal(withUnitTBarControl({...double,config:'T/D'},double).transomTBarSize,'1.5');
const manual = {...single,unitTBarControl:{source:'manual' as const,size:'2.25' as const},transomTBarSize:'2.25' as const};
assert.equal(withUnitTBarControl({...manual,config:'T/DD'},manual).unitTBarControl?.source,'manual');
assert.equal(withUnitTBarControl({...manual,config:'T/D'},manual).transomTBarSize,'2.25');
const noBars = withUnitTBarControl({...manual,config:'D'},manual);
assert.equal(withUnitTBarControl({...noBars,config:'T/D'},noBars).transomTBarSize,'2.25');
assert.deepEqual(unitTBarControl({...single,unitTBarControl:undefined,transomTBarSize:'2.25'}),{source:'manual',size:'2.25'});
const normalized = normalizeDoorLineInput(manual);assert.ok(normalized.ok);
assert.deepEqual(normalized.value.unitTBarControl,manual.unitTBarControl);
assert.equal(calculateGlassGeometry(normalized.value).glassCalc?.transomHeight,'10 7/8"');
assert.match(JSON.stringify(createWorkOrderRowGroup({ ...normalized.value, lineId:'fixture', lineIndex:1, lineStatus:'Active', createdAt:'', updatedAt:'', createdByUserId:'', updatedByUserId:'' } as NativeDoorLine,null)), /10\s7\/8/);
assert.deepEqual(structuredClone(normalized.value).unitTBarControl, manual.unitTBarControl,'duplication retains provenance');
console.log('Unit T-bar defaults, manufacturing dimensions, protected legacy values and manual control: passed');
