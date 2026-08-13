import assert from 'node:assert/strict';
import { aggregateVendorCopy, glassResultRows } from './glass-result-presentation';
import type { DoorLineInput, GlassUnit, PanelSidelight } from './job-intake-types';

const line = (config: string): DoorLineInput => ({ config });
const glass = (position: string, type = 'Clear'): GlassUnit => ({ position, width: `18 1/8"`, height: `79 1/8"`, glassType: type, termCode: 'CLR_SB60_K4SG', qty: 1 });

for (const [config, count, left, right] of [['SD', 1, 1, 0], ['SDS', 2, 1, 1], ['SDSSS', 4, 1, 3], ['SSSDSSS', 6, 3, 3]] as const) {
  const sides = [...Array(left).keys()].map((index) => glass(`Left sidelight ${index + 1}`)).concat([...Array(right).keys()].map((index) => glass(`Right sidelight ${index + 1}`)));
  const rows = glassResultRows(line(config), sides, []);
  assert.deepEqual(rows, [{ key: 'sidelights', label: 'Sidelights', value: `${count} total (${left} left / ${right} right) @ 18 1/8" × 79 1/8" — Clear` }]);
}

const panel: PanelSidelight = { position: 'Left sidelight 1', material: 'Fiberglass', width: `18 1/8"`, height: `79 1/8"`, qty: 1, constructionNotes: 'Shared construction' };
assert.match(glassResultRows(line('SDS'), [], [panel, { ...panel, position: 'Right sidelight 1' }])[0].value, /2 total.*Panel — Shared construction/);

const transom = glass('Transom');
transom.width = `117 7/8"`; transom.height = `35 7/8"`;
const transomRows = glassResultRows(line('T/SDS'), [glass('Left sidelight 1'), glass('Right sidelight 1'), transom], []);
assert.equal(transomRows.length, 2);
assert.equal(transomRows[1].value, `117 7/8" × 35 7/8" — Clear`);

const vendor = ['Left sidelight 1:\nMAKEUP', 'Right sidelight 1:\nMAKEUP', 'Transom:\nTRANSOM'].join('\n\n');
assert.equal(aggregateVendorCopy(line('T/SDS'), [glass('Left sidelight 1'), glass('Right sidelight 1'), transom], vendor), '2 Sidelights (1 left / 1 right):\nMAKEUP\n\nTransom:\nTRANSOM');
assert.equal(aggregateVendorCopy(line('SDS'), [glass('Left sidelight 1'), glass('Right sidelight 1', 'Satin Etch')], vendor), vendor, 'nonidentical external lines remain unaggregated');

console.log('Glass result presentation contract: PASS');
