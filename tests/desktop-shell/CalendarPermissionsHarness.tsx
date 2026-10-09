import { useState } from 'react';
import { NoteActionPanel } from '@/components/calendar/NoteDetailsActions';
import { StaffAwayEditor } from '@/components/calendar/StaffAwayEditor';
import type { ProductionBoardCard } from '@/lib/production-board/types';
import { CalendarWorkspace } from '@/components/CalendarWorkspace';
import { normalizeProductionBoard } from '@/lib/production-board/normalize';
import { canMutateCalendar } from '@/lib/calendar/permissions';
import { resolveCurrentDoorGoAccess } from '@/lib/auth/access';
import { mergeCalendarItems } from '@/lib/calendar/calendar-items';

export function CalendarPermissionsHarness({ use = true, linked = false, mixed = false, legacy = false, kind = 'production', identity = false, identityFields }: { identityFields?: Partial<ProductionBoardCard>; identity?: boolean; use?: boolean; linked?: boolean; mixed?: boolean; legacy?: boolean; kind?: 'production'|'delivery'|'customer_pickup' }) {
  const access = resolveCurrentDoorGoAccess({ user: { id: 'staff' }, profile: { user_id: 'staff', display_name: 'Staff', active: true, is_manager: false, company_location: null, must_change_password: false }, permissionRows: [{ permission_key: 'calendar', access_level: use ? 'use' : 'view' }] });
  const board = normalizeProductionBoard([{ booking_id: 'production-test', job_id: linked ? 'DG-1' : null, title: 'Permission Test', production_date: '2026-10-06', shop_hours: legacy ? null : 2, salesperson: 'Staff', calendar_id: null, calendar_event_id: legacy ? 'old-google-event' : null, status: 'active', schedule_status: 'confirmed', booking_kind: 'production', board_visible: true, all_day: true, calendar_sync_state: 'native', source: 'DoorGo Calendar', source_system: legacy ? 'legacy' : 'doorgo_native', locked: false, completed_at: null, updated_at: '2026-10-06T10:00:00Z' }], [], [], { startDate: '2026-10-05', endDateExclusive: '2026-10-12', weeks: 1, today: '2026-10-06' });
  const production = board.days.flatMap(day => day.cards)[0];
  production.customer = 'Permission Test';
  if(identity)Object.assign(production,{customer:'Hamilton',title:'Hamilton',nativeSalesOrder:'1603345',shopHours:legacy?null:3.5,shopHoursKnown:!legacy});
  if(identityFields)Object.assign(production,identityFields);
  if(kind!=='production')Object.assign(production,{bookingId:'item:'+kind,recordKind:'calendar_item',calendarItemType:kind,bookingKind:kind,revision:1});
  if (linked) production.internalJobId = '11111111-1111-4111-8111-111111111111';
  const visibleBoard = mixed ? mergeCalendarItems(board, [{ ...production, bookingId: 'item:note-test', recordKind: 'calendar_item', calendarItemType: 'note', title: 'Operational Note', customer: 'Operational Note', dayOrder: 2048, revision: 1 }]) : board;
  return <div data-calendar-test-linked={String(linked)}><CalendarWorkspace board={visibleBoard} canAddBackorders={false} canUseCalendar={canMutateCalendar(access)} canManageSettings={false} canOpenJobs={identity && linked} currentMonday="2026-10-05" defaultSalesperson="Staff" initialTargetMonday="2026-10-05" preferenceOwner="permission-test" today="2026-10-06"/></div>;
}

export function ExistingCalendarEditHarness({away=false}:{away?:boolean}) {
 const [open,setOpen]=useState(true);const [dates,setDates]=useState<string[]>([]);
 const card={bookingId:'item:test',title:'Note',customer:'Staff',details:'Original',productionDate:'2026-10-06',salesperson:'Staff',revision:1,staffId:'staff-1',staffAwayPeriodId:'period-1',staffAwayStartDate:'2026-10-06',staffAwayEndDate:'2026-10-08',staffAwayMode:'full_day'} as ProductionBoardCard;
 return <div>{open?(away?<StaffAwayEditor canEdit card={card} roster={[{staffId:'staff-1',displayName:'Staff'},{staffId:'staff-2',displayName:'Other Staff'}]} onChanged={setDates} onClose={()=>setOpen(false)}/>:<NoteActionPanel canUseCalendar card={card} mode="edit" boardStart="2026-10-05" weeks={1} today="2026-10-06" roster={[]} onSaved={()=>{}} onConverted={()=>{}} onClose={()=>setOpen(false)}/>):<p>Saved</p>}<output aria-label="Refreshed dates">{dates.join(',')}</output></div>;
}
