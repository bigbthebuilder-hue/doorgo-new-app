import assert from 'node:assert/strict';
import { executeProductionPlacement, type ProductionPlacementRequest } from './production-placement-contract';

const base:ProductionPlacementRequest={commandId:'11111111-1111-4111-8111-111111111111',bookingId:'booking-1',expectedProductionDate:'2026-08-24',destinationProductionDate:null,whollyUnstartedAcknowledged:false,backdateReason:null,closedDateOverrideAcknowledged:false};
const row=(overrides:Record<string,unknown>={})=>[{move_id:'22222222-2222-4222-8222-222222222222',booking_id:'booking-1',previous_production_date:'2026-08-24',new_production_date:null,previous_day_order:'1024',new_day_order:'-1024',shop_hours:'1.5',moved_at:'2026-08-21T00:00:00Z',action_type:'unschedule',destination_was_closed:false,status:'moved',...overrides}];

async function main(){
  let parameters:Record<string,unknown>|null=null;
  const unscheduled=await executeProductionPlacement(base,async(name,input)=>{assert.equal(name,'place_production_booking');parameters=input;return {data:row(),error:null};});
  assert.equal(unscheduled.ok,true);assert.equal((parameters as Record<string,unknown>|null)?.['p_destination_production_date'],null);
  const scheduled=await executeProductionPlacement({...base,expectedProductionDate:null,destinationProductionDate:'2026-08-25'},async()=>({data:row({previous_production_date:null,new_production_date:'2026-08-25',action_type:'schedule',new_day_order:'3072'}),error:null}));
  assert.equal(scheduled.ok,true);if(scheduled.ok)assert.equal(scheduled.move.newProductionDate,'2026-08-25');
  const stale=await executeProductionPlacement(base,async()=>({data:null,error:{message:'production_placement.stale_booking'}}));
  assert.equal(stale.ok,false); if(!stale.ok) assert.equal(stale.code,'stale_booking');
  assert.equal((await executeProductionPlacement({...base,expectedProductionDate:null,destinationProductionDate:null},async()=>({data:row(),error:null}))).ok,false);
  console.log('Production Needs Attention placement contract tests passed');
}
void main();
