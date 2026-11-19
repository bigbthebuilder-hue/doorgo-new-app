import { calculateJ2AShopHours } from '../../lib/jobs/door-line-contract';
import { expect, test } from '@playwright/experimental-ct-react';
import { MobileJobIntakeHarness } from './MobileJobIntakeHarness';
import { mobileIntakeJob } from './MobileJobIntakeHarness';
import type { MobileIntakeFixture } from './job-intake-actions-shim';
type FixtureGlobal = typeof globalThis & { mobileIntakeFixture: MobileIntakeFixture };

for (const width of [360, 412]) {
  test('phone quantity saves once, highlights only after acknowledgement, and survives reopening at ' + width, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 915 });
    const job = mobileIntakeJob();
    await page.evaluate(job => { (globalThis as FixtureGlobal).mobileIntakeFixture = { job, calls: 0, requests: [], delay: 700 }; }, job);
    const component = await mount(<MobileJobIntakeHarness job={job}/>);
    await expect(component.getByText('Standing Bear', { exact: true })).toBeVisible();
    await expect(component.locator('#phone')).not.toBeVisible();
    await component.getByRole('button', { name: /Job details/ }).click();
    await expect(component.locator('#phone')).toBeVisible();
    await component.getByRole('button', { name: /Job details/ }).click();
    await component.getByRole('button', { name: 'Job Lines (2)', exact: true }).click();
    const plus = component.getByRole('button', { name: 'Increase quantity for A', exact: true });
    const bounds = await plus.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    await plus.click();
    await plus.dispatchEvent('click');
    await expect(component.locator('[data-last-saved="true"]')).toHaveCount(0);
    await expect(plus).toBeDisabled();
    await expect(component.locator('.mobile-last-saved')).toContainText('Quantity updated: 2 → 3');
    expect(await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.calls)).toBe(1);
    await page.screenshot({ path: test.info().outputPath('mobile-door-list.png'), fullPage: true });
    const saved = await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.job);
    expect(saved.lines.map(line => line.doorId)).toEqual(['A', 'B']);
    expect(saved.shopHours).toBe(calculateJ2AShopHours(saved.lines).shopHours);
    expect(saved.lines[0].individualDoorIds).toEqual(['A-1', 'A-2', 'Retained']);
    await component.unmount();
    const reopened = await mount(<MobileJobIntakeHarness job={saved}/>);
    await expect(reopened.locator('.mobile-last-saved')).toContainText('2 → 3');
    await reopened.getByRole('button', { name: 'Job Lines (2)', exact: true }).click();
    await expect(reopened.locator('.job-line-card').first()).toHaveAttribute('data-last-saved', 'true');
    expect(await reopened.locator('.job-line-card').allTextContents()).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('failed Add Door keeps the input and stable identity, then saves and resets only after acknowledgement', async ({ mount, page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const job = mobileIntakeJob();
  await page.evaluate(job => { (globalThis as FixtureGlobal).mobileIntakeFixture = { job, calls: 0, requests: [], failNext: true }; }, job);
  const component = await mount(<MobileJobIntakeHarness job={job}/>);
  const pane = component.locator('#door-input-pane');
  await pane.getByRole('textbox', { name: 'Door ID', exact: true }).fill('B-3');
  const prep = pane.getByRole('combobox', { name: 'Prep', exact: true });
  await pane.getByRole('combobox', { name: 'Height', exact: true }).selectOption(`8'0"`);
  await expect(prep).toHaveValue('MULTI');
  await prep.selectOption('STD');
  const idPosition = await pane.getByRole('textbox', { name: 'Door ID', exact: true }).boundingBox();
  const typePosition = await pane.getByRole('textbox', { name: 'Door Type', exact: true }).boundingBox();
  expect(idPosition!.y).toBeLessThan(typePosition!.y);
  await expect(pane.getByRole('combobox', { name: 'Jamb Width', exact: true })).not.toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mobile-add-door.png'), fullPage: true });
  await pane.locator('summary').filter({ hasText: /^Jamb/ }).click();
  await expect(pane.getByRole('combobox', { name: 'Jamb Width', exact: true })).toBeVisible();
  await pane.getByRole('button', { name: 'Add Door & Next', exact: true }).click();
  await expect(component.getByText('Fixture save failed. Input retained.', { exact: true })).toBeVisible();
  await expect(pane.getByRole('textbox', { name: 'Door ID', exact: true })).toHaveValue('B-3');
  await expect(component.locator('.mobile-last-saved')).toHaveCount(0);
  await pane.getByRole('button', { name: 'Add Door & Next', exact: true }).click();
  await expect(component.locator('.mobile-last-saved')).toContainText('Door added');
  await expect(pane.getByRole('textbox', { name: 'Door ID', exact: true })).toHaveValue('');
  const fixture = await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture);
  expect(fixture.job.lines).toHaveLength(3);
  expect(fixture.job.lines[2].prep).toBe('STD');
  expect(fixture.job.lines[2].prepSource).toBe('manual');
  expect(fixture.requests[0].lines[2].lineId).toBe(fixture.requests[1].lines[2].lineId);
  expect(fixture.requests[0].lines[2].intakeChange!.id).toBe(fixture.requests[1].lines[2].intakeChange!.id);
});

test('interrupted acknowledgement never shows success and a stale retry cannot duplicate the saved door', async ({ mount, page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const job = mobileIntakeJob();
  await page.evaluate(job => { (globalThis as FixtureGlobal).mobileIntakeFixture = { job, calls: 0, requests: [], loseResponse: true }; }, job);
  const component = await mount(<MobileJobIntakeHarness job={job}/>);
  const pane = component.locator('#door-input-pane');
  await pane.getByRole('textbox', { name: 'Door ID', exact: true }).fill('C');
  await pane.getByRole('button', { name: 'Add Door & Next', exact: true }).click();
  await expect(component.getByText(/The door could not be confirmed saved/)).toBeVisible();
  await expect(component.locator('.mobile-last-saved')).toHaveCount(0);
  await pane.getByRole('button', { name: 'Add Door & Next', exact: true }).click();
  await expect(component.getByText('Fixture stale revision. Reopen the job.', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.job);
  expect(saved.lines).toHaveLength(3);
});

test('desktop retains local editing and read-only phone users cannot submit mutations', async ({ mount, page }) => {
  const job = mobileIntakeJob();
  await page.evaluate(job => { (globalThis as FixtureGlobal).mobileIntakeFixture = { job, calls: 0, requests: [] }; }, job);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const desktop = await mount(<MobileJobIntakeHarness job={job}/>);
  const pane = desktop.locator('#door-input-pane');
  await expect(desktop.locator('#phone')).toBeVisible();
  await expect(pane.getByRole('combobox', { name: 'Jamb Width', exact: true })).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Add Door & Next', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('desktop-intake.png'), fullPage: true });
  await pane.getByRole('button', { name: 'Add Door', exact: true }).click();
  expect(await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.calls)).toBe(0);
  await desktop.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.calls)).toBe(1);
  await expect.poll(() => page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.job.lines.length)).toBe(3);
  await desktop.unmount();
  await page.evaluate(() => { (globalThis as FixtureGlobal).mobileIntakeFixture.calls = 0; });
  await page.setViewportSize({ width: 412, height: 915 });
  const readonly = await mount(<MobileJobIntakeHarness job={job} canEdit={false}/>);
  await readonly.getByRole('button', { name: 'Job Lines (2)', exact: true }).click();
  await expect(readonly.getByRole('button', { name: /Increase quantity/ })).toHaveCount(0);
  await expect(readonly.getByRole('button', { name: 'Add new door', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.calls)).toBe(0);
});


test('phone duplication saves a distinct line, keeps ordering and preserves existing copy-ID behavior', async ({ mount, page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const job = mobileIntakeJob();
  await page.evaluate(job => { (globalThis as FixtureGlobal).mobileIntakeFixture = { job, calls: 0, requests: [] }; }, job);
  const component = await mount(<MobileJobIntakeHarness job={job}/>);
  await component.getByRole('button', { name: 'Duplicate previous', exact: true }).click();
  await expect(component.locator('.mobile-last-saved')).toContainText('Door added');
  await component.getByRole('button', { name: 'Job Lines (3)', exact: true }).click();
  await component.locator('.job-line-card').first().getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.job.lines.length)).toBe(4);
  const saved = await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.job);
  expect(saved.lines.map(line => line.doorId)).toEqual(['A', 'B', 'B', 'A']);
  expect(new Set(saved.lines.map(line => line.lineId)).size).toBe(4);
  expect(saved.lines[3].individualDoorIds).toEqual(['A-1', 'A-2', 'Retained']);
  expect(saved.lines[3].prepSource).toBe('manual');
});


test('first phone door creates the confirmed job once using the existing creation command', async ({ mount, page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.evaluate(job => { (globalThis as FixtureGlobal).mobileIntakeFixture = { job, calls: 0, requests: [], delay: 400 }; }, mobileIntakeJob());
  const component = await mount(<MobileJobIntakeHarness job={null}/>);
  const pane = component.locator('#door-input-pane');
  await pane.getByRole('button', { name: 'Exterior', exact: true }).click();
  await pane.getByRole('textbox', { name: 'Door ID', exact: true }).fill('First opening');
  const add = pane.getByRole('button', { name: 'Add Door & Next', exact: true });
  await add.click(); await add.dispatchEvent('click');
  await expect(component.locator('.mobile-last-saved')).toContainText('Door added');
  const fixture = await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture);
  expect(fixture.calls).toBe(1);
  expect(fixture.requests[0].commandId).toMatch(/^[a-f0-9-]{36}$/);
  expect(fixture.job.lines).toHaveLength(1);
  expect(fixture.job.lifecycleStage).toBe('Confirmed Job');
  expect(fixture.job.lines[0].intakeChange!.revision).toBe(1);
  expect(fixture.job.lines[0].doorId).toBe('First opening');
  await expect(add).toBeDisabled();
  await pane.getByRole('textbox', { name: 'Door ID', exact: true }).fill('Second opening');
  await expect(add).toBeEnabled();
  await add.click();
  await expect.poll(() => page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.job.lines.length)).toBe(2);
  expect(await page.evaluate(() => (globalThis as FixtureGlobal).mobileIntakeFixture.calls)).toBe(2);
});
