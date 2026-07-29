import assert from 'node:assert/strict';
import { createHostedJobIntakeRepository,type NativeJobRpcClient } from './hosted-job-intake-repository';
import { JobIntakeFailure } from './job-intake-types';
import { readFileSync } from 'node:fs';

const job={internal_job_id:'11111111-1111-4111-8111-111111111111',door_go_reference:'DG-000013',biztrack_sales_order:null,
  customer:'Adapter Test',site_address:'Test Site',phone:null,email:null,salesperson:'Tester',lifecycle_stage:'Draft',notes:null,
  hinge_color:null,shop_hours:1,shop_hours_source:'Calculated',po_numbers:['100'],fulfillment_plan:null,delivery_date:null,
  customer_pickup_date:null,shop_date:null,shop_date_source:null,created_at:'2026-07-29T10:00:00.000Z',updated_at:'2026-07-29T10:00:00.000Z',
  revision:1,created_by_user_id:'22222222-2222-4222-8222-222222222222',updated_by_user_id:'22222222-2222-4222-8222-222222222222'};
const line={line_id:'33333333-3333-4333-8333-333333333333',line_index:1,line_status:'Active',mode:'Interior',door_type:null,
  config:'S',width:'36',height:'80',custom_slab:null,custom_slab_width:null,custom_slab_height:null,hand:null,prep:null,glass:null,
  jamb_width:null,jamb_type:null,sill:null,weatherstrip:null,hinge_type:null,notes:null,qty:1,ro_width:null,ro_height:null,
  material:null,door_thickness:null,rip_jamb:null,glass_calc_status:'Not Needed',glass_workorder_detail:null,vendor_copy_text:null,
  glass_warnings:[],glass_blockers:[],glass_override:null,glass_units:[],glass_calc:null,sidelight_type:null,sidelight_glass:null,
  transom_glass:null,sidelight_measurement_left:null,sidelight_measurement_right:null,panel_sidelight_width:null,panel_sidelights:[],
  include_diagram_on_work_order:true,created_at:job.created_at,updated_at:job.updated_at,created_by_user_id:job.created_by_user_id,updated_by_user_id:job.updated_by_user_id};

async function main(){
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const client:NativeJobRpcClient={rpc:async(name,args)=>{calls.push({name,args});
    if(name==='dg_list_native_jobs')return {data:{items:[{...job,active_line_count:1,archived_line_count:0,archived_at:null}],page:{limit:2,has_more:true,next_cursor_updated_at:job.updated_at,next_cursor_internal_job_id:job.internal_job_id}},error:null};
    return {data:{job,lines:[line]},error:null};}};
  const repository=createHostedJobIntakeRepository({client});
  const factory=readFileSync('lib/jobs/job-intake-repository.ts','utf8');
  assert.match(factory,/if \(testRepository\) return testRepository/,'explicit test repository injection remains available');
  assert.match(factory,/createHostedJobIntakeRepository/,'normal runtime selects hosted persistence');
  assert.doesNotMatch(factory,/createLocalJobIntakeRepository/,'normal runtime has no local fallback');
  const created=await repository.create({commandId:'44444444-4444-4444-8444-444444444444',actorUserId:job.created_by_user_id,
    defaultSalesperson:'Tester',input:{customer:'Adapter Test',poNumbers:['100'],lifecycleStage:'Draft'},lines:[{lineId:line.line_id,lineIndex:1,lineStatus:'Active',mode:'Interior',config:'S',width:'36',height:'80',qty:1}]});
  assert.equal(created.internalJobId,job.internal_job_id);assert.equal(created.lines[0].lineId,line.line_id);
  assert.deepEqual(calls[0],{name:'dg_create_native_job',args:{p_command_id:'44444444-4444-4444-8444-444444444444',p_origin:'native',p_legacy_job_id:null,p_legacy_identifier_kind:null,
    p_header:{customer:'Adapter Test',po_numbers:['100'],lifecycle_stage:'Draft',salesperson:'Tester'},p_lines:[{line_id:line.line_id,line_index:1,line_status:'Active',mode:'Interior',config:'S',width:'36',height:'80',qty:1}]}});
  await repository.update({internalJobId:job.internal_job_id,expectedRevision:1,actorUserId:job.created_by_user_id,input:{notes:'Updated'},lines:[{...created.lines[0]}]});
  assert.equal(calls[1].name,'dg_update_native_job');assert.equal(calls[1].args.p_expected_revision,1);
  await repository.archive({internalJobId:job.internal_job_id,expectedRevision:2,reason:'Done'});assert.equal(calls[2].name,'dg_archive_native_job');
  assert.equal((await repository.findById(job.internal_job_id))?.lines[0].config,'S');assert.equal(calls[3].name,'dg_get_native_job');
  const page=await repository.listPage({limit:2,cursor:{updatedAt:'2026-07-29T11:00:00.000Z',internalJobId:'55555555-5555-4555-8555-555555555555'}});
  assert.equal(page.items[0].activeLineCount,1);assert.equal(page.page.hasMore,true);assert.equal(page.page.nextCursor?.internalJobId,job.internal_job_id);
  assert.deepEqual(calls[4].args,{p_include_archived:false,p_limit:2,p_cursor_updated_at:'2026-07-29T11:00:00.000Z',p_cursor_internal_job_id:'55555555-5555-4555-8555-555555555555'});
  await assert.rejects(repository.listPage({limit:101}),(error)=>error instanceof JobIntakeFailure&&error.code==='validation_failed');
  for(const [token,code] of [['authentication_required','authentication_required'],['permission_required','permission_required'],['stale_revision','stale_revision'],['duplicate_sales_order','duplicate_biztrack_sales_order'],['duplicate_door_go_reference','duplicate_door_go_reference']] as const){
    const failing=createHostedJobIntakeRepository({client:{rpc:async()=>({data:null,error:{message:`native_job.${token}`}})}});
    await assert.rejects(failing.create({commandId:job.internal_job_id,actorUserId:job.created_by_user_id,defaultSalesperson:null,input:{},lines:[]}),(error)=>error instanceof JobIntakeFailure&&error.code===code);
  }
  const unavailable=createHostedJobIntakeRepository({client:{rpc:async()=>{throw new Error('network');}}});
  await assert.rejects(unavailable.list(),(error)=>error instanceof JobIntakeFailure&&error.code==='unavailable');
  console.log('Hosted native-job repository adapter tests passed');
}
void main();
