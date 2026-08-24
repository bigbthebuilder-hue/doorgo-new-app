import assert from 'node:assert/strict';
import { compatibleFulfillmentTiming, fulfillmentCardOrderLabel, salesOrderFamily, validateBackorderSalesOrder } from './order-family';

assert.equal(salesOrderFamily('123450'), '123450');
assert.equal(salesOrderFamily('123451'), '123450');
assert.equal(salesOrderFamily('123454'), '123450');
assert.equal(salesOrderFamily('123455'), '123455');
assert.equal(salesOrderFamily('123458'), '123455');
assert.equal(salesOrderFamily('SO 123458'), null);
assert.deepEqual(validateBackorderSalesOrder('123455', '123456'), { ok: true, familyKey: '123455', salesOrder: '123456' });
assert.equal(validateBackorderSalesOrder('123455', '123461').ok, false);
assert.equal(validateBackorderSalesOrder('123455', '123455').ok, false);
assert.equal(fulfillmentCardOrderLabel(['123455'], null), '123455');
assert.equal(fulfillmentCardOrderLabel(['123456', '123455', '123456'], null), '123455 +1');
assert.deepEqual(compatibleFulfillmentTiming('', 'AM'), { compatible: true, timing: 'AM' });
assert.deepEqual(compatibleFulfillmentTiming('AM', 'am'), { compatible: true, timing: 'AM' });
assert.equal(compatibleFulfillmentTiming('AM', 'PM').compatible, false);
console.log('Calendar order-family contract tests passed');
