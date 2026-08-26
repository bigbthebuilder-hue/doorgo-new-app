import assert from'node:assert/strict';
import{configuredStaffForDate,configuredWorkingDaysForDate,exceptionalCapacity}from'./capacity-exceptions';
import type{CapacityStaff}from'./capacity-configuration';

const weekdays=(productiveHours:number)=>Array.from({length:7},(_,weekday)=>({weekday,scheduledHours:weekday>=1&&weekday<=5?8:0,capacityHours:weekday>=1&&weekday<=5?productiveHours:0}));
const roster:CapacityStaff[]=[
  {staffId:'j',displayName:'Jordan',active:true,revision:1,versions:[{effectiveFrom:'2026-01-01',capacityRole:'direct_production',weekdays:weekdays(7)}]},
  {staffId:'c',displayName:'Craig',active:true,revision:1,versions:[{effectiveFrom:'2026-01-01',capacityRole:'direct_production',weekdays:weekdays(7)}]},
  {staffId:'d',displayName:'Daniel',active:true,revision:1,versions:[{effectiveFrom:'2026-01-01',capacityRole:'direct_production',weekdays:weekdays(5)}]},
  {staffId:'a',displayName:'Aaron',active:true,revision:1,versions:[{effectiveFrom:'2026-01-01',capacityRole:'support',weekdays:weekdays(4)}]},
  {staffId:'i',displayName:'Inactive',active:false,revision:1,versions:[{effectiveFrom:'2026-01-01',capacityRole:'direct_production',weekdays:weekdays(5)}]},
];
const workweeks=[{effectiveFrom:'2026-01-01',weekdays:[1,2,3,4,5]}];
const workingDays=configuredWorkingDaysForDate(workweeks,'2026-08-29');
const saturday=configuredStaffForDate(roster,'2026-08-29',workingDays);
assert.deepEqual(saturday.map(item=>item.displayName),['Aaron','Craig','Daniel','Jordan']);
assert.equal(saturday.find(item=>item.staffId==='a')?.productiveHours,0);
assert.equal(exceptionalCapacity(saturday),19);
assert.equal(configuredStaffForDate(roster,'2026-08-29',workingDays,['i']).length,5);
assert.equal(exceptionalCapacity([]),0);
const varyingRoster:CapacityStaff[]=[{...roster[1],versions:[{...roster[1].versions[0],weekdays:weekdays(7).map(day=>day.weekday===2?{...day,capacityHours:6}:day)}]}];
assert.equal(configuredStaffForDate(varyingRoster,'2026-08-29',workingDays)[0].productiveHours,7);
console.log('Manager capacity exception tests passed');
