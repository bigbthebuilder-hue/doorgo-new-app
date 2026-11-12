import { expect, test } from '@playwright/experimental-ct-react';
import { JobsWorkspace } from '@/components/jobs/JobsWorkspace';
import type { NativeJobListItem } from '@/lib/jobs/job-intake-types';

test('Jobs default salesperson, cross-salesperson search and completion groups', async ({ mount, page }) => {
  const rows = [
    {internalJobId:'one',doorGoReference:'DG-1',bizTrackSalesOrder:'9',salesperson:'Aaron',customer:'Aaron Customer',siteAddress:'Site A',lifecycleStage:'Confirmed Job'},
    {internalJobId:'two',doorGoReference:'DG-2',bizTrackSalesOrder:'100',salesperson:'Barrett',customer:'Other Customer',siteAddress:'Site B',lifecycleStage:'Confirmed Job'},
    {internalJobId:'three',doorGoReference:'DG-3',bizTrackSalesOrder:'999',salesperson:'Aaron',customer:'Finished Customer',siteAddress:'Site C',lifecycleStage:'Confirmed Job',isComplete:true},
  ].map(job => ({...job,updatedAt:'2026-11-12T12:00:00Z',createdAt:'2026-11-12T12:00:00Z',revision:1,activeLineCount:1,archivedLineCount:0,archivedAt:null})) as NativeJobListItem[];
  await mount(<JobsWorkspace jobs={rows} currentSalesperson="Aaron" canCreate={false} navigation={[]}/>);
  await expect(page.getByRole('combobox', {name:'Salesperson',exact:true})).toHaveValue('aaron');
  await expect(page.getByText('Other Customer',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Active jobs'}).getByText('Aaron Customer',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Completed jobs'}).getByText('Finished Customer',{exact:true})).toBeVisible();
  await page.getByPlaceholder('Identifier, customer or site').fill('Other Customer');
  await expect(page.getByText('Other Customer',{exact:true})).toBeVisible();
  await page.getByPlaceholder('Identifier, customer or site').fill('');
  await page.getByRole('combobox',{name:'Salesperson',exact:true}).selectOption('');
  await expect(page.getByRole('region',{name:'Active jobs'}).locator('article h3')).toHaveText(['100','9']);
  await expect(page.getByRole('link',{name:'New Job',exact:true})).toHaveCount(0);
  for (const width of [390,1280]) {
    await page.setViewportSize({width,height:900});
    await expect(page.getByRole('combobox',{name:'Salesperson',exact:true})).toBeVisible();
    expect(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
