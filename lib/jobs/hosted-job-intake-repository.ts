import {
  JobIntakeFailure,
  type ArchiveJobCommand,type CreateJobHeaderCommand,type DoorLineInput,type JobHeaderInput,
  type JobIntakeRepository,type NativeDoorLine,type NativeJobAggregate,type NativeJobListItem,
  type NativeJobListPage,type NativeJobListRequest,type UpdateJobHeaderCommand,
} from './job-intake-types';
import { normalizeJobHeaderInput, isUuid, jobFailureMessage } from './job-intake-contract';
import { normalizeDoorLineInput } from './door-line-contract';

type RpcError={message?:string;details?:string;code?:string};
export type NativeJobRpcClient={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:RpcError|null}>};
type HostedRepositoryOptions={client:NativeJobRpcClient|(()=>Promise<NativeJobRpcClient>)};

const headerFields=['bizTrackSalesOrder','lifecycleStage','customer','siteAddress','phone','email','salesperson','notes','hingeColor','shopHours','shopHoursSource','poNumbers','fulfillmentPlan','deliveryDate','customerPickupDate','shopDate','shopDateSource'] as const;
const lineFields=['lineId','lineIndex','lineStatus','mode','doorType','config','width','height','customSlab','customSlabWidth','customSlabHeight','hand','prep','glass','jambWidth','jambType','sill','weatherstrip','hingeType','notes','qty','roWidth','roHeight','material','doorThickness','ripJamb','glassCalcStatus','glassWorkorderDetail','vendorCopyText','glassWarnings','glassBlockers','glassOverride','glassUnits','glassCalc','sidelightType','sidelightGlass','transomGlass','sidelightMeasurementLeft','sidelightMeasurementRight','panelSidelightWidth','panelSidelights','includeDiagramOnWorkOrder'] as const;
const serverJobFields=['internalJobId','doorGoReference','bizTrackSalesOrder','customer','siteAddress','phone','email','salesperson','lifecycleStage','notes','hingeColor','shopHours','shopHoursSource','poNumbers','fulfillmentPlan','deliveryDate','customerPickupDate','shopDate','shopDateSource','createdAt','updatedAt','revision','createdByUserId','updatedByUserId','origin','visibleIdentifier','visibleIdentifierKind','legacyJobId','legacyIdentifierKind','archivedAt','archivedByUserId','archiveReason'] as const;
const serverLineFields=[...lineFields,'createdAt','updatedAt','createdByUserId','updatedByUserId'] as const;
const snake=(value:string)=>value==='bizTrackSalesOrder'?'biztrack_sales_order':value.replace(/[A-Z]/g,(letter)=>`_${letter.toLowerCase()}`);

function mapFields(source:Record<string,unknown>,fields:readonly string[],toSnake:boolean):Record<string,unknown>{
  return Object.fromEntries(fields.filter((field)=>source[field]!==undefined).map((field)=>[toSnake?snake(field):field,source[field]]));
}
function fromRow(row:unknown,fields:readonly string[]):Record<string,unknown>{
  if(!row||typeof row!=='object'||Array.isArray(row)) throw unavailable();
  const source=row as Record<string,unknown>;
  return Object.fromEntries(fields.map((field)=>[field,source[snake(field)]]));
}
function createHeaderPayload(input:JobHeaderInput,defaultSalesperson:string|null):Record<string,unknown>{
  const normalized=normalizeJobHeaderInput(input,defaultSalesperson);
  if(normalized.ok===false)throw new JobIntakeFailure('validation_failed',normalized.message,normalized.fieldErrors);
  return mapFields({...normalized.value,lifecycleStage:input.lifecycleStage},headerFields,true);
}
function headerPayload(input:JobHeaderInput):Record<string,unknown>{return mapFields(input,headerFields,true);}
function linePayload(input:DoorLineInput,index:number):Record<string,unknown>{
  const lineId=typeof input.lineId==='string'?input.lineId:'';
  if(lineId&&!isUuid(lineId))throw new JobIntakeFailure('validation_failed',`Door line ${index+1}: A new door line must have a valid UUID identity.`,{[`lines.${index}.lineId`]:'A new door line must have a valid UUID identity.'});
  const normalized=normalizeDoorLineInput(input);
  if(normalized.ok===false)throw new JobIntakeFailure('validation_failed',`Door line ${index+1}: ${normalized.message}`,Object.fromEntries(Object.entries(normalized.fieldErrors).map(([key,value])=>[`lines.${index}.${key}`,value])));
  return mapFields({...normalized.value,lineId:lineId||undefined,lineIndex:index+1,lineStatus:input.lineStatus==='Archived'||input.lineStatus==='Merged'?input.lineStatus:'Active'},lineFields,true);
}
function unavailable(){return new JobIntakeFailure('unavailable','Hosted Job Intake is temporarily unavailable.');}
function failure(error:RpcError):JobIntakeFailure{
  const message=`${error.message??''} ${error.details??''}`.toLowerCase();
  const mappings:[string,ConstructorParameters<typeof JobIntakeFailure>[0]][]=[
    ['authentication_required','authentication_required'],['active_profile_required','active_profile_required'],
    ['permission_required','permission_required'],['stale_revision','stale_revision'],['not_found','not_found'],
    ['duplicate_sales_order','duplicate_biztrack_sales_order'],['duplicate_door_go_reference','duplicate_door_go_reference'],
    ['duplicate_identifier','duplicate_door_go_reference'],['idempotency_conflict','idempotency_conflict'],
    ['archived','archived'],['validation_failed','validation_failed'],
  ];
  const match=mappings.find(([token])=>message.includes(`native_job.${token}`)||message.includes(token));
  if(!match)return unavailable();
  return new JobIntakeFailure(match[1],match[1]==='validation_failed'
    ?'Hosted Job Intake rejected one or more job or door-line fields. Review the entered values and try again.'
    :jobFailureMessage(match[1]));
}
function aggregate(value:unknown):NativeJobAggregate{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw unavailable();
  const envelope=value as Record<string,unknown>;
  const job=fromRow(envelope.job,serverJobFields);
  if(typeof job.internalJobId!=='string'||typeof job.doorGoReference!=='string'||typeof job.revision!=='number'||!Array.isArray(envelope.lines)) throw unavailable();
  const lines=envelope.lines.map((row)=>fromRow(row,serverLineFields) as NativeDoorLine);
  return {...job,lines} as NativeJobAggregate;
}
function listItem(value:unknown):NativeJobListItem{
  const row=fromRow(value,['internalJobId','doorGoReference','bizTrackSalesOrder','customer','siteAddress','lifecycleStage','createdAt','updatedAt','revision','archivedAt','activeLineCount','archivedLineCount']);
  if(typeof row.internalJobId!=='string'||typeof row.updatedAt!=='string'||typeof row.revision!=='number') throw unavailable();
  return row as NativeJobListItem;
}

export function createHostedJobIntakeRepository(options:HostedRepositoryOptions):JobIntakeRepository{
  const client=async()=>typeof options.client==='function'?options.client():options.client;
  const call=async(name:string,args:Record<string,unknown>)=>{
    try{const result=await (await client()).rpc(name,args);if(result.error)throw failure(result.error);return result.data;}
    catch(error){if(error instanceof JobIntakeFailure)throw error;throw unavailable();}
  };
  const listPage=async(request:NativeJobListRequest={}):Promise<NativeJobListPage>=>{
    const limit=request.limit??50;
    if(!Number.isInteger(limit)||limit<1||limit>100||(request.cursor&&(!request.cursor.updatedAt||!request.cursor.internalJobId)))throw new JobIntakeFailure('validation_failed','The requested jobs page is invalid.');
    const data=await call('dg_list_native_jobs',{p_include_archived:request.includeArchived??false,p_limit:limit,p_cursor_updated_at:request.cursor?.updatedAt??null,p_cursor_internal_job_id:request.cursor?.internalJobId??null});
    if(!data||typeof data!=='object'||Array.isArray(data))throw unavailable();
    const result=data as Record<string,unknown>,page=result.page as Record<string,unknown>;
    if(!Array.isArray(result.items)||!page||typeof page!=='object')throw unavailable();
    const hasMore=page.has_more===true;
    if(typeof page.limit!=='number'||(hasMore&&(typeof page.next_cursor_updated_at!=='string'||typeof page.next_cursor_internal_job_id!=='string')))throw unavailable();
    const nextCursor=hasMore?{updatedAt:String(page.next_cursor_updated_at),internalJobId:String(page.next_cursor_internal_job_id)}:null;
    return {items:result.items.map(listItem),page:{limit:Number(page.limit),hasMore,nextCursor}};
  };
  return {
    async list(){return (await listPage()).items;},listPage,
    async findById(internalJobId){try{return aggregate(await call('dg_get_native_job',{p_internal_job_id:internalJobId,p_include_archived:false}));}catch(error){if(error instanceof JobIntakeFailure&&error.code==='not_found')return null;throw error;}},
    async create(command:CreateJobHeaderCommand){
      return aggregate(await call('dg_create_native_job',{p_command_id:command.commandId,p_origin:'native',p_legacy_job_id:null,p_legacy_identifier_kind:null,p_header:createHeaderPayload(command.input,command.defaultSalesperson),p_lines:(command.lines??[]).map(linePayload)}));
    },
    async update(command:UpdateJobHeaderCommand){
      const lines=command.lines??(await this.findById(command.internalJobId))?.lines;
      if(!lines)throw new JobIntakeFailure('not_found','The requested job was not found.');
      return aggregate(await call('dg_update_native_job',{p_internal_job_id:command.internalJobId,p_expected_revision:command.expectedRevision,p_header:headerPayload(command.input),p_lines:lines.map(linePayload)}));
    },
    async archive(command:ArchiveJobCommand){return aggregate(await call('dg_archive_native_job',{p_internal_job_id:command.internalJobId,p_expected_revision:command.expectedRevision,p_reason:command.reason}));},
  };
}
