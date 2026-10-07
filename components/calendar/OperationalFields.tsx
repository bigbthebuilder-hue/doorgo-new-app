export type OperationalFieldsValue = { name:string; salesOrder:string; salesperson:string; shopHours:string; timing:string; fulfillmentNote:string };

export function OperationalFields({kind,value,onChange,identityReadOnly=false,nameReadOnly=false}:{kind:string;value:OperationalFieldsValue;onChange:(patch:Partial<OperationalFieldsValue>)=>void;identityReadOnly?:boolean;nameReadOnly?:boolean}) {
  return <>
    <label><span>Name *</span><input required readOnly={nameReadOnly} value={value.name} onChange={event=>onChange({name:event.target.value})}/></label>
    <label><span>Sales Order</span><input readOnly={identityReadOnly} value={value.salesOrder} onChange={event=>onChange({salesOrder:event.target.value})}/>{identityReadOnly?<small>Established order identity is read-only.</small>:null}</label>
    <label><span>Salesperson{kind==='production'?' *':''}</span><input required={kind==='production'} value={value.salesperson} onChange={event=>onChange({salesperson:event.target.value})}/></label>
    {kind==='production'?<label><span>Shop Hours</span><input type="number" min="0" step="0.01" value={value.shopHours} onChange={event=>onChange({shopHours:event.target.value})}/></label>:<>
      <label><span>Timing</span><input placeholder="AM, after lunch, before 3" value={value.timing} onChange={event=>onChange({timing:event.target.value})}/></label>
      <label><span>Fulfillment note</span><textarea value={value.fulfillmentNote} onChange={event=>onChange({fulfillmentNote:event.target.value})}/></label>
    </>}
  </>;
}
