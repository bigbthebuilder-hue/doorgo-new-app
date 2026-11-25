import {expect,test} from '@playwright/experimental-ct-react';
import {NoteActionPanel} from '@/components/calendar/NoteDetailsActions';
import type {ProductionBoardCard} from '@/lib/production-board/types';
import {JobsWorkspace} from '@/components/jobs/JobsWorkspace';
import type {NativeJobListItem} from '@/lib/jobs/job-intake-types';
import {CalendarStabilityHarness} from './CalendarStabilityHarness';
import type {SearchGlobal} from './search-actions-shim';
import type {Page} from 'playwright/test';
const count = (page:Page, kind:'calendar'|'jobs') => page.evaluate(kind => (globalThis as SearchGlobal).searchFixture?.[kind].length ?? 0,kind);
const calendarReply = (page:Page, index:number, customer:string, date='2026-11-10') => page.evaluate(({index,customer,date}) => {
  (globalThis as SearchGlobal).searchFixture.calendar[index].resolve({ok:true,targets:[{bookingId:customer,customer,jobId:'123',productionDate:date,calendarItemType:'production'}]});
},{index,customer,date});
const jobReply = (page:Page,index:number) => page.evaluate(index => (globalThis as SearchGlobal).searchFixture.jobs[index].resolve({ok:true,options:[{internalJobId:'22222222-2222-4222-8222-222222222222',customer:'Linked customer',salesOrder:'7654321',doorGoReference:'DG-1',salesperson:'Staff',fulfillmentPlan:null,revision:1}]}),index);

test.use({hasTouch:true});

test.beforeEach(async({page})=>{
  await page.setViewportSize({width:1600,height:900});
  await page.route('**/api/calendar/window?*',route=>route.fulfill({status:503,body:'{}'}));
});
for(const width of [390,1600])test(`immediate cards stay mounted and selectable during background work at ${width}`,async({mount,page})=>{
  await page.setViewportSize({width,height:900});const component=await mount(<CalendarStabilityHarness/>);
  const input=component.getByRole('combobox',{name:'Search by name or sales order'});
  await input.fill('Original');const result=component.getByRole('option',{name:/Original shared job/});
  await expect(result).toBeVisible();await result.evaluate(node=>node.setAttribute('data-retained-node','yes'));
  await expect.poll(()=>count(page,'calendar')).toBe(1);
  await expect(result).toHaveAttribute('data-retained-node','yes');
  await expect(component.getByText('Searching…',{exact:true})).toHaveCount(0);
  if(width===390)await result.tap();else{await input.press('ArrowDown');await input.press('Enter');}
  await expect(component.getByRole('listbox')).toHaveCount(0);
  await expect(component.locator('[data-booking-id="shared-booking"]')).toHaveAttribute('data-highlighted','true');
  await calendarReply(page,0,'Original remote');await expect(component.getByRole('listbox')).toHaveCount(0);
});
test('current-query results win over late responses and clearing never reopens results',async({mount,page})=>{
  const component=await mount(<CalendarStabilityHarness/>);const input=component.getByRole('combobox');
  await input.fill('Old');await expect.poll(()=>count(page,'calendar')).toBe(1);
  await input.fill('New');await expect.poll(()=>count(page,'calendar')).toBe(2);
  await expect(component.getByText('No Calendar matches.')).toHaveCount(0);
  await calendarReply(page,1,'New customer');await expect(component.getByRole('option')).toContainText('New customer');
  await calendarReply(page,0,'Old customer');await expect(component.getByRole('option')).toContainText('New customer');
  await input.fill('Newest');await expect.poll(()=>count(page,'calendar')).toBe(3);await input.clear();
  await calendarReply(page,2,'Newest customer');await input.focus();await expect(component.getByRole('listbox')).toHaveCount(0);
});
test('remote results filter immediately on refinement and deletion, without dropdown rebuilds',async({mount,page})=>{
  const component=await mount(<CalendarStabilityHarness/>);const input=component.getByRole('combobox');
  await input.fill('Link');await expect.poll(()=>count(page,'calendar')).toBe(1);await calendarReply(page,0,'Linked customer');
  const result=component.getByRole('option');await expect(result).toBeVisible();await result.evaluate(node=>node.setAttribute('data-retained-node','yes'));
  await input.fill('Linked');await expect(result).toHaveAttribute('data-retained-node','yes');await expect.poll(()=>count(page,'calendar')).toBe(2);
  await expect(result).toHaveAttribute('data-retained-node','yes');
  await input.fill('Li');await expect.poll(()=>count(page,'calendar')).toBe(3);await expect(result).toBeVisible();
  await calendarReply(page,1,'Linked stale');await expect(result).toContainText('Linked customer');
  await calendarReply(page,2,'Linked customer');await expect(result).toHaveAttribute('data-retained-node','yes');
  await input.fill('Other');await expect(component.getByRole('option')).toHaveCount(0);await expect(component.getByText('Searching…',{exact:true})).toBeVisible();
});
test('debouncing and delayed empty responses never report no results prematurely',async({mount,page})=>{
  const component=await mount(<CalendarStabilityHarness/>);const input=component.getByRole('combobox');
  await input.pressSequentially('Nothing',{delay:10});await expect(component.getByText('Searching…',{exact:true})).toBeVisible();
  await expect(component.getByText('No Calendar matches.')).toHaveCount(0);await expect.poll(()=>count(page,'calendar')).toBe(1);
  await page.evaluate(()=>(globalThis as SearchGlobal).searchFixture.calendar[0].resolve({ok:true,targets:[]}));
  await expect(component.getByText('No Calendar matches.')).toBeVisible();
  await input.fill('Nothing ');await expect.poll(()=>count(page,'calendar')).toBe(2);
  await page.evaluate(()=>(globalThis as SearchGlobal).searchFixture.calendar[1].resolve({ok:false}));
  await expect(component.getByText('Calendar search could not complete. Please try again.')).toBeVisible();
  await expect(component.getByText('No Calendar matches.')).toHaveCount(0);
});
for(const date of ['2026-02-02','2027-02-01'])test(`remote selection intentionally navigates to ${date}`,async({mount,page})=>{
  const component=await mount(<CalendarStabilityHarness/>);await component.getByRole('combobox').fill('Distant');
  await expect.poll(()=>count(page,'calendar')).toBe(1);await calendarReply(page,0,'Distant customer',date);
  await component.getByRole('option').click();await expect(component.getByRole('listbox')).toHaveCount(0);
  await expect.poll(()=>component.locator('.calendar-stream').evaluate(stream=>[...stream.querySelectorAll<HTMLElement>('[data-calendar-week]')].find(week=>week.getBoundingClientRect().bottom>stream.getBoundingClientRect().top+8)?.dataset.calendarWeek)).toBe(date);
});
for(const width of [390,1600])test(`Quick Add retains matches while refreshing and cancels after selection at ${width}`,async({mount,page})=>{
  await page.setViewportSize({width,height:900});const component=await mount(<CalendarStabilityHarness/>);
  await component.locator('[data-calendar-date="2026-11-10"]').getByRole('button',{name:/Add/}).click();
  await component.locator('.calendar-quick-add').getByRole('button',{name:'Production',exact:true}).click();
  const input=component.getByRole('combobox',{name:/Find job/});await input.fill('Link');
  await expect(component.getByText('No matching DoorGo jobs.')).toHaveCount(0);await expect.poll(()=>count(page,'jobs')).toBe(1);await jobReply(page,0);
  const result=component.getByRole('option');await expect(result).toContainText('Linked customer');
  await input.fill('Linked');await expect.poll(()=>count(page,'jobs')).toBe(2);await expect(result).toBeVisible();
  await expect(component.getByText('Searching DoorGo Jobs…')).toHaveCount(0);
  if(width===390)await result.tap();else await input.press('Enter');await expect(input).toHaveValue('Linked customer · 7654321');await jobReply(page,1);
  await expect(component.locator('#calendar-quick-add-job-results')).toHaveCount(0);
  await input.fill('Other');await expect.poll(()=>count(page,'jobs')).toBe(3);await input.clear();await jobReply(page,2);
  await expect(component.locator('#calendar-quick-add-job-results')).toHaveCount(0);
});
test('Quick Add rejects late queries and reports errors rather than false no-results',async({mount,page})=>{
  const component=await mount(<CalendarStabilityHarness/>);
  await component.locator('[data-calendar-date="2026-11-10"]').getByRole('button',{name:/Add/}).click();
  await component.locator('.calendar-quick-add').getByRole('button',{name:'Production',exact:true}).click();
  const input=component.getByRole('combobox',{name:/Find job/});
  await input.fill('Old');await expect.poll(()=>count(page,'jobs')).toBe(1);
  await input.fill('Link');await expect.poll(()=>count(page,'jobs')).toBe(2);await jobReply(page,1);
  await page.evaluate(()=>(globalThis as SearchGlobal).searchFixture.jobs[0].resolve({ok:true,options:[]}));
  await expect(component.getByRole('option')).toContainText('Linked customer');
  await input.fill('Linked');await expect.poll(()=>count(page,'jobs')).toBe(3);
  await page.evaluate(()=>(globalThis as SearchGlobal).searchFixture.jobs[2].resolve({ok:false,message:'Search unavailable'}));
  await expect(component.getByRole('alert')).toContainText('Search unavailable');
  await expect(component.getByRole('option')).toContainText('Linked customer');
  await expect(component.getByText('No matching DoorGo jobs.')).toHaveCount(0);
});

test('Jobs filtering stays immediate across customer, identifier and clearing',async({mount,page})=>{
  const jobs=[{internalJobId:'11111111-1111-4111-8111-111111111111',doorGoReference:'DG-1',bizTrackSalesOrder:'12345',customer:'Linked customer',siteAddress:'Future site',salesperson:'Other',lifecycleStage:'Draft',isComplete:false,activeLineCount:1,archivedLineCount:0,updatedAt:'2026-11-23T00:00:00Z'}] as NativeJobListItem[];
  const component=await mount(<JobsWorkspace jobs={jobs} navigation={[]} canCreate={false}/>);
  const input=component.getByRole('searchbox',{name:'Filter jobs'});
  await input.fill('Linked');await expect(component.locator('article')).toHaveCount(1);
  await input.fill('Unknown');await expect(component.locator('article')).toHaveCount(0);
  await input.fill('123');await expect(component.locator('article')).toHaveCount(1);
  await input.clear();await expect(component.locator('article')).toHaveCount(1);
  expect(await count(page,'jobs')).toBe(0);
});

test('Note linked-job search keeps options during refinement and cannot reopen after selection',async({mount,page})=>{
  const card={bookingId:'item:note',title:'Test note',productionDate:'2026-11-10',recordKind:'calendar_item',calendarItemType:'note',revision:1} as ProductionBoardCard;
  const component=await mount(<NoteActionPanel mode="edit" card={card} boardStart="2026-11-09" weeks={13} today="2026-11-11" canUseCalendar roster={[]} onClose={()=>{}} onSaved={()=>{}} onConverted={()=>{}}/>);
  const input=component.getByRole('textbox',{name:'Linked job (optional)'});
  await input.fill('Link');await expect.poll(()=>count(page,'jobs')).toBe(1);await jobReply(page,0);
  await input.fill('Linked');await expect.poll(()=>count(page,'jobs')).toBe(2);await expect(component.getByRole('option')).toBeVisible();
  await component.getByRole('option').click();await jobReply(page,1);await expect(component.getByRole('listbox')).toHaveCount(0);
  await input.fill('Clear');await expect.poll(()=>count(page,'jobs')).toBe(3);await input.clear();await jobReply(page,2);await expect(component.getByRole('listbox')).toHaveCount(0);
});

test('changing Quick Add eligibility cannot reuse results from the previous item type',async({mount,page})=>{
  const component=await mount(<CalendarStabilityHarness/>);
  await component.locator('[data-calendar-date="2026-11-10"]').getByRole('button',{name:/Add/}).click();
  const panel=component.locator('.calendar-quick-add');await panel.getByRole('button',{name:'Production',exact:true}).click();
  await panel.getByRole('combobox').fill('Link');await expect.poll(()=>count(page,'jobs')).toBe(1);
  await panel.getByRole('button',{name:'Back',exact:true}).click();await panel.getByRole('button',{name:'Delivery',exact:true}).click();
  await expect.poll(()=>count(page,'jobs')).toBe(2);await jobReply(page,0);await expect(panel.getByRole('option')).toHaveCount(0);
  expect(await page.evaluate(()=>(globalThis as SearchGlobal).searchFixture.jobs.map(request=>request.itemType))).toEqual(['production','delivery']);
  await jobReply(page,1);await expect(panel.getByRole('option')).toContainText('Linked customer');
});
