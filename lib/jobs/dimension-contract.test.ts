import assert from 'node:assert/strict';
import { formatDimension, parseDimension } from './dimension-contract';

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
console.log('J2B1 explicit dimension contract: PASS');
