import type { NativeDoorLine, NativeJobAggregate } from '../../lib/jobs/job-intake-types';
import { samples } from '../../door-label-preview/samples';
import { prepareDoorLabels, type LabelSelection } from '../../lib/jobs/door-label-contract';

const baseJob = samples[0].job;
const base = { ...baseJob.lines[0], qty: 1, doorId: 'Opening 101', individualDoorIds: [], notes: '', productCode: null, doorSlabSku: null,
  doorType: 'Shaker two panel', hand: 'LH', config: 'D', material: 'Wood', sill: 'NONE', jambWidth: '4-9/16"' } as NativeDoorLine;
const entries: { name: string; line: Partial<NativeDoorLine>; customer?: string; address?: string; omitNotes?: boolean }[] = [
  { name: 'Standard interior - no barcode', line: {} },
  { name: 'Standard exterior - single barcode', line: { mode:'Exterior',doorType:'Smooth flush panel',jambWidth:'6-9/16"',material:'Fiberglass',sill:'STD',productCode:'zz_DW_6380',doorId:'Front entry' } },
  { name: 'Single door with transom - dual barcode', line: {mode:'Exterior',config:'T/D',doorType:'Fir text Vista GR. 4 lite',jambWidth:'6-9/16"',doorId:'Left side',productCode:'zz_DW_6380',doorSlabSku:'30DRS3F'} },
  { name: 'Sidelights and transom', line: {mode:'Exterior',config:'T/SDS',doorType:'Craftsman clear Low-E',jambWidth:'6-9/16"',doorId:'Main entrance',productCode:'zz_UNIT_0012',doorSlabSku:'SLAB_3010'} },
  { name: 'Double door', line: {config:'DD',doorType:'Shaker three panel pair',doorId:'Office double',hand:'RH',productCode:'00004218'} },
  { name: 'Pocket door', line: {config:'PKT',doorType:'Flush pocket door',jambWidth:null,hand:null,doorId:'Ensuite pocket',productCode:'00004218'} },
  { name: 'Bifold - existing free-text description', line: {config:'',doorType:'Two-panel bifold closet doors',jambWidth:null,hand:null,doorId:'Bedroom closet',productCode:null} },
  { name: 'Slab Only interior - no swing', line: {supplyType:'slab-only',doorType:'Replacement shaker slab',prep:null,hand:null,doorId:'Bedroom 2',productCode:null} },
  { name: 'Slab Only exterior MTM - no drilling or swing', line: {mode:'Exterior',supplyType:'slab-only',prep:'MTM',slabDrilling:null,hand:null,doorType:'Replacement fir slab',doorId:'Rear entry',doorSlabSku:'30FIR-MTM',notes:'Match supplied slab.'} },
  { name: 'MTM with explicit drilling and swing', line: {mode:'Exterior',supplyType:'slab-only',prep:'MTM',slabDrilling:'STD',hand:'RH',doorType:'Replacement flush slab',doorId:'Utility entry',doorSlabSku:'30DRS00',notes:'Keep with original slab.'} },
  { name: 'Custom size', line: {customSlab:'WoodCustom',customSlabWidth:'31-3/8"',customSlabHeight:'77-1/4"',doorType:'Custom fir five panel',doorId:'Study',hand:'RH'} },
  { name: 'Cutdown height', line: {customSlab:'CustomHeight',customSlabHeight:'74-7/8"',doorType:'Cutdown shaker two panel',doorId:'Basement hall',productCode:'CUT-3012'} },
  { name: 'Three individual Door IDs', line: {qty:3,individualDoorIds:['Bedroom 1','Bedroom 2','Bedroom 3'],doorId:'Fallback',doorType:'Shaker two panel',productCode:'INT-SHAKER'} },
  { name: 'Long customer, address and description', customer:'North Shore Heritage Millwork & Renovations Ltd.',address:'Building F, second floor, 124 Sample Crescent, North Vancouver, BC',line: {doorType:'Custom three-panel fir door with matching glazed upper panel',doorId:'Second floor north bedroom',productCode:null} },
  { name: 'Extensive optional notes - intentional continuation', line: {doorId:'Suite 204',doorType:'Flush painted door',productCode:'INT-FLUSH',notes:'Confirm the opening number against the room schedule. Keep the wrapped door upright and protect the finished face. '.repeat(12)} },
  { name: 'Demanding long text, ID, notes and dual barcode',customer:'West Coast Heritage Homes & Renovations',address:'Building F - second floor north wing, 124 Sample Crescent',line:{mode:'Exterior',doorId:'F-204 North',doorType:'Custom fir four-lite glazed replacement door',config:'T/SD',jambWidth:'6-9/16"',productCode:'zz_SO_DOOR_0123',doorSlabSku:'30DRS3F',notes:'Keep upright and wrapped. Confirm F-204 before delivery. Protect the glass and finished face.'} },
  { name: 'Optional notes omitted',omitNotes:true,line:{doorId:'Laundry',doorType:'Shaker two panel',notes:'These optional notes must not appear.',productCode:'INT-LAUNDRY'} },
  { name: 'Missing optional information - no reserved rows',address:'',line:{doorId:'',doorType:'Flush',config:'',jambWidth:null,hand:null,width:'',height:'',productCode:null} },
];
export const labelReviewCases = entries.map((entry,index) => {
  const line = { ...base, ...entry.line, lineId:'review-'+(index+1),lineIndex:1 } as NativeDoorLine;
  const job = {...baseJob,internalJobId:'review-job-'+(index+1),customer:entry.customer || 'Cedar Ridge Builders',bizTrackSalesOrder:String(900001+index),siteAddress:entry.address ?? '124 Sample Crescent, Building F',lines:[line]} as NativeJobAggregate;
  const selection: LabelSelection = {[line.lineId]:{selected:true,quantity:String(line.qty),doorIds:[]}};
  const preview=prepareDoorLabels(job,selection,Boolean(entry.omitNotes));
  if(preview.error || !preview.html)throw new Error(entry.name+': '+preview.error);
  return {name:entry.name,job,line,selection,omitNotes:Boolean(entry.omitNotes),html:preview.html};
});
