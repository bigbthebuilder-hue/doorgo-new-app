export async function loadCalendarWindow() { return { ok: false }; }
export async function reloadCalendarProductionDays() { return { ok: false }; }
export async function searchCalendarLinkableJobs() { return { ok: true, options: [{internalJobId:'22222222-2222-4222-8222-222222222222',customer:'Linked customer',salesOrder:'7654321',salesperson:'Other Staff',revision:1}] }; }
export async function searchScheduledCalendar() { return { ok: true, targets: [] }; }
export async function completeCalendarProductionBooking() { return { ok: true, event: { resultingCompletedAt: '2026-10-06T20:00:00Z' } }; }
export async function reopenCalendarProductionBooking() { return { ok: true, event: { resultingCompletedAt: null } }; }
export async function deleteCalendarProductionBooking() { return { ok: true, data: {} }; }
export async function placeCalendarProductionBooking() { return { ok: true, move: {} }; }
export async function createCalendarItem(input: { name: string; scheduledDate: string | null }) { return { ok: true, data: {}, card: { bookingId: 'created-production', title: input.name, customer: input.name, productionDate: input.scheduledDate, recordKind: 'production', bookingKind: 'production', salesperson: 'Staff', completedAt: null, locked: false, shopHours: 2, shopHoursKnown: true, dayOrder: 4096 } }; }
export async function deleteCalendarItem() { return { ok: true, data: {} }; }
export async function moveCalendarItem() { return { ok: true, data: {} }; }
export async function reorderCalendarItems() { return { ok: true, data: {} }; }
export async function setCalendarItemCompletion() { return { ok: true, data: {} }; }
export async function updateCalendarNote(input:Record<string,unknown>) { document.documentElement.setAttribute('data-note-save',JSON.stringify(input));return { ok: true, data: {} }; }
export async function convertCalendarNote() { return { ok: true, data: {} }; }
export async function saveStaffAway(input:Record<string,unknown>) { document.documentElement.setAttribute('data-away-save',JSON.stringify(input));return { ok: true,startDate:input.startDate,endDate:input.endDate }; }
export async function deleteStaffAway() { return { ok: true }; }
export async function deleteFulfillmentBackorder() { return { ok: true, data: {} }; }
export async function setFulfillmentItemType() { return { ok: true, data: {} }; }
export async function createFulfillmentBackorder() { return { ok: true, data: {} }; }
export async function listFulfillmentFamilyOrders() { return { ok: true, orders: [] }; }
export async function loadJobFulfillmentFamily() { return { ok: true, familyKey: null, orders: [] }; }
export async function addBackorder() { return { ok: true, data: {} }; }
export async function loadNextBackorderSalesOrder() { return { ok: true, salesOrder: '1001' }; }

export async function loadCalendarEdit(key:string) { return {ok:true,snapshot:{key,kind:key.startsWith('item:')?key.slice(5):'production',linkedJobId:document.querySelector('[data-calendar-test-linked="true"]')?'11111111-1111-4111-8111-111111111111':null,jobRevision:1,revision:1,name:'Permission Test',salesOrder:'',salesperson:'Staff',shopHours:2,date:'2026-10-06',updatedAt:'2026-10-06T10:00:00Z',identityReadOnly:false,completed:false}}; }
export async function saveCalendarEdit(expected:Record<string,unknown>,values:Record<string,unknown>) { document.dispatchEvent(new CustomEvent('calendar-edit-save',{detail:{expected,values}})); return {ok:true,snapshot:{...expected,...values}}; }

// Deterministic RPC fixture values, not a capacity calculation.
export async function loadStaffAwayCapacityDragMax(staffId:string,date:string) {
 const delay=Number(document.documentElement.getAttribute('data-maximum-delay')??'0');
 const unavailable=document.documentElement.hasAttribute('data-maximum-unavailable');
 const maximum=staffId==='staff-2'?1:date==='2026-10-07'?3:5;
 await new Promise(resolve=>setTimeout(resolve,delay));
 return unavailable?{ok:false,message:'Maximum unavailable.'}:{ok:true,maximum};
}
