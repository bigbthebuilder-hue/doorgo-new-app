import assert from 'node:assert/strict';
import { formatDimension, formatShopDimension, parseDimension, parseShopDimension, parseStoredShopDimension } from './dimension-contract';

for (const source of [`3'`, `3'0"`, `36"`]) {
  const parsed = parseDimension(source);
  assert.equal(parsed.ok && parsed.inches, 36, `${source} normalizes to 36 inches`);
}
assert.equal(parseDimension(`35 3/4"`).ok && (parseDimension(`35 3/4"`) as { inches: number }).inches, 35.75);
assert.equal(parseDimension(`35-3/4"`).ok && (parseDimension(`35-3/4"`) as { inches: number }).inches, 35.75);
assert.equal(parseDimension(`35.75"`).ok && (parseDimension(`35.75"`) as { inches: number }).inches, 35.75);
assert.equal(formatDimension(35.75), `2' 11 3/4"`);
assert.equal(formatDimension(36), `3' 0"`);
for (const rejected of ['', '36', '-1"', '0"', '35.7"', '35 1/3"', '3 feet', `3'6`]) {
  assert.equal(parseDimension(rejected).ok, false, `${JSON.stringify(rejected)} is rejected`);
}
for (const source of ['54', '54 1/2', '54-1/2', '54.5']) {
  const parsed = parseShopDimension(source);
  assert.equal(parsed.ok && parsed.inches, source === '54' ? 54 : 54.5);
  assert.equal(parsed.ok && parsed.formatted, source === '54' ? '54"' : '54 1/2"');
}
assert.equal(formatShopDimension(79.125), '79 1/8"');
assert.equal(parseShopDimension(`4'6"`).ok, false, 'shop entry rejects feet-and-inch notation');
assert.equal(parseShopDimension('54"').ok, false, 'shop entry relies on the permanent UI suffix');
assert.deepEqual(parseStoredShopDimension(`4'6"`), { ok: true, inches: 54, formatted: '54"' });
console.log('J2B2 inches-only shop dimension contract: PASS');
