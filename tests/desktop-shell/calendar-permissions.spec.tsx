import { expect, test } from '@playwright/experimental-ct-react';
import { CalendarPermissionsHarness, ExistingCalendarEditHarness } from './CalendarPermissionsHarness';

for (const scenario of [
  {name:'opaque title',customer:null,title:"2.25 Hamilton Bro's 1254815",hours:2.25,so:'1254815',expected:"2.25 Hamilton Bro's 1254815"},
  {name:'structured',customer:"Hamilton Bro's",title:'Opaque old title',hours:2.25,so:'1254815',expected:"2.25 · Hamilton Bro's · 1254815"},
  {name:'numeric customer',customer:'5 Star Construction',title:'Old title',hours:5,so:'1108850',expected:'5 · 5 Star Construction · 1108850'},
  {name:'missing hours',customer:"Hamilton Bro's",title:'Old title',hours:null,so:'1254815',expected:"Hamilton Bro's · 1254815"},
  {name:'missing SO',customer:"Hamilton Bro's",title:'Old title',hours:2.25,so:null,expected:"2.25 · Hamilton Bro's"},
]) test(`Production identity remains intact: ${scenario.name}`,async({mount,page})=>{
  await page.setViewportSize({width:1600,height:1000});
  const component=await mount(<CalendarPermissionsHarness identityFields={{customer:scenario.customer,title:scenario.title,shopHours:scenario.hours,shopHoursKnown:scenario.hours!==null,nativeSalesOrder:scenario.so,jobId:scenario.so}}/>);
  const card=component.locator('[data-booking-id="production-test"]').first();
  await expect(card.locator('.calendar-production-card-text')).toHaveText(scenario.expected);
  await card.click();
  await expect(card.locator('.calendar-expanded-info strong')).toHaveText(scenario.expected);
  await card.getByRole('button',{name:'Complete',exact:true}).click();
  await expect(card).toHaveAttribute('data-completed','true');
  await expect(card.locator('.calendar-expanded-info strong')).toHaveText(scenario.expected);
});

test('move activity clears then delete uses its own label; missing SO stays clean', async ({ mount, page }) => {
  await page.setViewportSize({width:1600,height:1000});
  const component=await mount(<CalendarPermissionsHarness/>);
  let card=component.locator('[data-booking-id="production-test"]').first();
  await expect(card).toContainText('2 · Permission Test');
  await page.clock.install();
  await page.evaluate(()=>document.documentElement.setAttribute('data-defer-calendar','true'));
  const dataTransfer=await page.evaluateHandle(()=>new DataTransfer());
  await card.dispatchEvent('dragstart',{dataTransfer});
  const destination=component.locator('[data-calendar-date="2026-10-07"]');
  await destination.dispatchEvent('drop',{dataTransfer});
  await page.clock.runFor(300);
  await expect(page.locator('.calendar-activity')).toHaveText('Updating calendar…');
  await page.evaluate(()=>document.dispatchEvent(new Event('release-calendar')));
  await expect(page.locator('.calendar-activity')).toHaveCount(0);
  card=destination.locator('[data-booking-id="production-test"]');
  await card.dispatchEvent('dragend',{dataTransfer});
  await page.clock.runFor(300);
  await card.click();
  await expect(card.locator('strong')).toHaveText('2 · Permission Test');
  await card.getByRole('button',{name:'More details for Permission Test'}).click();
  page.once('dialog',dialog=>dialog.accept());
  await component.locator('.calendar-detail-panel').getByRole('button',{name:'Delete',exact:true}).click();
  await page.clock.runFor(300);
  await expect(page.locator('.calendar-activity')).toHaveText('Deleting…');
  await page.evaluate(()=>document.dispatchEvent(new Event('release-calendar')));
  await expect(page.locator('.calendar-activity')).toHaveCount(0);
  await expect(card).toHaveCount(0);
});

for (const linked of [false, true]) test(`expanded identity and real completion activity linked=${linked}`, async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<CalendarPermissionsHarness linked={linked} identity/>);
  const card = component.locator('[data-booking-id="production-test"]').first();
  await expect(card).toContainText('3.5 · Hamilton · 1603345');
  await expect(page.locator('.calendar-activity')).toHaveCount(0);
  await card.click();
  await expect(card.locator('strong')).toHaveText('3.5 · Hamilton · 1603345');
  await expect(card.locator('strong')).toHaveCSS('white-space', 'normal');
  if (linked) await expect(card.getByRole('link', {name:'Open Job'})).toHaveAttribute('href', /\/jobs\/11111111-1111-4111-8111-111111111111/);
  await page.clock.install();
  await page.evaluate(()=>document.documentElement.setAttribute('data-defer-calendar','true'));
  await card.getByRole('button',{name:'Complete',exact:true}).click();
  await page.clock.runFor(200);
  await expect(page.locator('.calendar-activity')).toHaveCount(0);
  await page.clock.runFor(100);
  await expect(page.locator('.calendar-activity')).toHaveText('Updating calendar…');
  await page.evaluate(()=>document.dispatchEvent(new Event('release-calendar')));
  await expect(page.locator('.calendar-activity')).toHaveCount(0);
  await expect(card.getByRole('button',{name:'Reopen',exact:true})).toBeVisible();
  await expect(card.locator('strong')).toHaveText('3.5 · Hamilton · 1603345');
  await page.evaluate(()=>document.documentElement.removeAttribute('data-defer-calendar'));
  await card.getByRole('button',{name:'Reopen',exact:true}).click();
  await page.clock.runFor(300);
  await expect(page.locator('.calendar-activity')).toHaveCount(0);
  await expect(card.locator('strong')).toHaveText('3.5 · Hamilton · 1603345');
});

test('missing hours are omitted and edit failure clears real activity', async ({ mount, page }) => {
  await page.setViewportSize({ width:1600,height:1000 });
  const component = await mount(<CalendarPermissionsHarness identity legacy/>);
  const card = component.locator('[data-booking-id="production-test"]').first();
  await expect(card).toContainText('Hamilton · 1603345');
  await card.click();
  await expect(card.locator('strong')).toHaveText('Hamilton · 1603345');
  await card.getByRole('button',{name:'More details for Hamilton'}).click();
  await component.locator('.calendar-detail-panel').getByRole('button',{name:'Edit',exact:true}).click();
  await expect(component.getByRole('button',{name:'Save',exact:true})).toBeEnabled();
  await page.clock.install();
  await page.evaluate(()=>{document.documentElement.setAttribute('data-defer-calendar','true');document.documentElement.setAttribute('data-fail-calendar','true');});
  await component.getByRole('button',{name:'Save',exact:true}).click();
  await page.clock.runFor(300);
  await expect(page.locator('.calendar-activity')).toHaveText('Saving…');
  await page.evaluate(()=>document.dispatchEvent(new Event('release-calendar')));
  await expect(page.locator('.calendar-activity')).toHaveCount(0);
  await expect(component.getByRole('alert')).toHaveText('Test save failed');
});

test('Calendar view renders without lifecycle or Manager controls', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<CalendarPermissionsHarness use={false}/>);
  const card = component.locator('[data-booking-id="production-test"]').first();
  await expect(card).not.toHaveAttribute('draggable', 'true');
  await card.click();
  await component.getByRole('button', { name: 'More details for Permission Test', exact: true }).click();
  const panel = component.locator('.calendar-detail-panel');
  await expect(panel.getByRole('button', { name: /^(Edit|Delete|Complete|Reopen)$/ })).toHaveCount(0);
  await expect(component.getByRole('button', { name: 'Production date', exact: true })).toHaveCount(0);
  await expect(component.getByRole('link', { name: 'Edit in Manager' })).toHaveCount(0);
  for (const button of await component.getByRole('button', { name: '+ Add', exact: true }).all()) await expect(button).toBeDisabled();
});

for (const linked of [false, true]) test(`Calendar use only: ${linked ? 'linked' : 'unlinked'} Production edit, complete, reopen, delete`, async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<CalendarPermissionsHarness linked={linked}/>);
  const card = component.locator('[data-booking-id="production-test"]').first();
  await expect(card).toHaveAttribute('draggable', 'true');
  await card.click();
  const details = component.getByRole('button', { name: 'More details for Permission Test', exact: true });
  await details.click();
  let panel = component.locator('.calendar-detail-panel');
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(component.getByRole('form', { name: 'Edit Production schedule' })).toBeVisible();
  await component.getByRole('button', { name: 'Cancel', exact: true }).click();
  await details.click();
  panel = component.locator('.calendar-detail-panel');
  await panel.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(card).not.toHaveAttribute('draggable', 'true');
  await panel.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await expect(card).toHaveAttribute('draggable', 'true');
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(component.locator('[data-booking-id="production-test"]')).toHaveCount(0);
});

test('Calendar use only creates Production and moves/reorders a mixed day', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<CalendarPermissionsHarness mixed/>);
  const sourceDay = component.locator('[data-calendar-date="2026-10-06"]');
  await sourceDay.getByRole('button', { name: '+ Add', exact: true }).click();
  await component.getByRole('button', { name: 'Production', exact: true }).click();
  await component.getByLabel('Name *', { exact: true }).fill('New Production');
  await component.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sourceDay.locator('[data-booking-id="created-production"]')).toBeVisible();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const production = sourceDay.locator('[data-booking-id="production-test"]');
  await production.dispatchEvent('dragstart', { dataTransfer });
  await sourceDay.dispatchEvent('dragover', { dataTransfer, clientY: 10000 });
  await sourceDay.dispatchEvent('drop', { dataTransfer, clientY: 10000 });
  await production.dispatchEvent('dragend', { dataTransfer });
  await expect(sourceDay.locator('[data-booking-id]').last()).toHaveAttribute('data-booking-id', 'production-test');
  const destination = component.locator('[data-calendar-date="2026-10-07"]');
  await production.dispatchEvent('dragstart', { dataTransfer });
  await destination.dispatchEvent('dragover', { dataTransfer });
  await destination.dispatchEvent('drop', { dataTransfer });
  await expect(destination.locator('[data-booking-id="production-test"]')).toBeVisible();
  await destination.locator('[data-booking-id="production-test"]').dispatchEvent('dragend', { dataTransfer });
  const attention = component.locator('.calendar-needs-attention-toolbar');
  await destination.locator('[data-booking-id="production-test"]').dispatchEvent('dragstart', { dataTransfer });
  await attention.dispatchEvent('drop', { dataTransfer });
  await expect(destination.locator('[data-booking-id="production-test"]')).toHaveCount(0);
  await expect(component.getByRole('button', { name: 'Needs Attention · 1', exact: true })).toBeVisible();
});

for (const legacy of [false, true]) for (const linked of [false, true]) test(`Calendar manual movement: legacy=${legacy}, linked=${linked}`, async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<CalendarPermissionsHarness legacy={legacy} linked={linked}/>);
  const card = component.locator('[data-booking-id="production-test"]').first();
  await expect(card).toHaveAttribute('draggable', 'true');
  await card.click();
  await component.getByRole('button', { name: 'More details for Permission Test', exact: true }).click();
  await component.locator('.calendar-detail-panel').getByRole('button', { name: 'Edit', exact: true }).click();
  const dateControl = component.getByRole('button', { name: 'Production date', exact: true });
  await expect(dateControl).toBeEnabled();
  await expect(dateControl).toHaveCSS('border-top-style', 'solid');
  await expect(dateControl).toHaveCSS('cursor', 'pointer');
  await dateControl.click();
  await component.getByRole('dialog', { name: 'Production date calendar' }).getByRole('button', { name: '7', exact: true }).first().click();
  await component.getByLabel('Name *', {exact:true}).fill('Edited Production');
  await component.getByLabel('Sales Order', {exact:true}).fill('1234567');
  await component.getByLabel('Salesperson *', {exact:true}).fill('Scheduler');
  await component.getByLabel('Shop Hours', {exact:true}).fill('');
  await page.evaluate(()=>document.addEventListener('calendar-edit-save',event=>document.documentElement.setAttribute('data-calendar-save',JSON.stringify((event as CustomEvent).detail)),{once:true}));
  await component.getByRole('button', { name: 'Save', exact: true }).click();
  const saved=JSON.parse((await page.locator('html').getAttribute('data-calendar-save'))!);
  expect(saved.values).toMatchObject({name:'Edited Production',salesOrder:'1234567',salesperson:'Scheduler',shopHours:null,date:'2026-10-07'});
  await expect(component.getByRole('form', { name: 'Edit Production schedule' })).toHaveCount(0);
  const day = component.locator('[data-calendar-date="2026-10-07"]');
  await expect(day.locator('[data-booking-id="production-test"]')).toBeVisible();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await day.locator('[data-booking-id="production-test"]').dispatchEvent('dragstart', { dataTransfer: transfer });
  const destination = component.locator('[data-calendar-date="2026-10-08"]');
  await destination.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(destination.locator('[data-booking-id="production-test"]')).toBeVisible();
  await expect(component.getByText('Reopen this Calendar item before moving it.', { exact: true })).toHaveCount(0);
});

for(const kind of ['delivery','customer_pickup'] as const) for(const linked of [false,true]) test(`Full ${kind} edit, linked=${linked}`,async({mount,page})=>{
 await page.setViewportSize({width:1600,height:1000});
 const component=await mount(<CalendarPermissionsHarness kind={kind} linked={linked}/>);
 await component.locator('[data-booking-id="item:'+kind+'"]').first().click();
 await component.getByRole('button',{name:'More details for Permission Test',exact:true}).click();
 await component.locator('.calendar-detail-panel').getByRole('button',{name:'Edit',exact:true}).click();
 await component.getByLabel('Name *',{exact:true}).fill('Edited fulfillment');
 await component.getByLabel('Sales Order',{exact:true}).fill('9876543');
 await component.getByLabel('Salesperson',{exact:true}).fill('Staff Two');
 await component.getByLabel('Timing',{exact:true}).fill('After lunch');
 await component.getByLabel('Fulfillment note',{exact:true}).fill('Call on arrival');
 await expect(component.getByLabel(/Address|Phone|Contact/)).toHaveCount(0);
 await page.evaluate(()=>document.addEventListener('calendar-edit-save',event=>document.documentElement.setAttribute('data-calendar-save',JSON.stringify((event as CustomEvent).detail)),{once:true}));
 await component.getByRole('button',{name:'Save',exact:true}).click();
 await expect(component.getByRole('form',{name:/Edit .* schedule/})).toHaveCount(0);
 const saved=JSON.parse((await page.locator('html').getAttribute('data-calendar-save'))!);
 expect(saved.values).toMatchObject({name:'Edited fulfillment',salesOrder:'9876543',salesperson:'Staff Two',timing:'After lunch',fulfillmentNote:'Call on arrival'});
 expect(Boolean(saved.expected.linkedJobId)).toBe(linked);
});

test('Existing Note full edit uses Calendar action',async({mount,page})=>{
 const component=await mount(<ExistingCalendarEditHarness/>);
 await component.getByLabel('Title *',{exact:true}).fill('Edited Note');
 await page.getByRole('textbox',{name:'Details',exact:true}).fill('New details');
 await page.getByRole('textbox',{name:'Salesperson (optional)',exact:true}).fill('Other Staff');
 await page.getByRole('textbox',{name:'Linked job (optional)',exact:true}).fill('Linked');
 await component.getByRole('option').click();
 await component.getByRole('button',{name:'Note date',exact:true}).click();
 await component.getByRole('button',{name:'Clear',exact:true}).click();
 await component.getByRole('button',{name:'Save',exact:true}).click();
 const saved=JSON.parse((await page.locator('html').getAttribute('data-note-save'))!);
 expect(saved).toMatchObject({title:'Edited Note',details:'New details',salesperson:'Other Staff',scheduledDate:null,linkedInternalJobId:'22222222-2222-4222-8222-222222222222'});
});
test('Staff Away edits one whole period with existing fields',async({mount,page})=>{
 const component=await mount(<ExistingCalendarEditHarness away/>);
 await page.getByRole('combobox',{name:'Staff member',exact:true}).selectOption('staff-2');
 await page.locator('input[type=date]').nth(0).fill('2026-10-07');
 await page.locator('input[type=date]').nth(1).fill('2026-10-09');
 await page.getByRole('textbox',{name:'Reason / note',exact:true}).fill('Updated absence');
 await component.getByRole('button',{name:'Save Changes',exact:true}).click();
 const saved=JSON.parse((await page.locator('html').getAttribute('data-away-save'))!);
 expect(saved).toMatchObject({periodId:'period-1',expectedRevision:1,staffId:'staff-2',startDate:'2026-10-07',endDate:'2026-10-09',mode:'full_day',reason:'Updated absence'});
 await expect(component.getByLabel('Refreshed dates')).toHaveText('2026-10-06,2026-10-07,2026-10-08,2026-10-09');
});

test('Staff Away partial edit retains the capacity-drag-hours model',async({mount,page})=>{
 await mount(<ExistingCalendarEditHarness away/>);
 await page.getByRole('radio',{name:'Partial',exact:true}).check();
 await page.getByRole('spinbutton',{name:'Capacity Drag Hours',exact:true}).fill('2.5');
 await expect(page.locator('input[type=time]')).toHaveCount(0);
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 const saved=JSON.parse((await page.locator('html').getAttribute('data-away-save'))!);
 expect(saved).toMatchObject({periodId:'period-1',mode:'partial',partialDragHours:2.5,startDate:'2026-10-06',endDate:'2026-10-06'});
});

test('Staff Away maximum follows staff/date and never displays a stale response',async({mount,page})=>{
 await mount(<ExistingCalendarEditHarness away/>);
 await expect(page.locator('#staff-away-capacity-maximum')).toHaveCount(0);
 await page.getByRole('radio',{name:'Partial',exact:true}).check();
 const hours=page.getByRole('spinbutton',{name:'Capacity Drag Hours',exact:true});
 const guidance=page.locator('#staff-away-capacity-maximum');
 await expect(guidance).toHaveText('Maximum for Staff: 5 hrs');
 await expect(hours).toHaveAttribute('max','5');
 await hours.fill('4');
 expect(await hours.evaluate(input=>(input as HTMLInputElement).checkValidity())).toBe(true);
 await hours.fill('5');
 expect(await hours.evaluate(input=>(input as HTMLInputElement).checkValidity())).toBe(true);
 await hours.fill('6');
 expect(await hours.evaluate(input=>(input as HTMLInputElement).checkValidity())).toBe(false);
 await page.evaluate(()=>document.documentElement.setAttribute('data-maximum-delay','500'));
 await page.getByRole('combobox',{name:'Staff member',exact:true}).selectOption('staff-2');
 await expect(guidance).toHaveText('Loading maximum...');
 await expect(hours).not.toHaveAttribute('max');
 await expect(hours).toHaveValue('6');
 await expect(guidance).toHaveText('Maximum for Other Staff: 1 hr');
 await expect(hours).toHaveAttribute('max','1');
 await page.locator('input[type=date]').nth(0).fill('2026-10-07');
 await expect(guidance).toHaveText('Loading maximum...');
 await page.evaluate(()=>document.documentElement.setAttribute('data-maximum-delay','0'));
 await page.getByRole('combobox',{name:'Staff member',exact:true}).selectOption('staff-1');
 await expect(guidance).toHaveText('Maximum for Staff: 3 hrs');
 await page.waitForTimeout(600); // Let the obsolete staff/date request finish.
 await expect(guidance).toHaveText('Maximum for Staff: 3 hrs');
 await expect(hours).toHaveValue('6');
 await page.getByRole('radio',{name:'Full Day',exact:true}).check();
 await expect(guidance).toHaveCount(0);
 await expect(hours).toHaveCount(0);
 await page.locator('input[type=date]').nth(1).fill('2026-10-09');
 await expect(guidance).toHaveCount(0);
 await page.getByRole('radio',{name:'Partial',exact:true}).check();
 await expect(guidance).toHaveText('Maximum for Staff: 3 hrs');
});
test('Staff Away maximum failure offers retry without blocking authoritative save',async({mount,page})=>{
 await page.evaluate(()=>document.documentElement.setAttribute('data-maximum-unavailable','true'));
 await mount(<ExistingCalendarEditHarness away/>);
 await page.getByRole('radio',{name:'Partial',exact:true}).check();
 const hours=page.getByRole('spinbutton',{name:'Capacity Drag Hours',exact:true});
 await expect(page.locator('#staff-away-capacity-maximum')).toContainText('Maximum unavailable.');
 await expect(hours).not.toHaveAttribute('max');
 await page.evaluate(()=>document.documentElement.removeAttribute('data-maximum-unavailable'));
 await page.getByRole('button',{name:'Retry maximum',exact:true}).click();
 await expect(page.locator('#staff-away-capacity-maximum')).toHaveText('Maximum for Staff: 5 hrs');
 await page.evaluate(()=>document.documentElement.setAttribute('data-maximum-unavailable','true'));
 await page.locator('input[type=date]').nth(0).fill('2026-10-07');
 await expect(page.locator('#staff-away-capacity-maximum')).toContainText('Maximum unavailable.');
 await hours.fill('1');
 await expect(page.getByRole('button',{name:'Save Changes',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 const saved=JSON.parse((await page.locator('html').getAttribute('data-away-save'))!);
 expect(saved).toMatchObject({partialDragHours:1,mode:'partial',startDate:'2026-10-07'});
});
