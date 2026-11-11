import {expect,test} from '@playwright/experimental-ct-react';
import {CalendarStabilityHarness} from './CalendarStabilityHarness';
import type {ProductionBoardViewModel} from '@/lib/production-board/types';

test.beforeEach(async({page})=>{await page.setViewportSize({width:1600,height:1000});});

test('compact actions preserve width, completion and read-only access',async({mount,page},testInfo)=>{
  await page.route('**/api/calendar/window?*',route=>route.fulfill({status:503,body:'{}'}));
  const component=await mount(<CalendarStabilityHarness/>);
  const day=component.locator('[data-calendar-date="2026-11-10"]');const before=await day.boundingBox();
  await day.getByRole('button',{name:'Actions for Original shared job'}).focus();
  await day.getByRole('button',{name:'Actions for Original shared job'}).press('Enter');
  await expect(component.locator('.calendar-detail-panel')).toBeVisible();
  await expect(component.locator('[data-expanded="true"]')).toHaveCount(0);
  expect((await day.boundingBox())?.width).toBe(before?.width);
  await page.screenshot({path:testInfo.outputPath('compact-actions.png')});
  await component.locator('.calendar-detail-panel').getByRole('button',{name:'Complete',exact:true}).click();
  await expect(day.locator('[data-booking-id="shared-booking"]')).toHaveAttribute('data-completed','true');
  await component.locator('.calendar-detail-panel').getByRole('button',{name:'Close Calendar details'}).click();
  await component.update(<CalendarStabilityHarness readOnly/>);
  await day.getByRole('button',{name:'Actions for Original shared job'}).click();
  await expect(component.locator('.calendar-detail-panel').getByRole('button',{name:'Complete',exact:true})).toHaveCount(0);
  await expect(component.locator('.calendar-detail-panel').getByRole('button',{name:'Edit',exact:true})).toHaveCount(0);
});

test('two independent sessions receive remote edits, moves and capacity without remounting',async({mount,page})=>{
  let shared=undefined as ProductionBoardViewModel|undefined;let requests=0;
  await page.route('**/api/calendar/window?*',async route=>{requests++;if(!shared){await route.fulfill({status:503,body:'{}'});return;}await route.fulfill({json:{board:shared}});});
  const component=await mount(<CalendarStabilityHarness sessions={2}/>);
  shared=JSON.parse(await component.getByTestId('board-fixture').textContent()??'{}');
  const original=shared!.days.flatMap(day=>day.cards)[0];
  for(const day of shared!.days)day.cards=[];
  const target=shared!.days.find(day=>day.date==='2026-11-12')!;
  target.cards=[{...original,productionDate:target.date,title:'Remote changed job',customer:'Remote changed job'}];target.availableHours=17;target.capacityKnown=true;
  for(const week of shared!.weekGroups)week.days=shared!.days.filter(day=>day.date>=week.startDate&&day.date<week.endDateExclusive);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(component.locator('.calendar-refresh-status[data-state="current"]')).toHaveCount(2);
  for(let i=0;i<2;i++){const session=component.getByTestId('session-'+i);await expect(session.locator('[data-calendar-date="2026-11-12"]')).toContainText('Remote changed job');await expect(session.locator('[data-calendar-date="2026-11-10"] [data-booking-id="shared-booking"]')).toHaveCount(0);}
  expect(requests).toBeLessThan(10);
  const stream=component.getByTestId('session-0').locator('.calendar-stream');const top=await stream.evaluate(node=>node.scrollTop);
  await component.getByRole('button',{name:'Simulate server render'}).click();
  expect(await stream.evaluate(node=>node.scrollTop)).toBe(top);
  await expect(component.getByTestId('session-0').locator('[data-calendar-date="2026-11-12"]')).toContainText('Remote changed job');
});

test('opening anchor remains on today and passive refresh preserves scroll',async({mount,page})=>{
  let shared=undefined as ProductionBoardViewModel|undefined;
  await page.route('**/api/calendar/window?*',async route=>route.fulfill(shared?{json:{board:shared}}:{status:503,body:'{}'}));
  const component=await mount(<CalendarStabilityHarness/>);shared=JSON.parse(await component.getByTestId('board-fixture').textContent()??'{}');
  const stream=component.locator('.calendar-stream');
  const position=()=>stream.evaluate(node=>({top:node.scrollTop,week:[...node.querySelectorAll<HTMLElement>('[data-calendar-week]')].find(week=>week.getBoundingClientRect().bottom>node.getBoundingClientRect().top+8)?.dataset.calendarWeek}));
  await expect.poll(async()=>(await position()).week).toBe('2026-11-09');
  await page.clock.install();await page.clock.runFor(12000);
  expect((await position()).week).toBe('2026-11-09');
  const before=(await position()).top;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(100);
  await expect(component.locator('.calendar-refresh-status')).toHaveAttribute('data-state','current');
  expect((await position()).top).toBe(before);
});

test('refresh pauses during details and drag; reconnect catches up after failure',async({mount,page})=>{
  let shared=undefined as ProductionBoardViewModel|undefined;let fail=true;let requests=0;
  await page.route('**/api/calendar/window?*',async route=>{requests++;await route.fulfill(!fail&&shared?{json:{board:shared}}:{status:503,body:'{}'});});
  const component=await mount(<CalendarStabilityHarness/>);shared=JSON.parse(await component.getByTestId('board-fixture').textContent()??'{}');
  await expect(component.locator('.calendar-refresh-status')).toHaveAttribute('data-state','retrying');
  await component.getByRole('button',{name:'Actions for Original shared job'}).click();
  await page.clock.install();const previous=requests;await page.clock.runFor(21000);expect(requests).toBe(previous);
  fail=false;
  await component.locator('.calendar-detail-panel').getByRole('button',{name:'Close Calendar details'}).click();await page.clock.runFor(100);
  await expect(component.locator('.calendar-refresh-status')).toHaveAttribute('data-state','current');
  const card=component.locator('[data-booking-id="shared-booking"]').first();const transfer=await page.evaluateHandle(()=>new DataTransfer());
  await card.dispatchEvent('dragstart',{dataTransfer:transfer});const during=requests;await page.clock.runFor(11000);expect(requests).toBe(during);
  await card.dispatchEvent('dragend',{dataTransfer:transfer});await page.clock.runFor(100);
  await page.context().setOffline(true);await expect(component.locator('.calendar-refresh-status')).toHaveAttribute('data-state','offline');
  await page.context().setOffline(false);await page.clock.runFor(100);await expect(component.locator('.calendar-refresh-status')).toHaveAttribute('data-state','current');
});

test('late background response cannot overwrite a local completion',async({mount,page})=>{
  let shared=undefined as ProductionBoardViewModel|undefined;let release:(()=>void)|undefined;let hold=false;
  await page.route('**/api/calendar/window?*',async route=>{if(hold)await new Promise<void>(resolve=>{release=resolve;});try{await route.fulfill(shared?{json:{board:shared}}:{status:503,body:'{}'});}catch{/* aborted requests are expected */}});
  const component=await mount(<CalendarStabilityHarness/>);shared=JSON.parse(await component.getByTestId('board-fixture').textContent()??'{}');
  hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>Boolean(release)).toBe(true);
  await component.getByRole('button',{name:'Actions for Original shared job'}).click();
  await component.locator('.calendar-detail-panel').getByRole('button',{name:'Complete',exact:true}).click();
  hold=false;release?.();
  await expect(component.locator('[data-booking-id="shared-booking"]').first()).toHaveAttribute('data-completed','true');
});

test('a timed-out refresh keeps current cards and recovers without stacking requests',async({mount,page})=>{
  await page.clock.install();
  let shared=undefined as ProductionBoardViewModel|undefined;let release:(()=>void)|undefined;let hold=true;let requests=0;
  await page.route('**/api/calendar/window?*',async route=>{requests++;if(hold)await new Promise<void>(resolve=>{release=resolve;});try{await route.fulfill(shared?{json:{board:shared}}:{status:503,body:'{}'});}catch{/* timed-out fetch may already be aborted */}});
  const component=await mount(<CalendarStabilityHarness/>);shared=JSON.parse(await component.getByTestId('board-fixture').textContent()??'{}');
  await expect.poll(()=>Boolean(release)).toBe(true);
  const started=requests;
  await page.clock.runFor(16000);
  await expect(component.locator('.calendar-refresh-status')).toHaveAttribute('data-state','retrying');
  await expect(component.locator('[data-booking-id="shared-booking"]').first()).toContainText('Original shared job');
  expect(requests).toBe(started);hold=false;release?.();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(100);
  await expect(component.locator('.calendar-refresh-status')).toHaveAttribute('data-state','current');
});

for(const viewport of [{name:'desktop',width:1600,height:1000},{name:'mobile',width:390,height:844}])test('layout acceptance: '+viewport.name,async({mount,page},testInfo)=>{
  await page.setViewportSize(viewport);
  await page.route('**/api/calendar/window?*',route=>route.fulfill({status:503,body:'{}'}));
  const component=await mount(<CalendarStabilityHarness/>);
  const stream=component.locator('.calendar-stream');
  const day=component.locator('[data-calendar-date="2026-11-10"]');
  const actions=day.getByRole('button',{name:'Actions for Original shared job'});
  await actions.scrollIntoViewIfNeeded();
  const width=(await day.boundingBox())!.width;
  const before=await stream.evaluate(node=>({top:node.scrollTop,left:node.scrollLeft}));
  await actions.click();
  const panel=component.locator('.calendar-detail-panel');
  await expect(panel).toBeVisible();
  const bounds=(await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width+1);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height+1);
  await expect(panel.getByRole('button',{name:'Edit',exact:true})).toBeEnabled();
  await expect(panel.getByRole('button',{name:'Complete',exact:true})).toBeEnabled();
  await expect(component.locator('[data-expanded="true"]')).toHaveCount(0);
  expect((await day.boundingBox())!.width).toBe(width);
  await page.screenshot({path:testInfo.outputPath(viewport.name+'-calendar-actions.png')});
  await panel.getByRole('button',{name:'Close Calendar details'}).click();
  const after=await stream.evaluate(node=>({top:node.scrollTop,left:node.scrollLeft}));
  expect(after.top).toBeCloseTo(before.top,0);expect(after.left).toBeCloseTo(before.left,0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
});
