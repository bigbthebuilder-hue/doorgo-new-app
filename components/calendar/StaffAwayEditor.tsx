'use client';
import{useEffect,useRef,useState}from'react';import type{ProductionBoardCard,StaffAwayRosterOption}from'@/lib/production-board/types';import{deleteStaffAway,saveStaffAway,loadStaffAwayCapacityDragMax,type StaffAwayMaximumResult}from'@/lib/calendar/staff-away-actions';import{datesInRange}from'@/lib/calendar/staff-away';

type Props={canEdit:boolean;card?:ProductionBoardCard|null;initialDate?:string;roster:StaffAwayRosterOption[];onClose:()=>void;onChanged:(dates:string[])=>void};
export function StaffAwayEditor({canEdit,card,initialDate,roster,onClose,onChanged}:Props){
  const savingRef=useRef(false);const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);
  const [staffId,setStaffId]=useState(card?.staffId??roster[0]?.staffId??'');const [startDate,setStartDate]=useState(card?.staffAwayStartDate??initialDate??'');
  const [endDate,setEndDate]=useState(card?.staffAwayEndDate??initialDate??'');const [mode,setMode]=useState<'full_day'|'partial'>(card?.staffAwayMode??'full_day');
  const [partialDrag,setPartialDrag]=useState(card?.partialDragHours?.toString()??'');const [reason,setReason]=useState(card?.details??'');
  const options=card?.staffId&&!roster.some((staff)=>staff.staffId===card.staffId)?[{staffId:card.staffId,displayName:card.customer??card.title},...roster]:roster;
  const [maximumResult,setMaximumResult]=useState<{key:string;result:StaffAwayMaximumResult}|null>(null);
  const [maximumRetry,setMaximumRetry]=useState(0);
  const maximumKey=JSON.stringify([staffId,startDate,endDate,mode,maximumRetry]);
  const maximumState=maximumResult?.key===maximumKey?maximumResult.result:null;
  const maximum=maximumState?.ok?maximumState.maximum:undefined;
  useEffect(()=>{
    if(!canEdit||mode!=='partial'||!staffId||!startDate)return;
    let active=true;
    void loadStaffAwayCapacityDragMax(staffId,startDate).then(result=>{if(active)setMaximumResult({key:maximumKey,result});}).catch(()=>{if(active)setMaximumResult({key:maximumKey,result:{ok:false,message:'Maximum unavailable.'}});});
    return()=>{active=false;};
  },[canEdit,mode,staffId,startDate,maximumKey]);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!canEdit||savingRef.current)return;if(!staffId||!options.some((staff)=>staff.staffId===staffId)){setError('Choose an active staff member.');return;}if(!startDate||!endDate){setError('Choose valid Staff Away dates.');return;}if(mode==='partial'&&(!Number.isFinite(Number(partialDrag))||Number(partialDrag)<=0)){setError('Enter Capacity Drag Hours greater than zero.');return;}savingRef.current=true;setSaving(true);setError(null);
    try{const result=await saveStaffAway({commandId:crypto.randomUUID(),periodId:card?.staffAwayPeriodId??null,expectedRevision:card?.revision??null,staffId,startDate,endDate:mode==='partial'?startDate:endDate,mode,partialDragHours:mode==='partial'?Number(partialDrag):null,reason});
      if(!result.ok){setError(result.message);return;}const oldDates=card?.staffAwayStartDate&&card.staffAwayEndDate?datesInRange(card.staffAwayStartDate,card.staffAwayEndDate):[];onChanged([...new Set([...oldDates,...datesInRange(result.startDate,result.endDate)])]);onClose();
    }catch(error){setError(error instanceof Error&&error.message.trim()?error.message:'Staff Away could not be saved. Please try again.');}finally{savingRef.current=false;setSaving(false);}};
  const remove=async()=>{if(!canEdit||!card?.staffAwayPeriodId||savingRef.current||!window.confirm('Delete this entire Staff Away period?'))return;savingRef.current=true;setSaving(true);setError(null);
    try{const result=await deleteStaffAway({commandId:crypto.randomUUID(),periodId:card.staffAwayPeriodId,expectedRevision:card.revision??0});if(!result.ok){setError(result.message);return;}onChanged(datesInRange(result.startDate,result.endDate));onClose();
    }catch{setError('Staff Away could not be deleted. Please try again.');}finally{savingRef.current=false;setSaving(false);}};
  return <div className="calendar-floating-backdrop"><form aria-label={card?'Staff Away details':'Add Staff Away'} className="calendar-quick-add calendar-staff-away-editor" onSubmit={submit}><header><strong>{card?'Staff Away period':'Add Staff Away'}</strong><button aria-label="Close Staff Away" onClick={onClose} type="button">×</button></header>
    <div className="calendar-quick-add-form"><label><span>Staff member</span><select autoFocus disabled={!canEdit||saving} onChange={(event)=>{setMaximumResult(null);setStaffId(event.target.value)}} required value={staffId}>{options.map((staff)=><option key={staff.staffId} value={staff.staffId}>{staff.displayName}</option>)}</select></label>
      <label><span>Start date</span><input disabled={!canEdit||saving} onChange={(event)=>{setMaximumResult(null);setStartDate(event.target.value);if(mode==='partial')setEndDate(event.target.value);}} required type="date" value={startDate}/></label>
      <label><span>End date</span><input disabled={!canEdit||saving||mode==='partial'} min={startDate} onChange={(event)=>{setMaximumResult(null);setEndDate(event.target.value)}} required type="date" value={mode==='partial'?startDate:endDate}/></label>
      <fieldset disabled={!canEdit||saving}><legend>Absence</legend><label><input checked={mode==='full_day'} name="awayMode" onChange={()=>{setMaximumResult(null);setMode('full_day')}} type="radio" value="full_day"/>Full Day</label><label><input checked={mode==='partial'} name="awayMode" onChange={()=>{setMaximumResult(null);setMode('partial');setEndDate(startDate);}} type="radio" value="partial"/>Partial</label></fieldset>
      {mode==='partial'?<label><span>Capacity Drag Hours</span><input disabled={!canEdit||saving} aria-describedby="staff-away-capacity-maximum" max={maximum} min="0" onChange={(event)=>setPartialDrag(event.target.value)} required step=".25" type="number" value={partialDrag}/></label>:null}
      {mode==='partial'&&canEdit?<small id="staff-away-capacity-maximum" aria-live="polite">
        {!staffId||!startDate?'Choose a staff member and date to see the maximum.':maximumState?.ok?`Maximum for ${options.find(staff=>staff.staffId===staffId)?.displayName??'selected staff'}: ${maximumState.maximum} ${maximumState.maximum===1?'hr':'hrs'}`:maximumState?<>{maximumState.message} <button type="button" onClick={()=>setMaximumRetry(value=>value+1)}>Retry maximum</button></>:'Loading maximum...'}
      </small>:null}
      <label><span>Reason / note</span><textarea disabled={!canEdit||saving} onChange={(event)=>setReason(event.target.value)} value={reason}/></label>
      {card?<small>Changes and deletion apply to the entire {card.staffAwayStartDate===card.staffAwayEndDate?'date':'date range'}.</small>:null}
      {error?<p aria-live="polite" role="alert">{error}</p>:null}<footer>{card&&canEdit?<button disabled={saving} onClick={()=>void remove()} type="button">Delete</button>:null}<button disabled={saving} onClick={onClose} type="button">{canEdit?'Cancel':'Close'}</button>{canEdit?<button aria-busy={saving||undefined} disabled={saving||!roster.length} type="submit">{saving?(card?'Saving…':'Adding…'):card?'Save Changes':'Add Staff Away'}</button>:null}</footer>
    </div>
  </form></div>;
}
