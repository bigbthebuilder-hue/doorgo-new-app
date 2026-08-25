'use client';

import { useEffect, useState } from 'react';
import { addBackorder, loadNextBackorderSalesOrder } from '@/lib/calendar/fulfillment-actions';
import type { ProductionBoardCard } from '@/lib/production-board/types';
import { getCurrentDateInTimeZone } from '@/lib/production-board/date-utils';
import { DateOnlyPicker } from '@/components/jobs/DateOnlyPicker';

export function AddBackorderDialog({baseSalesOrder,customer,linkedInternalJobId,onClose,onCreated}:{baseSalesOrder:string;customer:string;linkedInternalJobId:string;onClose:()=>void;onCreated?:(card:ProductionBoardCard,salesOrder:string)=>void}){
  const [nextSalesOrder,setNextSalesOrder]=useState<string|null|undefined>(undefined);const [itemType,setItemType]=useState<'delivery'|'customer_pickup'>('delivery');const [scheduled,setScheduled]=useState<string|null>(null);const [timing,setTiming]=useState('');const [note,setNote]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let cancelled=false;void loadNextBackorderSalesOrder(linkedInternalJobId,baseSalesOrder).then((result)=>{if(!cancelled)setNextSalesOrder(result.ok?result.salesOrder:null);});return()=>{cancelled=true;};},[baseSalesOrder,linkedInternalJobId]);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setPending(true);setError(null);const result=await addBackorder({commandId:crypto.randomUUID(),linkedInternalJobId,baseSalesOrder,itemType,scheduledDate:scheduled,timing,fulfillmentNote:note,today:getCurrentDateInTimeZone('America/Vancouver')});setPending(false);if(!result.ok){setError(result.message);return;}onCreated?.(result.card,result.salesOrder);onClose();};
  return <div className="calendar-floating-backdrop"><form className="calendar-quick-add calendar-quick-add-form calendar-backorder-dialog" onSubmit={submit}><header><strong>Schedule Backorder Fulfillment</strong><button aria-label="Close Backorder Fulfillment" onClick={onClose} type="button">×</button></header><p>Create a Delivery or Customer Pickup for another Sales Order in this order family.</p><p>{customer} · Family {baseSalesOrder}</p>
    <div className="calendar-backorder-number"><span>Backorder Sales Order</span><strong>{nextSalesOrder===undefined?'Loading…':nextSalesOrder??'Unavailable'}</strong><small>{nextSalesOrder?'Next available':'No available backorder numbers remain in this order family.'}</small></div>
    <label><span>Fulfillment Type</span><select autoFocus value={itemType} onChange={(event)=>setItemType(event.target.value as typeof itemType)}><option value="delivery">Delivery</option><option value="customer_pickup">Customer Pickup</option></select></label>
    <label><span>Date</span><DateOnlyPicker ariaLabel="Backorder fulfillment date" disabled={pending} id="backorder-date" onChange={(value)=>setScheduled(value||null)} value={scheduled??''}/><small>Leave blank for TBD / Needs Attention.</small></label>
    <label><span>Timing (optional)</span><input value={timing} onChange={(event)=>setTiming(event.target.value)}/></label>
    <label><span>Fulfillment note (optional)</span><textarea value={note} onChange={(event)=>setNote(event.target.value)}/></label>
    {error?<p role="alert">{error}</p>:null}<footer><button disabled={pending} onClick={onClose} type="button">Cancel</button><button disabled={pending||nextSalesOrder===null} type="submit">{pending?'Adding…':'Add Backorder Fulfillment'}</button></footer>
  </form></div>;
}
