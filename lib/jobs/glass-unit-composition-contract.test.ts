import assert from 'node:assert/strict';
import {
  parseGlassUnitConfiguration, placeSingleSidelightForSwing, resolveGlassUnitConfiguration,
  totalSidelightCount,
} from './glass-unit-composition-contract';

for (const config of ['D', 'DD', 'T/D', 'T/DD', 'SD', 'DS', 'SDS', 'DSS', 'DSSS', 'SSD', 'SSSD', 'SDDS', 'T/SD', 'T/DS', 'T/SDS', 'T/DSS', 'T/DSSS', 'T/SDDS']) {
  const parsed = parseGlassUnitConfiguration(config);
  assert.equal(parsed.ok, true, config);
  if (parsed.ok) assert.equal(resolveGlassUnitConfiguration(parsed.value), config);
}
const alias = parseGlassUnitConfiguration('T-DSS');
assert.equal(alias.ok && alias.canonicalConfig, 'T/DSS');
for (const invalid of ['', 'S', 'DDD', 'D/SS', 'T//D', 'DSD']) assert.equal(parseGlassUnitConfiguration(invalid).ok, false, invalid);

function single(config: string, swing: string) {
  const parsed = parseGlassUnitConfiguration(config);
  assert.ok(parsed.ok);
  return resolveGlassUnitConfiguration(placeSingleSidelightForSwing(parsed.value, swing));
}
assert.equal(single('SD', 'LH'), 'DS');
assert.equal(single('SD', 'RHOUT'), 'DS');
assert.equal(single('DS', 'RH'), 'SD');
assert.equal(single('DS', 'LHOUT'), 'SD');
assert.equal(single('T/SD', 'RHOS'), 'T/DS');
assert.equal(single('T/DS', 'LHOS'), 'T/SD');
const multi = parseGlassUnitConfiguration('DSS');
assert.ok(multi.ok);
assert.equal(resolveGlassUnitConfiguration(placeSingleSidelightForSwing(multi.value, 'RH')), 'DSS');
assert.equal(totalSidelightCount(multi.value), 2);
console.log('Glass Unit Builder composition contract: PASS');
