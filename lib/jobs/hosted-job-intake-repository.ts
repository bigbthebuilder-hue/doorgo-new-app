import { intakeChange } from './mobile-intake';
import { individualDoorIds, validIndividualDoorIds } from './individual-door-ids';
import { normalizeConstruction } from './construction-contract';
import {
  JobIntakeFailure,
  type DoubleDoorSizing,type ArchiveJobCommand,type CreateJobHeaderCommand,type CreateTransferredJobCommand,type DoorLineInput,type JobHeaderInput,
  type JobIntakeRepository,type NativeDoorLine,type NativeJobAggregate,type NativeJobListItem,type NativeJobListCursor,type DeleteJobResult,
  type NativeJobListPage,type NativeJobListRequest,type UpdateJobHeaderCommand,
} from './job-intake-types';
import { normalizeJobHeaderInput, isUuid, jobFailureMessage } from './job-intake-contract';
import { normalizeDoorLineInput } from './door-line-contract';
import { doorLabelKeys, type DoorLabelSaveRequest } from './door-label-save-contract';

type RpcError={message?:string;details?:string;code?:string};
export type NativeJobRpcClient={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:RpcError|null}>};
type HostedRepositoryOptions={client:NativeJobRpcClient|(()=>Promise<NativeJobRpcClient>)};

const headerFields=['bizTrackSalesOrder','lifecycleStage','customer','siteAddress','phone','email','salesperson','notes','hingeColor','shopHours','shopHoursSource','poNumbers','fulfillmentPlan','deliveryDate','customerPickupDate','shopDate','shopDateSource'] as const;
const lineFields=['lineId','lineIndex','lineStatus','mode','doorType','config','width','height','customSlab','customSlabWidth','customSlabHeight','hand','prep','glass','jambWidth','jambType','sill','weatherstrip','hingeType','notes','qty','roWidth','roHeight','material','doorThickness','ripJamb','glassCalcStatus','glassWorkorderDetail','vendorCopyText','glassWarnings','glassBlockers','glassOverride','glassUnits','glassCalc','sidelightType','sidelightGlass','transomGlass','sidelightMeasurementLeft','sidelightMeasurementRight','panelSidelightWidth','panelSidelights','sidelightSpecifications','transomTBarSize','transomGlassTypeCode','transomCustomGlassDescription','includeDiagramOnWorkOrder'] as const;
const serverJobFields=['internalJobId','doorGoReference','bizTrackSalesOrder','customer','siteAddress','phone','email','salesperson','lifecycleStage','notes','hingeColor','shopHours','shopHoursSource','poNumbers','fulfillmentPlan','deliveryDate','customerPickupDate','shopDate','shopDateSource','createdAt','updatedAt','revision','createdByUserId','updatedByUserId','origin','visibleIdentifier','visibleIdentifierKind','legacyJobId','legacyIdentifierKind','transferSourceSystem','transferSchema','transferVersion','transferSourceIdentifierKind','transferSourceIdentifierValue','transferSourceSavedAt','transferExportedAt','transferSourceFingerprint','archivedAt','archivedByUserId','archiveReason'] as const;
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

function fromLineRow(row: unknown): Record<string, unknown> {
  const mapped = fromRow(row, serverLineFields);
  const storedCalc = mapped.glassCalc as NativeDoorLine['glassCalc'];
  const { tBarControl, interiorBottomGap, slabSupply, slabDrilling, framePreparation, slabPreparation, intakeReceipt, prepControl, labelDoorId, labelProductCode, labelSlabSku, labelIndividualDoorIds, ...geometry } = storedCalc ?? {};
  const calc = tBarControl === undefined && labelDoorId === undefined && labelProductCode === undefined && labelIndividualDoorIds === undefined && labelSlabSku === undefined && prepControl === undefined && intakeReceipt === undefined && interiorBottomGap === undefined && slabSupply === undefined && slabDrilling === undefined && framePreparation === undefined && slabPreparation === undefined ? storedCalc : Object.keys(geometry).length ? geometry : null;
  mapped.glassCalc = calc;
  if (typeof tBarControl === 'string') {
    try { const value = JSON.parse(tBarControl); if ((value?.source === 'automatic' || value?.source === 'manual') && (value.size === '1.5' || value.size === '2.25')) mapped.unitTBarControl = value; } catch { /* Preserve legacy explicit sizes if provenance is absent or malformed. */ }
  }
  mapped.gapUnderDoor = typeof interiorBottomGap === 'string' ? interiorBottomGap : null;
  mapped.supplyType = slabSupply === 'slab-only' ? 'slab-only' : 'prehung';
  if (typeof slabPreparation === 'string') {
    try { const value = JSON.parse(slabPreparation); if (value && typeof value === 'object') mapped.slabPreparation = { hand: typeof value.hand === 'string' ? value.hand : null, prep: typeof value.prep === 'string' ? value.prep : null, slabDrilling: typeof value.slabDrilling === 'string' ? value.slabDrilling : null }; } catch { /* Ignore malformed inactive optional metadata. */ }
  }
  mapped.slabDrilling = typeof slabDrilling === 'string' ? slabDrilling : null;
  if (typeof framePreparation === 'string') {
    try { const value = JSON.parse(framePreparation); if (value && typeof value === 'object') mapped.framePreparation = { hand: typeof value.hand === 'string' ? value.hand : null, prep: typeof value.prep === 'string' ? value.prep : null, prepSource: value.prepSource === 'automatic' ? 'automatic' : 'manual' }; } catch { /* Older/malformed optional metadata cannot assign instructions. */ }
  }
  mapped.intakeChange = intakeChange(intakeReceipt);
  mapped.prepSource = prepControl === 'automatic' ? 'automatic' : 'manual';
  mapped.individualDoorIds = individualDoorIds(labelIndividualDoorIds);
  mapped.doorId = typeof labelDoorId === 'string' ? labelDoorId : null;
  mapped.doorSlabSku = typeof labelSlabSku === 'string' ? labelSlabSku : null;
  mapped.productCode = typeof labelProductCode === 'string' ? labelProductCode : null;
  return { ...mapped, construction: normalizeConstruction(calc && typeof calc === 'object' ? (calc as Record<string, unknown>).construction : undefined), doubleDoorSizing: calc && typeof calc === 'object' && !Array.isArray(calc) ? ((calc as Record<string, unknown>).doubleDoorSizing as DoubleDoorSizing | undefined) ?? null : null, doubleDoorAstragal: calc && typeof calc === 'object' && !Array.isArray(calc) ? (calc as Record<string, unknown>).doubleDoorAstragal : null };
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
  const calculatedGeometry = normalizeConstruction(normalized.value.construction) !== 'standard'
    ? { ...(normalized.value.glassCalc ?? {}), construction: normalized.value.construction }
    : normalized.value.glassCalc;
  const receipt = intakeChange(normalized.value.intakeChange);
  const receiptGeometry = normalized.value.prepSource === 'automatic' || receipt
    ? { ...(calculatedGeometry ?? {}), ...(normalized.value.prepSource === 'automatic' ? { prepControl: 'automatic' } : {}), ...(receipt ? { intakeReceipt: JSON.stringify(receipt) } : {}) } : calculatedGeometry;
  const tBarGeometry = normalized.value.unitTBarControl ? { ...(receiptGeometry ?? {}), tBarControl: JSON.stringify(normalized.value.unitTBarControl) } : receiptGeometry;
  const gapGeometry = normalized.value.gapUnderDoor && normalized.value.gapUnderDoor !== '1"' ? { ...(tBarGeometry ?? {}), interiorBottomGap: normalized.value.gapUnderDoor } : tBarGeometry;
  const baseGeometry = normalized.value.slabPreparation ? { ...(gapGeometry ?? {}), slabPreparation: JSON.stringify(normalized.value.slabPreparation) } : gapGeometry;
  const geometry = normalized.value.supplyType === 'slab-only' ? { ...(baseGeometry ?? {}), slabSupply: 'slab-only', ...(normalized.value.slabDrilling ? { slabDrilling: normalized.value.slabDrilling } : {}), ...(normalized.value.framePreparation ? { framePreparation: JSON.stringify(normalized.value.framePreparation) } : {}) } : baseGeometry;
  // Line metadata travels through the existing JSON field, as construction does.
  const { doorId, productCode, doorSlabSku, individualDoorIds: copyIds } = normalized.value;
  const glassCalc = doorId || productCode || doorSlabSku || copyIds?.length ? {
    ...geometry,
    ...(copyIds?.length ? { labelIndividualDoorIds: copyIds } : {}),
    ...(doorId ? { labelDoorId: doorId } : {}),
    ...(productCode ? { labelProductCode: productCode } : {}),
    ...(doorSlabSku ? { labelSlabSku: doorSlabSku } : {}),
  } : geometry;
  return mapFields({...normalized.value, glassCalc, lineId:lineId||undefined,lineIndex:index+1,lineStatus:input.lineStatus==='Archived'||input.lineStatus==='Merged'?input.lineStatus:'Active'},lineFields,true);
}
function unavailable(){return new JobIntakeFailure('unavailable','Hosted Job Intake is temporarily unavailable.');}
function failure(error:RpcError):JobIntakeFailure{
  const message=`${error.message??''} ${error.details??''}`.toLowerCase();
  if (message.includes('native_job.stale_labels')) return new JobIntakeFailure('stale_revision', 'These door labels changed in another session. Reload the job before saving them again.');
  const mappings:[string,ConstructorParameters<typeof JobIntakeFailure>[0]][]=[
    ['authentication_required','authentication_required'],['active_profile_required','active_profile_required'],
    ['manager_required','manager_required'],['permission_required','permission_required'],['stale_revision','stale_revision'],['not_found','not_found'],
    ['duplicate_sales_order','duplicate_biztrack_sales_order'],['duplicate_door_go_reference','duplicate_door_go_reference'],
    ['duplicate_identifier','duplicate_door_go_reference'],['idempotency_conflict','idempotency_conflict'],
    ['duplicate_legacy_job_id','duplicate_legacy_job_id'],['duplicate_source_fingerprint','duplicate_source_fingerprint'],
    ['duplicate_legacy_transfer','duplicate_legacy_transfer'],
    ['unsupported_payload','validation_failed'],['invalid_transfer_provenance','validation_failed'],
    ['invalid_identifier_kind','validation_failed'],['identifier_mismatch','validation_failed'],
    ['archived','archived'],['validation_failed','validation_failed'],
  ];
  const match=mappings.find(([token])=>message.includes(`native_job.${token}`)||message.includes(token));
  if(!match)return unavailable();
  return new JobIntakeFailure(match[1],match[1]==='validation_failed'
    ?'Hosted Job Intake rejected one or more job or door-line fields. Review the entered values and try again.'
    :jobFailureMessage(match[1]));
}

export async function saveHostedDoorLineLabels(client: NativeJobRpcClient, request: DoorLabelSaveRequest): Promise<void> {
  const changes = request?.changes;
  if (!isUuid(request?.internalJobId) || !isUuid(request?.lineId) || !changes || typeof changes !== 'object'
      || Array.isArray(changes) || !Object.keys(changes).length
      || Object.keys(changes).some((key) => !doorLabelKeys.includes(key as typeof doorLabelKeys[number]))) {
    throw new JobIntakeFailure('validation_failed', 'Invalid door label update.');
  }
  for (const [key, change] of Object.entries(changes)) {
    if (!change || typeof change !== 'object' || Array.isArray(change)
        || Object.keys(change).sort().join(',') !== 'expected,value'
        || [change.expected, change.value].some((value) => key === 'individualDoorIds' ? !Array.isArray(value) || !validIndividualDoorIds(value) : value !== null && typeof value !== 'string')) {
      throw new JobIntakeFailure('validation_failed', 'Invalid door label values.');
    }
  }
  const result = await client.rpc('dg_update_native_door_labels', {
    p_internal_job_id: request.internalJobId, p_line_id: request.lineId, p_changes: changes,
  });
  if (result.error) throw failure(result.error);
  if (result.data !== true) throw unavailable();
}
function aggregate(value:unknown):NativeJobAggregate{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw unavailable();
  const envelope=value as Record<string,unknown>;
  const job=fromRow(envelope.job,serverJobFields);
  if(typeof job.internalJobId!=='string'||(job.doorGoReference!==null&&typeof job.doorGoReference!=='string')||typeof job.revision!=='number'||!Array.isArray(envelope.lines)) throw unavailable();
  const lines=envelope.lines.map((row)=>fromLineRow(row) as NativeDoorLine);
  return {...job,lines} as NativeJobAggregate;
}
function listItem(value:unknown):NativeJobListItem{
  const row=fromRow(value,['internalJobId','doorGoReference','bizTrackSalesOrder','visibleIdentifier','visibleIdentifierKind','legacyJobId','customer','siteAddress','salesperson','isComplete','lifecycleStage','createdAt','updatedAt','revision','archivedAt','activeLineCount','archivedLineCount']);
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
    async list(){
      const jobs = new Map<string, NativeJobListItem>();
      const cursors = new Set<string>();
      let cursor: NativeJobListCursor | null = null;
      do {
        const result = await listPage({ limit: 100, cursor });
        for (const job of result.items) jobs.set(job.internalJobId, job);
        cursor = result.page.nextCursor;
        if (cursor) {
          const key = JSON.stringify(cursor);
          if (cursors.has(key)) throw unavailable();
          cursors.add(key);
        }
      } while (cursor);
      return [...jobs.values()];
    },listPage,
    async findById(internalJobId){try{return aggregate(await call('dg_get_native_job',{p_internal_job_id:internalJobId,p_include_archived:false}));}catch(error){if(error instanceof JobIntakeFailure&&error.code==='not_found')return null;throw error;}},
    async create(command:CreateJobHeaderCommand){
      return aggregate(await call('dg_create_native_job',{p_command_id:command.commandId,p_origin:'native',p_legacy_job_id:null,p_legacy_identifier_kind:null,p_header:createHeaderPayload(command.input,command.defaultSalesperson),p_lines:(command.lines??[]).map(linePayload)}));
    },
    async createTransferred(command:CreateTransferredJobCommand){
      const provenance=command.provenance;
      return aggregate(await call('dg_create_transferred_native_job',{
        p_command_id:command.commandId,
        p_provenance:{direction:provenance.direction,source_system:provenance.sourceSystem,source_job_state:provenance.sourceJobState,transfer_schema:provenance.transferSchema,transfer_version:provenance.transferVersion,source_identifier_kind:provenance.sourceIdentifierKind,source_identifier_value:provenance.sourceIdentifierValue,source_saved_at:provenance.sourceSavedAt,exported_at:provenance.exportedAt,source_fingerprint:provenance.sourceFingerprint},
        p_header:createHeaderPayload(command.input,command.defaultSalesperson),
        p_lines:command.lines.map(linePayload),
      }));
    },
    async update(command:UpdateJobHeaderCommand){
      const lines=command.lines??(await this.findById(command.internalJobId))?.lines;
      if(!lines)throw new JobIntakeFailure('not_found','The requested job was not found.');
      return aggregate(await call('dg_update_native_job',{p_internal_job_id:command.internalJobId,p_expected_revision:command.expectedRevision,p_header:headerPayload(command.input),p_lines:lines.map(linePayload)}));
    },
    async archive(command:ArchiveJobCommand){return aggregate(await call('dg_archive_native_job',{p_internal_job_id:command.internalJobId,p_expected_revision:command.expectedRevision,p_reason:command.reason}));},
    async deletePermanently(command){
      const data=await call('dg_delete_native_job',{p_internal_job_id:command.internalJobId,p_expected_revision:command.expectedRevision});
      if(!data||typeof data!=='object'||Array.isArray(data))throw unavailable();
      const result=data as Record<string,unknown>;
      if(typeof result.internal_job_id!=='string'||typeof result.visible_identifier!=='string'||typeof result.deleted_production_bookings!=='number')throw unavailable();
      return {internalJobId:result.internal_job_id,visibleIdentifier:result.visible_identifier,deletedProductionBookings:result.deleted_production_bookings} satisfies DeleteJobResult;
    },
  };
}
