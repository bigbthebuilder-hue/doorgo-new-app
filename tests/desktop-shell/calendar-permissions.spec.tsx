import { expect, test } from '@playwright/experimental-ct-react';
import { CalendarPermissionsHarness, ExistingCalendarEditHarness } from './CalendarPermissionsHarness';

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
