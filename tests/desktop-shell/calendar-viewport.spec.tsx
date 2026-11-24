import {test,expect} from '@playwright/experimental-ct-react';
import {CalendarViewportHarness} from './CalendarViewportHarness';

const offset=async(page:import('playwright/test').Page,date:string)=>page.locator('.calendar-stream').evaluate((stream,date)=>stream.querySelector<HTMLElement>(`[data-calendar-week="${date}"]`)!.getBoundingClientRect().top-stream.getBoundingClientRect().top,date);
async function view(page:import('playwright/test').Page,date:string,inside=50){await page.locator('.calendar-stream').evaluate((stream,{date,inside})=>{const node=stream.querySelector<HTMLElement>(`[data-calendar-week="${date}"]`)!;stream.scrollTop+=node.getBoundingClientRect().top-stream.getBoundingClientRect().top+inside;stream.dispatchEvent(new Event('scroll'));},{date,inside});await expect.poll(()=>offset(page,date)).toBeCloseTo(-inside,0);}
for(const width of [390,1600])for(const date of ['2026-10-12','2026-12-28','2027-01-04'])test(`return restores date and relative position ${date} at ${width}`,async({mount,page})=>{
  await page.setViewportSize({width,height:850});const component=await mount(<CalendarViewportHarness/>);
  await view(page,date,60);
  await component.getByRole('button',{name:'Open Job / Leave Calendar',exact:true}).click();
  await component.getByRole('button',{name:'Go to Calendar',exact:true}).click();
  await expect.poll(()=>offset(page,date)).toBeCloseTo(-60,0);
});
test('remote height changes and delayed prepend use the current anchor, not request-time offsets',async({mount,page})=>{
  const component=await mount(<CalendarViewportHarness/>);await view(page,'2026-12-28',70);
  await component.getByRole('button',{name:'Remote week-height change'}).click();await expect.poll(()=>offset(page,'2026-12-28')).toBeCloseTo(-70,0);
  await view(page,'2027-01-11',30);
  await component.getByRole('button',{name:'Complete delayed prepend'}).click();await expect.poll(()=>offset(page,'2027-01-11')).toBeCloseTo(-30,0);
  await component.getByRole('button',{name:'Today',exact:true}).click();await expect.poll(()=>offset(page,'2026-11-23')).toBeCloseTo(0,0);
});
test('intentional scrolling cancels delayed initialization',async({mount,page})=>{
  const component=await mount(<CalendarViewportHarness delay/>);
  await page.locator('.calendar-stream').hover();await page.mouse.wheel(0,400);
  await expect.poll(()=>page.locator('.calendar-stream').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  const top=await page.locator('.calendar-stream').evaluate(el=>el.scrollTop);
  await component.getByRole('button',{name:'Finish delayed initialization'}).click();
  await expect.poll(()=>page.locator('.calendar-stream').evaluate(el=>el.scrollTop)).toBeCloseTo(top,0);
});
test('account switch cannot read another account viewport',async({mount,page})=>{
  const component=await mount(<CalendarViewportHarness owner="a"/>);await view(page,'2027-01-04',40);await component.unmount();
  const other=await mount(<CalendarViewportHarness owner="b"/>);await expect.poll(()=>offset(page,'2026-11-23')).toBeCloseTo(0,0);await other.unmount();
  await mount(<CalendarViewportHarness owner="a"/>);await expect.poll(()=>offset(page,'2027-01-04')).toBeCloseTo(-40,0);
});

import { CalendarViewportReturnHarness } from './CalendarViewportHarness';
for(const width of [390,1600])test('real Calendar restores a future week after unmount at '+width,async({mount,page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/api/calendar/window?*',route=>route.fulfill({status:503,body:'{}'}));
  const component=await mount(<CalendarViewportReturnHarness/>);
  await view(page,'2026-12-07',20);
  await component.getByRole('button',{name:'Leave real Calendar',exact:true}).click();
  await component.getByRole('button',{name:'Return real Calendar',exact:true}).click();
  await expect.poll(()=>offset(page,'2026-12-07')).toBeCloseTo(-20,0);
});

test('real Calendar browser back/forward restores each date anchor',async({mount,page})=>{
  await page.route('**/api/calendar/window?*',route=>route.fulfill({status:503,body:'{}'}));
  await mount(<CalendarViewportReturnHarness/>);
  await page.evaluate(()=>history.replaceState({...history.state},'','/calendar?week=2026-11-02'));
  await view(page,'2026-11-02',15);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.evaluate(()=>history.pushState({...history.state},'','/calendar?week=2026-12-07'));
  await view(page,'2026-12-07',25);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.evaluate(()=>history.back());await expect.poll(()=>offset(page,'2026-11-02')).toBeCloseTo(-15,0);
  await page.evaluate(()=>history.forward());await expect.poll(()=>offset(page,'2026-12-07')).toBeCloseTo(-25,0);
});
test('resize observer preserves the current week after non-React content reflow',async({mount,page})=>{
  await mount(<CalendarViewportHarness/>);await view(page,'2027-01-04',45);
  await page.locator('[data-calendar-week="2026-10-05"]').evaluate(el=>{el.style.height='700px';});
  await expect.poll(()=>offset(page,'2027-01-04')).toBeCloseTo(-45,0);
});

import {CalendarStabilityHarness} from './CalendarStabilityHarness';
test('Open Job encodes the viewed week rather than the loaded range start',async({mount,page})=>{
  await page.route('**/api/calendar/window?*',route=>route.fulfill({status:503,body:'{}'}));
  const component=await mount(<CalendarStabilityHarness canOpenJobs/>);
  await component.getByRole('button',{name:'Actions for Original shared job',exact:true}).click();
  await expect(component.getByRole('link',{name:'Open Job',exact:true})).toHaveAttribute('href',/returnTo=%2Fcalendar%3Fweek%3D2026-11-09/);
});
