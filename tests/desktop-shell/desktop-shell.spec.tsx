import { expect, test } from '@playwright/experimental-ct-react';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { ContextBottomBar } from '@/components/app-shell/ContextBottomBar';
import { AppShell } from '@/components/app-shell/AppShell';
import { Workspace, WorkspaceSurface } from '@/components/app-shell/Workspace';
import { DOORGO_DOCUMENT_DEFINITIONS } from '@/lib/documents/document-definitions';
import { UnsavedNavigationHarness } from './UnsavedNavigationHarness';
import { ProductionBookingCard } from '@/components/ProductionBookingCard';
import { ProductionBoardDay } from '@/components/ProductionBoardDay';
import { ProductionBoardSummary } from '@/components/ProductionBoardSummary';
import { BoardNavigationHarness } from './BoardNavigationHarness';
import { DoorLineWorkspaceHarness, FlexibleShopHoursHarness } from './DoorLineWorkspaceHarness';
import { EffectiveShopHoursHarness, JobEditorWorkbenchHarness } from './JobEditorWorkbenchHarness';
import { JobsWorkspace } from '@/components/jobs/JobsWorkspace';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';
import type { ProductionBoardCard, ProductionBoardDay as ProductionBoardDayModel, ProductionBoardViewModel } from '@/lib/production-board/types';
import type { DoorLineInput, NativeJobListItem } from '@/lib/jobs/job-intake-types';

const desktopShellLabels = ['View Schedule', 'Edit Schedule', 'Documents', 'Glass Calculator', 'Account'];
const appShellViewports = [
  { width: 1600, height: 900 }, { width: 1440, height: 800 }, { width: 1366, height: 768 },
  { width: 1280, height: 720 }, { width: 1100, height: 720 }, { width: 1024, height: 720 }, { width: 900, height: 700 },
];

type ShellPage = {
  evaluate(callback: (labels: string[]) => void, labels: string[]): Promise<void>;
};

async function prepareShell(page: ShellPage) {
  await page.evaluate((labels) => {
    const header = document.querySelector('.app-context-bar');
    if (!header) throw new Error('Contextual top bar did not render');
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    const rail = document.createElement('aside');
    rail.className = 'app-shell-sidebar';
    rail.dataset.testid = 'rail';
    const nav = document.createElement('nav');
    nav.className = 'app-shell-nav';
    for (const label of labels) {
      const link = document.createElement('a');
      link.className = 'app-shell-nav-link';
      if (label === 'Account') link.dataset.placement = 'bottom';
      if (label === 'Edit Schedule') link.setAttribute('aria-current', 'page');
      const icon = document.createElement('span'); icon.className = 'app-shell-nav-icon';
      const text = document.createElement('span'); text.className = 'app-shell-nav-label'; text.textContent = label;
      link.append(icon, text); nav.append(link);
    }
    rail.append(nav);
    const main = document.createElement('main');
    main.className = 'app-shell-main';
    main.dataset.testid = 'workspace-scroll';
    const workspace = document.createElement('div');
    workspace.className = 'app-workspace';
    workspace.style.height = '2400px';
    main.append(header, workspace); shell.append(rail, main); document.body.append(shell);
  }, desktopShellLabels);
}

test('desktop shell pins the contextual bar to its real scrolling surface', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await mount(<ContextTopBar title="Jobs" secondary="Native DoorGo jobs" />);
  await prepareShell(page);
  const scrollSurface = page.getByTestId('workspace-scroll');
  const topBar = page.locator('.app-context-bar');
  const before = await topBar.boundingBox();
  expect(before).not.toBeNull();
  await scrollSurface.evaluate((element) => { element.scrollTop = 1000; });
  await expect.poll(() => scrollSurface.evaluate((element) => element.scrollTop)).toBeGreaterThan(900);
  const after = await topBar.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(1);
  await expect(topBar).toHaveCSS('position', 'sticky');
});

test('desktop rail keeps full wrapped labels without ellipsis', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await mount(<ContextTopBar title="Jobs" secondary="Native DoorGo jobs" />);
  await prepareShell(page);
  await expect(page.getByTestId('rail')).toHaveCSS('width', '76px');
  for (const label of desktopShellLabels.slice(0, 5)) {
    const text = page.getByText(label, { exact: true });
    await expect(text).toBeVisible();
    await expect(text).toHaveText(label);
    await expect(text).toHaveCSS('white-space', 'normal');
    await expect(text).toHaveCSS('text-overflow', 'clip');
    const box = await text.evaluate((element) => ({
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    }));
    expect(box.clientHeight).toBeGreaterThan(10);
    expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight);
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
  }
  await expect(page.getByText('Edit Schedule', { exact: true }).locator('..')).toHaveAttribute('aria-current', 'page');
  const accountY = (await page.getByText('Account', { exact: true }).locator('..').boundingBox())?.y ?? 0;
  const calculatorY = (await page.getByText('Glass Calculator', { exact: true }).locator('..').boundingBox())?.y ?? 0;
  expect(accountY).toBeGreaterThan(calculatorY + 100);
});

test('phone fallback leaves the contextual bar non-sticky', async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(<ContextTopBar title="Jobs" secondary="Native DoorGo jobs" />);
  await prepareShell(page);
  await expect(page.locator('.app-context-bar')).toHaveCSS('position', 'static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test('job identity remains visible while its editor workspace scrolls', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await mount(<ContextTopBar backHref="/jobs" backLabel="Jobs" title="DG-000123" status={<span>Confirmed Job · Rev 3</span>} controls={<div className="app-job-context-fields"><label className="app-job-context-field"><span>Customer</span><input aria-label="Customer" value="A very long customer name that must remain contained in its compact field" readOnly/></label><label className="app-job-context-field"><span>Site / Address</span><input aria-label="Site / Address" value="12345 Extremely Long Industrial Site Address, Vancouver" readOnly/></label><label className="app-job-context-field"><span>Salesperson</span><input aria-label="Salesperson" value="Barrett Longname" readOnly/></label></div>}/>);
  await prepareShell(page);
  const topBar = page.locator('.app-context-bar');
  await page.getByTestId('workspace-scroll').evaluate((element) => { element.scrollTop = 1200; });
  await expect(topBar.getByText('DG-000123')).toBeVisible();
  await expect(topBar.getByLabel('Customer')).toBeVisible();
  await expect(topBar.getByText('Confirmed Job · Rev 3')).toBeVisible();
  await expect(topBar.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
  const height = await topBar.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(128);
  for (const label of ['Customer', 'Site / Address', 'Salesperson']) {
    const field = topBar.getByLabel(label);
    const geometry = await field.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(geometry.scrollWidth).toBeGreaterThanOrEqual(geometry.clientWidth);
    await expect(field.locator('..')).toHaveCSS('border-top-style', 'solid');
  }
  await topBar.evaluate((element) => element.querySelector<HTMLInputElement>('input[aria-label="Customer"]')!.value = '');
  await expect(topBar.getByLabel('Customer')).toHaveValue('');
  await expect(topBar.getByLabel('Customer')).not.toHaveAttribute('placeholder', 'Customer');
});

test('compact production cards keep several bookings visible in one desktop viewport', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const card: ProductionBoardCard = {
    bookingId: 'booking-1', type: 'doorgo_linked', typeLabel: 'DoorGo-linked', productionDate: '2026-08-11',
    title: 'DG-000123 · Fixture Customer', customer: 'Fixture Customer', jobId: 'DG-000123',
    calendarId: null, calendarEventId: null, shopHours: 4.25, shopHoursKnown: true,
    salesperson: 'Barrett', source: null, sourceSystem: null, bookingKind: null, locked: false, completedAt: null,
  };
  await mount(<div className="grid w-[280px] gap-1">{[0, 1, 2, 3, 4].map((index) => <ProductionBookingCard key={index} card={{ ...card, bookingId: `booking-${index}` }}/>)}</div>);
  const cards = page.locator('.production-booking-card');
  await expect(cards).toHaveCount(5);
  const heights = await cards.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(Math.max(...heights)).toBeLessThanOrEqual(56);
  const groupHeight = await cards.locator('..').evaluate((element) => element.getBoundingClientRect().height);
  expect(groupHeight).toBeLessThan(300);
  await expect(cards.first().getByTitle('DoorGo job')).toHaveCount(0);
  await expect(cards.first()).not.toContainText('DoorGo-linked');
});

test('primary production summary omits transitional source counts', async ({ mount, page }) => {
  const board = {
    startDate: '2026-08-10', endDateExclusive: '2026-08-15', visibleWeekdayEndExclusive: '2026-08-15',
    weeks: 1, days: [], needsAttentionCards: [], weekGroups: [], calculationStartDate: '2026-08-10',
    summary: { totalBookings: 4, totalKnownShopHours: 12, scheduledDays: 3, doorGoLinkedCount: 2, bizTrackOnlyCount: 2, missingShopHoursCount: 0 },
  } satisfies ProductionBoardViewModel;
  await mount(<ProductionBoardSummary board={board}/>);
  await expect(page.getByText('Bookings', { exact: true })).toBeVisible();
  await expect(page.getByText('DoorGo-linked', { exact: true })).toHaveCount(0);
  await expect(page.getByText('BizTrack-only', { exact: true })).toHaveCount(0);
});

test('read-only Production Board navigation changes only the viewed week in the sticky top bar', async ({ mount, page }) => {
  for (const viewport of appShellViewports) {
    await page.setViewportSize(viewport);
    const component = await mount(<BoardNavigationHarness/>);
    for (const label of ['Home', 'View Schedule', 'Edit Schedule', 'Jobs', 'Glass Calculator', 'Account']) await expect(component.getByRole('link', { name: label })).toBeVisible();
    const navigation = component.getByLabel('Production Board date window');
    const shellBox = await component.locator('.app-context-bar').boundingBox();
    const navigationBox = await navigation.boundingBox();
    expect(shellBox!.height).toBeGreaterThanOrEqual(60);
    expect(shellBox!.height).toBeLessThanOrEqual(68);
    expect(navigationBox!.x + navigationBox!.width).toBeLessThanOrEqual(shellBox!.x + shellBox!.width + 1);
    expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(shellBox!.y + shellBox!.height + 2);
    await expect(navigation.getByRole('button', { name: 'Previous week' })).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Next week' })).toBeVisible();
    await navigation.getByRole('button', { name: 'Previous week' }).click();
    await expect(component.getByTestId('board-navigation-href')).toHaveText('/production-board?week=2026-08-03');
    await navigation.getByLabel('Go to date').fill('2026-09-02');
    await navigation.getByRole('button', { name: 'Go' }).click();
    await expect(component.getByTestId('board-navigation-href')).toHaveText('/production-board?week=2026-08-31');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    const topBefore = await component.locator('.app-context-bar').evaluate((element) => element.getBoundingClientRect().top);
    await component.locator('.app-shell-main').evaluate((element) => { element.scrollTop = 500; });
    const topAfter = await component.locator('.app-context-bar').evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(1);
    await component.unmount();
  }
});

test('dense Jobs rows keep many records visible at desktop and laptop widths', async ({ mount, page }) => {
  const jobs = Array.from({ length: 12 }, (_, index) => ({
    internalJobId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, doorGoReference: `DG-${String(index + 1).padStart(6, '0')}`,
    bizTrackSalesOrder: null, customer: `Customer ${index + 1}`, siteAddress: `Site ${index + 1}`, lifecycleStage: 'Draft',
    createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z', revision: 1,
    visibleIdentifier: `DG-${String(index + 1).padStart(6, '0')}`, visibleIdentifierKind: 'door_go_reference', legacyJobId: null,
    activeLineCount: 1, archivedLineCount: 0, archivedAt: null,
  })) as NativeJobListItem[];
  await mount(<JobsWorkspace canCreate jobs={jobs} navigation={[]}/>);
  await expect(page.getByPlaceholder('Identifier, customer or site')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import Legacy Job' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New Job', exact: true })).toBeVisible();
  await expect(page.locator('.app-context-bar').getByRole('heading', { name: 'Jobs' })).toBeVisible();
  await expect(page.locator('.app-shell-main > .app-workspace').getByText('Filter jobs')).toHaveCount(0);
  await expect(page.getByPlaceholder(/salesperson/i)).toHaveCount(0);
  for (const viewport of appShellViewports) {
    await page.setViewportSize(viewport);
    const shell = page.locator('.app-context-bar');
    const shellBox = await shell.boundingBox();
    expect(shellBox!.height).toBeGreaterThanOrEqual(44);
    expect(shellBox!.height).toBeLessThanOrEqual(52);
    for (const control of [shell.locator('.app-context-primary'), shell.locator('.app-jobs-filter'), shell.locator('.app-context-actions')]) {
      const box = await control.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(shellBox!.y);
      expect(box!.y + box!.height).toBeLessThanOrEqual(shellBox!.y + shellBox!.height + 1);
    }
    const rows = page.locator('article');
    await expect(rows).toHaveCount(12);
    expect(await rows.first().evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(44);
    await expect(rows.last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
});

test('routine native door choices share one compact desktop workspace', async ({ mount, page }) => {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const component = await mount(<DoorLineWorkspaceHarness/>);
    for (const label of ['Door Type', 'Configuration', 'Width', 'Height', 'Swing', 'Prep', 'Quantity', 'Jamb Width', 'Jamb Type', 'Hinge Type', 'Material', 'Sill', 'Weatherstrip', 'Custom Slab / RO', 'Door Thickness']) await expect(component.locator('label').filter({ hasText: new RegExp(`^${label.replace('/', '\\/')}`) }).first().locator('input,select,textarea')).toBeVisible();
    await expect(component.getByText('More Details', { exact: true })).toHaveCount(0);
    await expect(component.locator('.door-input-pane')).toHaveCSS('overflow-y', viewport.width > 1440 ? 'hidden' : 'visible');
    await expect(component.locator('.job-lines-pane')).toHaveCSS('overflow-y', viewport.width > 1440 ? 'auto' : 'visible');
    const inputFit = await component.locator('.door-input-pane').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
    expect(inputFit.scrollHeight).toBeLessThanOrEqual(inputFit.clientHeight);
    const inputTop = await component.locator('.door-input-pane').evaluate((element) => element.getBoundingClientRect().top);
    await component.locator('.job-lines-pane').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await component.locator('.door-input-pane').evaluate((element) => element.getBoundingClientRect().top)).toBe(inputTop);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await component.unmount();
  }
});

test('narrow job workspace switches panes without losing draft state or changing dirty state', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  const component = await mount(<JobEditorWorkbenchHarness/>);
  const switcher = component.getByRole('group', { name: 'Door workspace view' });
  const inputTab = switcher.getByRole('button', { name: 'Door Input' });
  const linesTab = switcher.getByRole('button', { name: 'Job Lines (1)' });
  await expect(switcher).toBeVisible();
  await expect(inputTab).toHaveAttribute('aria-pressed', 'true');
  await component.getByRole('textbox', { name: 'Line Notes' }).fill('Responsive draft survives pane changes');
  await expect(component.getByRole('region', { name: 'Job actions' })).toContainText('Unsaved changes');
  await linesTab.click();
  await expect(linesTab).toHaveAttribute('aria-pressed', 'true');
  await expect(component.locator('.job-lines-pane')).toBeVisible();
  await expect(component.locator('.door-input-pane')).toBeHidden();
  await expect(component.getByRole('region', { name: 'Job actions' })).toContainText('Unsaved changes');
  await inputTab.click();
  await expect(component.getByRole('textbox', { name: 'Line Notes' })).toHaveValue('Responsive draft survives pane changes');
  await linesTab.click();
  await component.locator('.job-lines-pane').getByRole('button', { name: 'Edit' }).click();
  await expect(inputTab).toHaveAttribute('aria-pressed', 'true');
  await expect(component.getByRole('heading', { name: 'Edit Door Line' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test('compact job workspace provides one vertical scroll path to every Door Input action', async ({ mount, page }) => {
  for (const viewport of [
    { width: 1440, height: 800 }, { width: 1366, height: 768 }, { width: 1280, height: 720 },
    { width: 1100, height: 720 }, { width: 1024, height: 720 }, { width: 900, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    const component = await mount(<JobEditorWorkbenchHarness/>);
    const main = component.locator('.app-shell-main');
    const workspace = component.locator('.job-editor-workspace');
    await expect(main).toHaveAttribute('data-scroll-owner', 'workspace');
    await expect(main).toHaveAttribute('data-has-top-bar', 'true');
    await expect(main).toHaveAttribute('data-has-bottom-bar', 'true');
    await expect(main).toHaveCSS('overflow-y', 'hidden');
    await expect(workspace).toHaveCSS('overflow-y', 'auto');
    await expect(component.locator('.door-input-pane')).toHaveCSS('overflow-y', 'visible');
    await component.getByRole('combobox', { name: 'Material', exact: true }).selectOption('wood');
    await component.getByRole('combobox', { name: 'Custom Slab / RO', exact: true }).selectOption('WoodCustom');
    const addDoor = component.getByRole('button', { name: 'Add Door', exact: true });
    const doorInput = component.locator('.door-input-pane');
    const lineNotes = component.getByRole('textbox', { name: 'Line Notes' });
    const localFooter = component.locator('.door-input-local-footer');
    const preview = component.locator('.door-input-preview');
    const bottomBar = component.getByRole('region', { name: 'Job actions' });
    const fit = await workspace.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
    expect(fit.scrollHeight).toBeGreaterThanOrEqual(fit.clientHeight);
    await addDoor.scrollIntoViewIfNeeded();
    await expect(addDoor).toBeInViewport();
    await expect(lineNotes).toBeInViewport();
    await expect(bottomBar).toBeInViewport();
    const geometry = await component.evaluate((root) => {
      const notes = root.querySelector('.door-line-notes textarea')!.getBoundingClientRect();
      const footer = root.querySelector('.door-input-local-footer')!.getBoundingClientRect();
      const previewBox = root.querySelector('.door-input-preview')!.getBoundingClientRect();
      const add = Array.from(root.querySelectorAll('button')).find((button) => button.textContent === 'Add Door')!.getBoundingClientRect();
      const jobBar = root.querySelector('.app-context-bottom-bar')!.getBoundingClientRect();
      return { notes: notes.toJSON(), footer: footer.toJSON(), preview: previewBox.toJSON(), add: add.toJSON(), jobBar: jobBar.toJSON() };
    });
    expect(geometry.notes.height).toBeLessThanOrEqual(48);
    expect(geometry.footer.top).toBeGreaterThanOrEqual(geometry.notes.bottom);
    expect(geometry.footer.bottom).toBeLessThanOrEqual(geometry.jobBar.top);
    expect(geometry.preview.right).toBeLessThanOrEqual(geometry.add.left + 1);
    expect(geometry.preview.bottom).toBeGreaterThan(geometry.add.top);
    expect(geometry.add.bottom).toBeGreaterThan(geometry.preview.top);
    if (viewport.width >= 1280) expect(Math.abs((geometry.preview.top + geometry.preview.bottom) / 2 - (geometry.add.top + geometry.add.bottom) / 2)).toBeLessThanOrEqual(2);
    await expect(localFooter).toBeVisible();
    await expect(doorInput).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(component.locator('.app-workspace-surface')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(localFooter).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(preview).toContainText('Preview:');
    await workspace.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const scrolled = await workspace.evaluate((element) => element.scrollTop);
    if (fit.scrollHeight > fit.clientHeight) expect(scrolled).toBeGreaterThan(0);
    else expect(scrolled).toBe(0);
    const linesTab = component.getByRole('button', { name: 'Job Lines (1)' });
    await linesTab.click();
    await expect(component.locator('.job-lines-pane')).toHaveCSS('overflow-y', 'visible');
    await component.getByRole('button', { name: 'Door Input' }).click();
    await expect(component.getByRole('combobox', { name: 'Custom Slab / RO', exact: true })).toHaveValue('WoodCustom');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await component.unmount();
  }
});

test('RIP jamb is mapped through Jamb Width without a standalone checkbox', async ({ mount }) => {
  const ripLine: DoorLineInput = {
    lineId: 'rip-line', lineIndex: 1, lineStatus: 'Active', mode: 'Exterior', doorType: 'Madison', config: 'D', width: `2'8"`, height: `6'8"`,
    hand: 'LH', prep: 'D', qty: 1, jambWidth: '5-1/2', ripJamb: 'Yes', jambType: 'Primed', hingeType: 'REG', material: 'fiberglass',
    sill: 'Bronze', weatherstrip: 'Bronze', customSlab: 'No', doorThickness: '1-3/4',
  };
  const component = await mount(<DoorLineWorkspaceHarness initialLines={[ripLine]}/>);
  const initialHours = Number(((await component.getByText(/^Shop Hours:/).textContent()) ?? '').match(/[\d.]+/)?.[0]);
  await component.getByRole('button', { name: 'Job Lines (1)' }).click();
  await component.locator('.job-lines-pane').getByRole('button', { name: 'Edit' }).click();
  const jambWidth = component.getByRole('combobox', { name: 'Jamb Width', exact: true });
  await expect(jambWidth).toHaveValue('RIP');
  await expect(component.getByText('Rip to', { exact: true })).toBeVisible();
  await expect(component.getByRole('textbox', { name: 'Rip to' })).toHaveValue('5-1/2');
  await expect(component.getByRole('checkbox', { name: 'RIP jamb' })).toHaveCount(0);
  await jambWidth.selectOption(`8-7/8"`);
  await expect(component.getByRole('textbox', { name: 'Rip to' })).toHaveCount(0);
  await component.getByRole('button', { name: 'Update Door' }).click();
  const standardHours = Number(((await component.getByText(/^Shop Hours:/).textContent()) ?? '').match(/[\d.]+/)?.[0]);
  expect(initialHours - standardHours).toBe(.25);
  await component.getByRole('button', { name: 'Job Lines (1)' }).click();
  await component.locator('.job-lines-pane').getByRole('button', { name: 'Edit' }).click();
  await expect(jambWidth).toHaveValue(`8-7/8"`);
  await jambWidth.selectOption('RIP');
  await component.getByRole('textbox', { name: 'Rip to' }).fill('6');
  await component.getByRole('button', { name: 'Update Door' }).click();
  const restoredRipHours = Number(((await component.getByText(/^Shop Hours:/).textContent()) ?? '').match(/[\d.]+/)?.[0]);
  expect(restoredRipHours - standardHours).toBe(.25);
  await component.getByRole('button', { name: 'Job Lines (1)' }).click();
  await component.locator('.job-lines-pane').getByRole('button', { name: 'Edit' }).click();
  await expect(jambWidth).toHaveValue('RIP');
  await expect(component.getByRole('textbox', { name: 'Rip to' })).toHaveValue('6');
});

test('Archive Job stays in an accessible job-level bottom action menu', async ({ mount, page }) => {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1100, height: 720 }, { width: 900, height: 700 }]) {
    await page.setViewportSize(viewport);
    const component = await mount(<JobEditorWorkbenchHarness saved/>);
    const contextBar = component.locator('.app-context-bar');
    await expect(contextBar.getByRole('button', { name: 'Archive Job' })).toHaveCount(0);
    const bottomBar = component.getByRole('region', { name: 'Job actions' });
    const jobActions = bottomBar.getByText('Job Actions ▾', { exact: true });
    await jobActions.focus();
    await jobActions.press('Enter');
    const archive = component.getByRole('button', { name: 'Archive Job' });
    await expect(archive).toBeVisible();
    await expect(archive).toHaveClass(/text-rose-700/);
    const geometry = await component.evaluate((root) => {
      const panel = root.querySelector('.job-actions-menu > div')!.getBoundingClientRect();
      const bar = root.querySelector('.app-context-bottom-bar')!.getBoundingClientRect();
      return { panel: panel.toJSON(), bar: bar.toJSON(), viewport: { width: innerWidth, height: innerHeight } };
    });
    expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewport.width);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(0);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.bar.top + 1);
    if (viewport.width <= 1440) {
      await expect(component.locator('.door-input-pane')).toHaveCSS('box-shadow', 'none');
      await expect(component.locator('.job-editor-workspace')).toHaveCSS('overflow-y', 'auto');
    } else {
      await expect(component.locator('.job-editor-workspace')).toHaveCSS('overflow-y', 'hidden');
      await expect(component.locator('.job-lines-pane')).toHaveCSS('overflow-y', 'auto');
    }
    await expect(bottomBar).toBeInViewport();
    const actionFit = await bottomBar.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(actionFit.scrollWidth).toBeLessThanOrEqual(actionFit.clientWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await component.unmount();
  }
});

test('job bottom menus toggle, switch exclusively, and close on outside click', async ({ mount, page }) => {
  const component = await mount(<JobEditorWorkbenchHarness saved/>);
  const documents = component.getByText('Documents ▾', { exact: true });
  const jobActions = component.getByText('Job Actions ▾', { exact: true });
  const preview = component.getByRole('button', { name: 'Preview' });
  const archive = component.getByRole('button', { name: 'Archive Job' });

  await documents.click();
  await expect(preview).toBeVisible();
  await documents.click();
  await expect(preview).toBeHidden();

  await documents.click();
  await jobActions.click();
  await expect(preview).toBeHidden();
  await expect(archive).toBeVisible();
  await documents.click();
  await expect(archive).toBeHidden();
  await expect(preview).toBeVisible();

  await component.locator('.job-editor-surface').click({ position: { x: 10, y: 10 } });
  await expect(preview).toBeHidden();
  await expect(archive).toBeHidden();
  await page.keyboard.press('Tab');
});

test('job shell keeps its accepted desktop layout and responsive fallback at required widths', async ({ mount, page }) => {
  const component = await mount(<JobEditorWorkbenchHarness/>);
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1440, height: 800 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 1100, height: 720 },
    { width: 1024, height: 720 },
    { width: 900, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    const switcher = component.getByRole('group', { name: 'Door workspace view' });
    if (viewport.width > 1440) await expect(switcher).toBeHidden();
    else await expect(switcher).toBeVisible();
    await expect(component.locator('.app-context-bar')).toBeVisible();
    const headerHeight = await component.locator('.app-context-bar').evaluate((element) => element.getBoundingClientRect().height);
    expect(headerHeight).toBeGreaterThanOrEqual(92);
    expect(headerHeight).toBeLessThanOrEqual(100);
    await expect(component.getByRole('region', { name: 'Job actions' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    const actions = await component.getByRole('region', { name: 'Job actions' }).evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(actions.scrollWidth).toBeLessThanOrEqual(actions.clientWidth);
    const widths = await component.evaluate((root) => Object.fromEntries([
      ['fulfillmentPlan', '#fulfillmentPlan'], ['shopDate', '#shopDate'], ['notes', '#notes'],
    ].map(([name, selector]) => [name, root.querySelector(selector)!.getBoundingClientRect().width])));
    expect(widths.fulfillmentPlan).toBeGreaterThanOrEqual(160);
    expect(widths.shopDate).toBeGreaterThanOrEqual(128);
    expect(widths.notes).toBeGreaterThanOrEqual(288);
    const doorWidths: Record<string, number> = {};
    for (const name of ['Jamb Width', 'Jamb Type', 'Hinge Color', 'Material', 'Custom Slab / RO', 'Door Thickness']) {
      doorWidths[name] = await component.getByRole('combobox', { name, exact: true }).evaluate((element) => element.getBoundingClientRect().width);
      expect(doorWidths[name]).toBeGreaterThanOrEqual(144);
    }
    await expect(component.locator('.job-details-strip')).toHaveCount(0);
    const shellRows = await component.locator('.app-context-bar').evaluate((element) => new Set([...element.querySelectorAll('.app-job-context-field')].map((control) => getComputedStyle(control).gridRowStart)).size);
    expect(shellRows).toBe(3);
    const dividers = await component.evaluate((root) => Object.fromEntries([
      ['customer', '.job-shell-customer'], ['email', '.job-shell-email'], ['notes', '.job-shell-notes'],
      ['site', '.job-shell-site'], ['hours', '.job-shell-hours'], ['salesperson', '.job-shell-salesperson'], ['shopDate', '.job-shell-shop-date'],
    ].map(([name, selector]) => [name, root.querySelector(selector)!.getBoundingClientRect().left])));
    expect(Math.max(dividers.customer, dividers.email, dividers.notes) - Math.min(dividers.customer, dividers.email, dividers.notes)).toBeLessThanOrEqual(1);
    expect(Math.abs(dividers.site - dividers.hours)).toBeLessThanOrEqual(1);
    console.log(`responsive-metrics ${viewport.width}x${viewport.height} ${JSON.stringify({ mode: viewport.width > 1440 ? 'wide-side-by-side' : 'compact-tabs', headerHeight, shellRows, dividers, widths: { ...widths, ...doorWidths }, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth) })}`);
  }
});

test('shared glass builder stacks before laptop controls become compressed', async ({ mount, page }) => {
  await mount(<div className="app-workspace app-workspace-fluid"><StandaloneGlassCalculator/></div>);
  const workspace = page.locator('.glass-builder-workspace');
  await page.setViewportSize({ width: 1600, height: 900 });
  expect((await workspace.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length))).toBeGreaterThan(1);
  for (const viewport of [{ width: 1440, height: 800 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1100, height: 720 }, { width: 1024, height: 720 }, { width: 900, height: 700 }]) {
    await page.setViewportSize(viewport);
    const columns = await workspace.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(columns).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
});

test('new and saved jobs preserve lifecycle, hinge color, and lossless compact PO presentation', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const fresh = await mount(<JobEditorWorkbenchHarness/>);
  await expect(fresh.getByRole('combobox', { name: 'Job lifecycle', exact: true })).toHaveValue('Confirmed Job');
  await fresh.unmount();
  const saved = await mount(<JobEditorWorkbenchHarness saved/>);
  await expect(saved.getByRole('combobox', { name: 'Job lifecycle', exact: true })).toHaveValue('Draft');
  await saved.getByRole('combobox', { name: 'Job lifecycle', exact: true }).selectOption('Confirmed Job');
  await expect(saved.getByRole('combobox', { name: 'Job lifecycle', exact: true })).toHaveValue('Confirmed Job');
  await expect(saved.getByRole('combobox', { name: 'Hinge Color', exact: true })).toHaveValue('C15');
  await expect(saved.getByRole('textbox', { name: 'PO Number(s)', exact: true })).toHaveValue('100, 200');
  await expect(saved.getByRole('button', { name: 'Add PO' })).toHaveCount(0);
  const hingeTypeBox = await saved.getByRole('combobox', { name: 'Hinge Type', exact: true }).boundingBox();
  const hingeColorBox = await saved.getByRole('combobox', { name: 'Hinge Color', exact: true }).boundingBox();
  expect(Math.abs(hingeTypeBox!.y - hingeColorBox!.y)).toBeLessThan(2);
  expect(hingeColorBox!.x).toBeGreaterThan(hingeTypeBox!.x);
});

test('sparse Documents context uses one compact shell row without invented controls', async ({ mount, page }) => {
  await mount(<ContextTopBar density="compact" title="Documents" secondary="Document tools"/>);
  await prepareShell(page);
  for (const viewport of appShellViewports) {
    await page.setViewportSize(viewport);
    const shell = page.locator('.app-context-bar');
    const box = await shell.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeLessThanOrEqual(52);
    await expect(shell.getByRole('heading', { name: 'Documents' })).toBeVisible();
    await expect(shell.getByText('Document tools')).toBeVisible();
    await expect(shell.locator('button, input, select')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
});

test('Glass Calculator page context stays compact without duplicating builder Reset', async ({ mount, page }) => {
  await mount(<ContextTopBar density="compact" title="Glass Calculator" secondary="Local calculation workspace"/>);
  await prepareShell(page);
  for (const viewport of appShellViewports) {
    await page.setViewportSize(viewport);
    const shell = page.locator('.app-context-bar');
    const box = await shell.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeLessThanOrEqual(52);
    await expect(shell.getByRole('heading', { name: 'Glass Calculator' })).toBeVisible();
    await expect(shell.getByRole('button', { name: /Reset/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
});

test('Home identity remains a sparse compact shell row', async ({ mount, page }) => {
  await mount(<ContextTopBar density="compact" title="Home" secondary="Barrett"/>);
  await prepareShell(page);
  for (const viewport of appShellViewports) {
    await page.setViewportSize(viewport);
    const shell = page.locator('.app-context-bar');
    const box = await shell.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeLessThanOrEqual(52);
    await expect(shell.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(shell.getByText('Barrett')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
});

test('Account shell keeps identity and Sign out compact and contained', async ({ mount, page }) => {
  await mount(<ContextTopBar density="compact" title="Account" secondary="Barrett" actions={<form action="/auth/logout" method="post"><button className="app-button app-button-secondary">Sign out</button></form>}/>);
  await prepareShell(page);
  for (const viewport of appShellViewports) {
    await page.setViewportSize(viewport);
    const shell = page.locator('.app-context-bar');
    const [shellBox, actionBox] = await Promise.all([shell.boundingBox(), shell.getByRole('button', { name: 'Sign out' }).boundingBox()]);
    expect(shellBox!.height).toBeGreaterThanOrEqual(44);
    expect(shellBox!.height).toBeLessThanOrEqual(52);
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(shellBox!.x + shellBox!.width + 1);
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(shellBox!.y + shellBox!.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
});

test('Account body uses a flat responsive details grid and permissions table', async ({ mount, page }) => {
  const component = await mount(<AppShell navigation={[]} scrollOwner="main" topBar={<ContextTopBar density="compact" title="Account" secondary="Barrett" actions={<button className="app-button app-button-secondary">Sign out</button>}/>}><Workspace className="account-workspace" width="fluid"><WorkspaceSurface className="account-workspace-surface"><h2 className="account-section-heading">Account details</h2><dl className="account-details-grid"><div><dt>Display name</dt><dd>Barrett Example</dd></div><div><dt>Account state</dt><dd>Active</dd></div><div><dt>Manager</dt><dd>Yes</dd></div><div><dt>Company/location</dt><dd>DoorGo Vancouver Operations</dd></div><div><dt>Password</dt><dd>Password setup complete</dd></div></dl><h2 className="account-section-heading account-permissions-heading">Module permissions</h2><table className="account-permissions-table"><thead><tr><th>Module</th><th>Access</th></tr></thead><tbody>{['Production', 'Production checkpoints', 'Calendar', 'Jobs', 'Documents', 'Tools', 'Reports', 'Settings', 'Users'].map((module) => <tr key={module}><td>{module}</td><td>USE</td></tr>)}</tbody></table></WorkspaceSurface></Workspace></AppShell>);
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 720 }]) {
    await page.setViewportSize(viewport);
    const main = component.locator('.app-shell-main');
    const shell = component.locator('.app-context-bar');
    const workspace = component.locator('.app-workspace-region');
    const surface = component.locator('.app-workspace-surface');
    const details = page.locator('.account-details-grid');
    const columns = await details.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(columns).toBe(viewport.width >= 1200 ? 3 : 2);
    await expect(main).toHaveAttribute('data-scroll-owner', 'main');
    await expect(main).toHaveCSS('overflow-y', 'auto');
    const [shellBox, workspaceBox, surfaceBox, tableBox] = await Promise.all([shell.boundingBox(), workspace.boundingBox(), surface.boundingBox(), component.getByRole('table').boundingBox()]);
    expect(shellBox!.height).toBe(48);
    expect(Math.abs(workspaceBox!.y - (shellBox!.y + shellBox!.height))).toBeLessThanOrEqual(1);
    expect(surfaceBox!.x).toBeGreaterThan(workspaceBox!.x);
    expect(surfaceBox!.x + surfaceBox!.width).toBeLessThan(workspaceBox!.x + workspaceBox!.width);
    expect(tableBox!.x).toBeGreaterThanOrEqual(surfaceBox!.x);
    expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(surfaceBox!.x + surfaceBox!.width + 1);
    await expect(page.locator('.account-workspace-surface')).toHaveCSS('border-radius', '0px');
    await expect(surface).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('button', { name: /USE/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
  await page.setViewportSize({ width: 1024, height: 360 });
  const main = component.locator('.app-shell-main');
  const scrollFit = await main.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(scrollFit.scrollHeight).toBeGreaterThan(scrollFit.clientHeight);
  await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('standalone Glass shell explicitly bounds its workspace while the builder retains internal scrolling', async ({ mount, page }) => {
  const component = await mount(<AppShell navigation={[]} scrollOwner="workspace" topBar={<ContextTopBar density="compact" title="Glass Calculator" secondary="Local calculation workspace"/>} bottomBar={<ContextBottomBar label="Glass Calculator actions" status="Local calculation · no save required" actions={<div id="glass-calculator-bottom-actions"/>}/>}><Workspace className="glass-calculator-workspace" width="fluid"><StandaloneGlassCalculator/></Workspace></AppShell>);
  const main = component.locator('.app-shell-main');
  const shell = component.locator('.app-context-bar');
  const workspace = component.locator('.glass-calculator-workspace');
  const surface = component.locator('.glass-unit-builder');
  const internal = component.locator('.glass-builder-workspace');
  const bottom = component.getByRole('region', { name: 'Glass Calculator actions' });
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1440, height: 800 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1100, height: 720 }, { width: 1024, height: 720 }, { width: 900, height: 700 }]) {
    await page.setViewportSize(viewport);
    await expect(main).toHaveAttribute('data-scroll-owner', 'workspace');
    await expect(main).toHaveAttribute('data-has-top-bar', 'true');
    await expect(main).toHaveAttribute('data-has-bottom-bar', 'true');
    await expect(main).toHaveCSS('overflow-y', 'hidden');
    await expect(workspace).toHaveCSS('overflow-y', 'hidden');
    await expect(internal).toHaveCSS('overflow-y', viewport.width > 1440 ? 'hidden' : 'auto');
    await expect(surface).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const columns = await internal.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(columns).toBe(viewport.width > 1440 ? 2 : 1);
    const [mainBox, shellBox, workspaceBox, surfaceBox, bottomBox] = await Promise.all([main.boundingBox(), shell.boundingBox(), workspace.boundingBox(), surface.boundingBox(), bottom.boundingBox()]);
    expect(shellBox!.height).toBe(48);
    expect(workspaceBox!.y).toBe(shellBox!.y + shellBox!.height);
    expect(workspaceBox!.y + workspaceBox!.height).toBe(bottomBox!.y);
    expect(bottomBox!.y + bottomBox!.height).toBe(mainBox!.y + mainBox!.height);
    expect(surfaceBox!.x).toBeGreaterThanOrEqual(workspaceBox!.x);
    expect(surfaceBox!.x + surfaceBox!.width).toBeLessThanOrEqual(workspaceBox!.x + workspaceBox!.width);
    await expect(bottom.getByRole('button', { name: 'Send unavailable' })).toBeDisabled();
    await expect(surface.getByRole('button', { name: 'Reset calculation editor' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
  await page.setViewportSize({ width: 1280, height: 500 });
  const fit = await internal.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(fit.scrollHeight).toBeGreaterThan(fit.clientHeight);
  await internal.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await internal.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await workspace.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
  await page.setViewportSize({ width: 1600, height: 900 });
  expect(await internal.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length)).toBe(2);
});

test('wide Job Editor keeps shell rows bounded while Job Lines owns overflowing saved-line scrolling', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<JobEditorWorkbenchHarness lineCount={18} saved/>);
  const main = component.locator('.app-shell-main');
  const workspace = component.locator('.job-editor-workspace');
  const lines = component.locator('.job-lines-pane');
  const header = component.locator('.app-context-bar');
  const bottom = component.getByRole('region', { name: 'Job actions' });
  await expect(main).toHaveAttribute('data-scroll-owner', 'workspace');
  await expect(main).toHaveCSS('overflow-y', 'hidden');
  await expect(workspace).toHaveCSS('overflow-y', 'hidden');
  await expect(lines).toHaveCSS('overflow-y', 'auto');
  const [mainBox, headerBox, workspaceBox, bottomBox] = await Promise.all([main.boundingBox(), header.boundingBox(), workspace.boundingBox(), bottom.boundingBox()]);
  expect(headerBox!.height).toBe(96);
  expect(workspaceBox!.y).toBe(headerBox!.y + headerBox!.height);
  expect(workspaceBox!.y + workspaceBox!.height).toBe(bottomBox!.y);
  expect(bottomBox!.y + bottomBox!.height).toBe(mainBox!.y + mainBox!.height);
  const fit = await lines.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(fit.scrollHeight).toBeGreaterThan(fit.clientHeight);
  await lines.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await lines.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await workspace.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(component.getByRole('group', { name: 'Door workspace view' })).toBeVisible();
  await expect(workspace).toHaveCSS('overflow-y', 'auto');
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(component.getByRole('group', { name: 'Door workspace view' })).toBeHidden();
  await expect(workspace).toHaveCSS('overflow-y', 'hidden');
  await expect(lines).toHaveCSS('overflow-y', 'auto');
});

test('Documents uses explicit main scrolling with a neutral fluid workspace and independent card surfaces', async ({ mount, page }) => {
  const component = await mount(<AppShell navigation={[]} scrollOwner="main" topBar={<ContextTopBar density="compact" title="Documents" secondary="Document tools"/>}><Workspace width="fluid"><section className="grid gap-2 md:grid-cols-2">{DOORGO_DOCUMENT_DEFINITIONS.map((definition) => <article className="app-workspace-panel rounded-lg p-4" key={definition.key}><h2 className="text-base font-semibold">{definition.label}</h2><p className="mt-1 text-sm text-slate-600">{definition.description}</p><p className="mt-2 text-xs text-slate-500">{definition.availability}</p><a className="app-button app-button-primary mt-3" href={definition.entryHref}>Open {definition.label}</a></article>)}</section><p className="text-xs text-slate-500">DoorGo does not yet have a persisted document library. Future document types require separately approved contracts.</p></Workspace></AppShell>);
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 720 }, { width: 900, height: 700 }]) {
    await page.setViewportSize(viewport);
    const main = component.locator('.app-shell-main');
    const shell = component.locator('.app-context-bar');
    const workspace = component.locator('.app-workspace-region');
    const cards = component.locator('.app-workspace-panel');
    await expect(main).toHaveAttribute('data-scroll-owner', 'main');
    await expect(main).toHaveCSS('overflow-y', 'auto');
    await expect(workspace).toHaveCSS('background-color', 'rgb(238, 243, 248)');
    await expect(component.locator('.app-workspace-surface')).toHaveCount(0);
    const [shellBox, workspaceBox, firstCardBox, secondCardBox] = await Promise.all([shell.boundingBox(), workspace.boundingBox(), cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
    expect(shellBox!.height).toBe(48);
    expect(Math.abs(workspaceBox!.y - (shellBox!.y + shellBox!.height))).toBeLessThanOrEqual(1);
    expect(firstCardBox!.x).toBeLessThan(secondCardBox!.x);
    expect(Math.abs(firstCardBox!.y - secondCardBox!.y)).toBeLessThanOrEqual(1);
    await expect(cards.nth(0)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
  await page.setViewportSize({ width: 900, height: 240 });
  const main = component.locator('.app-shell-main');
  const fit = await main.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(fit.scrollHeight).toBeGreaterThan(fit.clientHeight);
  await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('explicit bounded shell mode transfers scrolling to the neutral workspace between fixed shell rows', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const component = await mount(<AppShell navigation={[]} scrollOwner="workspace" topBar={<ContextTopBar density="compact" title="Bounded workspace"/>} bottomBar={<ContextBottomBar label="Bounded actions" status="Ready"/>}><Workspace width="fluid"><div style={{ minHeight: '1400px' }}>Bounded content</div></Workspace></AppShell>);
  const main = component.locator('.app-shell-main');
  const workspace = component.locator('.app-workspace-region');
  const top = component.locator('.app-context-bar');
  const bottom = component.getByRole('region', { name: 'Bounded actions' });
  await expect(main).toHaveCSS('overflow-y', 'hidden');
  await expect(workspace).toHaveCSS('overflow-y', 'auto');
  const [mainBox, topBox, workspaceBox, bottomBox] = await Promise.all([main.boundingBox(), top.boundingBox(), workspace.boundingBox(), bottom.boundingBox()]);
  expect(workspaceBox!.y).toBe(topBox!.y + topBox!.height);
  expect(workspaceBox!.y + workspaceBox!.height).toBe(bottomBox!.y);
  expect(bottomBox!.y + bottomBox!.height).toBe(mainBox!.y + mainBox!.height);
  const fit = await workspace.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(fit.scrollHeight).toBeGreaterThan(fit.clientHeight);
  await workspace.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await workspace.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
});

test('Edit Schedule keeps primary date navigation ahead of compact secondary tools', async ({ mount, page }) => {
  for (const viewport of appShellViewports) {
    await page.setViewportSize(viewport);
    const component = await mount(<BoardNavigationHarness editable/>);
    const shell = component.locator('.app-context-bar');
    const navigation = component.getByLabel('Production Schedule date window');
    const tools = component.getByLabel('Edit Schedule tools');
    await expect(tools.getByRole('link', { name: 'Past Schedule' })).toBeVisible();
    await expect(tools.getByRole('link', { name: 'Carry Checkpoint' })).toBeVisible();
    const [shellBox, navigationBox, toolsBox] = await Promise.all([shell.boundingBox(), navigation.boundingBox(), tools.boundingBox()]);
    expect(shellBox!.height).toBeGreaterThanOrEqual(60);
    expect(shellBox!.height).toBeLessThanOrEqual(68);
    expect(navigationBox!.x).toBeLessThan(toolsBox!.x);
    expect(toolsBox!.x + toolsBox!.width).toBeLessThanOrEqual(shellBox!.x + shellBox!.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await component.unmount();
  }
});

test('actual native job editor keeps its three-level header, door workbench, and save actions in one laptop viewport', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const component = await mount(<JobEditorWorkbenchHarness/>);
  await expect(component.locator('.app-context-bar')).toBeVisible();
  await expect(component.locator('.app-shell-sidebar')).toBeVisible();
  await expect(component.locator('.app-context-title')).toHaveText('DG-000123');
  await expect(component.locator('.app-context-title')).toHaveCSS('text-overflow', 'clip');
  await expect(component.locator('.app-context-bar').getByRole('link', { name: 'Jobs' })).toHaveCount(0);
  await expect(component.getByRole('region', { name: 'Job actions' })).toBeVisible();
  await expect(component.getByRole('textbox', { name: 'PO Number(s)', exact: true })).toBeVisible();
  await expect(component.getByRole('textbox', { name: 'Job Notes', exact: true })).toBeVisible();
  await expect(component.locator('.app-context-bar').getByRole('textbox', { name: 'PO Number(s)', exact: true })).toBeVisible();
  await expect(component.locator('.app-context-bar').getByRole('textbox', { name: 'Job Notes', exact: true })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Add Door' })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Save and Exit' })).toBeVisible();
  const inputFit = await component.locator('.door-input-pane').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(inputFit.scrollHeight).toBeLessThanOrEqual(inputFit.clientHeight);
  const regions = await component.evaluate((root) => {
    const top = root.querySelector('.app-context-bar')!.getBoundingClientRect();
    const workspace = root.querySelector('.job-editor-workspace')!.getBoundingClientRect();
    const bottom = root.querySelector('.app-context-bottom-bar')!.getBoundingClientRect();
    return { topBottom: top.bottom, workspaceTop: workspace.top, workspaceBottom: workspace.bottom, bottomTop: bottom.top };
  });
  expect(regions.workspaceTop).toBeGreaterThanOrEqual(regions.topBottom);
  expect(regions.workspaceBottom).toBeLessThanOrEqual(regions.bottomTop);
  await page.setViewportSize({ width: 1600, height: 900 });
  const largeRegions = await component.evaluate((root) => {
    const top = root.querySelector('.app-context-bar')!.getBoundingClientRect();
    const workspace = root.querySelector('.job-editor-workspace')!.getBoundingClientRect();
    const bottom = root.querySelector('.app-context-bottom-bar')!.getBoundingClientRect();
    return { topBottom: top.bottom, workspaceTop: workspace.top, workspaceBottom: workspace.bottom, bottomTop: bottom.top };
  });
  expect(largeRegions.workspaceTop).toBeGreaterThanOrEqual(largeRegions.topBottom);
  expect(largeRegions.workspaceBottom).toBeLessThanOrEqual(largeRegions.bottomTop);
  await page.setViewportSize({ width: 1280, height: 720 });
  await component.getByRole('textbox', { name: 'Customer', exact: true }).fill('Changed Customer');
  await expect(component.getByRole('region', { name: 'Job actions' })).toContainText('Unsaved changes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await component.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('With SL / T');
  const glassWorkbench = component.locator('.glass-unit-builder');
  await expect(glassWorkbench).toBeVisible();
  await component.getByRole('button', { name: 'Add right sidelight' }).click();
  await component.getByRole('button', { name: 'Add left sidelight' }).click();
  await component.getByLabel('RO Width (inches)').fill('60');
  await component.getByLabel('RO Width (inches)').blur();
  await component.getByLabel('RO Height (inches)').fill('96');
  await component.getByLabel('RO Height (inches)').blur();
  await component.getByRole('button', { name: 'Add transom' }).click();
  await expect(component.getByRole('region', { name: 'Shared sidelight specification' }).locator('label').filter({ hasText: /^Sidelight Type/ })).toHaveCount(1);
  await expect(component.getByRole('button', { name: 'Add Door to Order' })).toBeVisible();
  const glassFit = await glassWorkbench.locator('> div').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
  expect(glassFit.overflowY).toBe('auto');
  expect(glassFit.scrollHeight).toBeGreaterThanOrEqual(glassFit.clientHeight);
  await glassWorkbench.locator('> div').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(component.getByRole('button', { name: 'Add Door to Order' })).toBeInViewport();
  await expect(glassWorkbench.locator('footer')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test('job header keeps a clean Shop Hours label while automatic and manual values retain authority', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const component = await mount(<EffectiveShopHoursHarness/>);
  const shopHours = component.getByRole('spinbutton', { name: 'Shop Hours', exact: true });
  const shellLabel = component.locator('.job-shell-hours > span');
  await expect(shopHours).toHaveValue('6.5');
  await expect(shellLabel).toHaveText('Shop Hours');
  await expect(shellLabel).not.toContainText('Estimated');
  await shopHours.fill('6');
  await expect(shopHours).toHaveValue('6');
  await expect(shellLabel).toHaveText('Shop Hours');
  await expect(shellLabel).not.toContainText('Manual');
  await shopHours.fill('');
  await expect(shopHours).toHaveValue('6.5');
  await expect(shellLabel).toHaveText('Shop Hours');
});

test('standalone Glass Calculator uses the shared live builder result and a purpose-built print document', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await mount(<div className="app-workspace app-workspace-fluid"><StandaloneGlassCalculator/></div>);
  const editor = page.locator('.glass-calculator-editor');
  const results = editor.getByLabel('Calculated measurements');
  await expect(editor).toBeVisible();
  await expect(page.getByRole('region', { name: 'Glass Calculator actions' })).toBeVisible();
  await expect(results).toBeVisible();
  await expect(page.getByRole('region', { name: 'Glass Calculator actions' }).getByRole('button', { name: /Send/ })).toHaveCount(0);
  await expect(page.locator('.app-context-bar').getByRole('button', { name: 'Print' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update Result' })).toHaveCount(0);
  await expect(page.locator('.glass-unit-builder[role="dialog"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add left sidelight' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add right sidelight' })).toBeVisible();
  const sharedGlassType = page.getByRole('region', { name: 'Shared sidelight specification' }).locator('label').filter({ hasText: /^Glass Type/ }).locator('select');
  await expect(sharedGlassType).toHaveCount(1);
  await expect(sharedGlassType).toHaveValue('CLEAR');
  const printInputs = page.locator('.glass-calculator-print').getByLabel('Glass calculation inputs');
  await expect(printInputs).toContainText('T-bar2.25');
  await page.getByLabel('Unit T-bar Size').selectOption('1.5');
  await expect(printInputs).toContainText('T-bar1.5');
  await page.getByRole('button', { name: 'Remove left sidelight' }).click();
  await expect(printInputs).toContainText('T-barNot applicable');
  await page.getByRole('button', { name: 'Add left sidelight' }).click();
  await page.getByLabel('Unit T-bar Size').selectOption('2.25');
  await expect(editor.locator('.glass-unit-diagram')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add right sidelight' }).click();
  await page.getByRole('button', { name: 'Add left sidelight' }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  let workspaceFit = await page.locator('.glass-unit-builder > div').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(workspaceFit.scrollHeight).toBeLessThanOrEqual(workspaceFit.clientHeight);
  await page.getByLabel('RO Height (inches)').fill('96');
  await page.getByLabel('RO Height (inches)').blur();
  await page.getByRole('button', { name: 'Add transom' }).click();
  workspaceFit = await page.locator('.glass-unit-builder > div').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(workspaceFit.scrollHeight).toBeLessThanOrEqual(workspaceFit.clientHeight);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Remove transom' }).click();
  await page.getByRole('button', { name: 'Remove left sidelight' }).click();
  await page.getByLabel('RO Height (inches)').fill('96');
  await page.getByLabel('RO Height (inches)').blur();
  await page.getByRole('button', { name: 'Add transom' }).click();
  const transomGlassType = page.getByLabel('Transom Glass Type');
  await expect(transomGlassType).toHaveValue('CLEAR');
  await expect(editor.getByText('Status: Complete', { exact: true })).toBeVisible();
  await expect(results.locator('[data-glass-result="transom"]')).toContainText('Transom:');
  await expect(editor.getByLabel('Calculated measurements')).toHaveCount(1);
  await transomGlassType.selectOption('SATIN_ETCH');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Remove transom' }).click();
  await page.getByLabel('RO Height (inches)').fill('96');
  await page.getByLabel('RO Height (inches)').blur();
  await page.getByRole('button', { name: 'Add transom' }).click();
  await expect(transomGlassType).toHaveValue('SATIN_ETCH');
  await transomGlassType.selectOption('CUSTOM');
  await expect(page.getByLabel('Custom Transom Glass Description')).toBeVisible();
  await expect(editor.getByText('Status: Glass Detail Needed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave Glass Detail Needed' })).toHaveCount(0);
  await expect(page.locator('.glass-calculator-results')).toBeHidden();
  workspaceFit = await page.locator('.glass-unit-builder > div').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(workspaceFit.scrollHeight).toBeLessThanOrEqual(workspaceFit.clientHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: 'Glass Calculation printout' })).toBeVisible();
  await expect(page.getByText('DoorGo', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Glass Calculation' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Glass Calculation printout' })).toContainText('Jamb legs');
  await expect(page.getByRole('region', { name: 'Glass Calculation printout' })).toContainText('Header / sill / T-bar');
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add right sidelight' })).toBeHidden();
});

test('shared Glass Unit Builder keeps left and right topology independent of swing', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await mount(<div className="app-workspace app-workspace-fluid"><StandaloneGlassCalculator/></div>);
  const configuration = page.locator('.glass-unit-builder header').locator('p');
  await expect(configuration).toHaveText('SD');
  await page.getByRole('button', { name: 'Remove left sidelight' }).click();
  await expect(configuration).toHaveText('D');
  await page.getByRole('button', { name: 'Add right sidelight' }).click();
  await expect(configuration).toHaveText('DS');
  await page.getByLabel('Swing').selectOption('RH');
  await expect(configuration).toHaveText('DS');
  await page.getByRole('button', { name: 'Add left sidelight' }).click();
  await expect(configuration).toHaveText('SDS');
  await page.getByRole('button', { name: 'Add left sidelight' }).click();
  await page.getByRole('button', { name: 'Add right sidelight' }).click();
  await expect(configuration).toHaveText('SSDSS');
  await page.getByRole('button', { name: 'Add transom' }).click();
  await expect(configuration).toHaveText('T/SSDSS');
  await page.getByRole('button', { name: 'Double Door' }).click();
  await expect(configuration).toHaveText('T/SSDDSS');
  await page.getByLabel('RO Width (inches)').fill('140');
  await page.getByLabel('RO Width (inches)').blur();
  await page.getByLabel('RO Height (inches)').fill('110');
  await page.getByLabel('RO Height (inches)').blur();
  await expect(page.getByRole('region', { name: 'Shared sidelight specification' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Shared sidelight specification' }).locator('label').filter({ hasText: /^Glass Type/ })).toHaveCount(1);
  await expect(page.locator('[data-glass-result="sidelights"]')).toHaveCount(1);
  await expect(page.locator('[data-glass-result="sidelights"]')).toContainText('4 total (2 left / 2 right)');
  await expect(page.locator('[data-glass-result="transom"]')).toBeVisible();
  const fit = await page.locator('.glass-unit-builder > div').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test('T/DD exposes 1.5 and preserves 2.25 through calculation and print output', async ({ mount, page }) => {
  await mount(<div className="app-workspace app-workspace-fluid"><StandaloneGlassCalculator/></div>);
  await page.getByRole('button', { name: 'Remove left sidelight' }).click();
  await page.getByRole('button', { name: 'Double Door' }).click();
  await page.getByLabel('Slab Width').selectOption(`2'6"`);
  await page.getByLabel('Swing').selectOption('LHOUT');
  await page.getByLabel('RO Width (inches)').fill('62 9/16');
  await page.getByLabel('RO Width (inches)').blur();
  await page.getByLabel('RO Height (inches)').fill('95');
  await page.getByLabel('RO Height (inches)').blur();
  await page.getByRole('button', { name: 'Add transom' }).click();

  const tBar = page.getByLabel('Transom T-bar Size');
  await expect(page.locator('.glass-unit-builder header').locator('p')).toHaveText('T/DD');
  await expect(tBar.locator('option')).toHaveText(['1-1/2 inch', '2-1/4 inch']);
  await expect(tBar).toHaveValue('2.25');
  await expect(page.locator('[data-glass-result="transom"]')).toContainText('60 7/16" × 11 1/8"');
  await tBar.selectOption('1.5');
  await expect(tBar).toHaveValue('1.5');
  await expect(page.getByLabel('Calculated measurements')).toContainText('/ 1 1/2"');
  await expect(page.locator('[data-glass-result="transom"]')).toContainText('60 7/16" × 11 7/8"');
  await expect(page.locator('.glass-calculator-print').getByLabel('Glass calculation inputs')).toContainText('T-bar1.5');
  await expect(page.locator('.glass-calculator-print')).toContainText('60 7/16" × 11 7/8"');
});

test('T/DDS selected T-bar recalculates shared transom height and print output', async ({ mount, page }) => {
  await mount(<div className="app-workspace app-workspace-fluid"><StandaloneGlassCalculator/></div>);
  await page.getByRole('button', { name: 'Double Door' }).click();
  await page.getByLabel('Slab Width').selectOption(`2'6"`);
  await page.getByLabel('Swing').selectOption('LHOUT');
  await page.getByLabel('RO Width (inches)').fill('80');
  await page.getByLabel('RO Width (inches)').blur();
  await page.getByLabel('RO Height (inches)').fill('95');
  await page.getByLabel('RO Height (inches)').blur();
  await page.getByRole('button', { name: 'Add transom' }).click();

  const tBar = page.getByLabel('Unit T-bar Size');
  await expect(page.locator('.glass-unit-builder header').locator('p')).toHaveText('T/SDD');
  await page.getByRole('button', { name: 'Remove left sidelight' }).click();
  await page.getByRole('button', { name: 'Add right sidelight' }).click();
  await expect(page.locator('.glass-unit-builder header').locator('p')).toHaveText('T/DDS');
  await expect(tBar.locator('option')).toHaveText(['1-1/2 inch', '2-1/4 inch']);
  await tBar.selectOption('2.25');
  await expect(page.locator('[data-glass-result="transom"]')).toContainText('11 1/8"');
  await tBar.selectOption('1.5');
  await expect(page.locator('[data-glass-result="transom"]')).toContainText('11 7/8"');
  await expect(page.locator('.glass-calculator-print').getByLabel('Glass calculation inputs')).toContainText('T-bar1.5');
  await expect(page.locator('.glass-calculator-print')).toContainText('11 7/8"');
});

test('flexible exterior topology exposes structural Shop Hours in Job Lines', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<FlexibleShopHoursHarness/>);
  await expect(component.getByText('Shop Hours: 9 · Estimated', { exact: true })).toBeVisible();
  await expect(component.getByText(/Qty 1 · Door · 9 shop hrs/)).toBeVisible();
  await expect(component.getByText(/— shop hrs/)).toHaveCount(0);
});

test('busy production days collapse explicitly and keep every booking reachable', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = (index: number): ProductionBoardCard => ({
    bookingId: `busy-${index}`, type: 'doorgo_linked', typeLabel: 'DoorGo-linked', productionDate: '2026-08-11',
    title: `Booking ${index}`, customer: `Customer ${index}`, jobId: `DG-${String(index).padStart(6, '0')}`,
    calendarId: null, calendarEventId: null, shopHours: 1, shopHoursKnown: true, salesperson: 'Barrett',
    source: null, sourceSystem: null, bookingKind: null, locked: false, completedAt: null,
  });
  const day: ProductionBoardDayModel = {
    date: '2026-08-11', dateState: 'today', totalKnownShopHours: 9, bookingCount: 9, missingShopHoursCount: 0,
    availableHours: 8, staffCapacityHours: 8, deductionHours: 0, capacitySource: 'calculated', capacityKnown: true,
    isClosed: false, isExplicitlyClosed: false, capacityNotes: null, remainingHours: 2, overloadHours: 0,
    plannedStarts: 6, plannedStartsKnown: true, openingCarryIn: 0, openingCarryKnown: true, calculatedOpeningCarry: 0,
    actualOpeningCarry: 0, authoritativeOpeningCarry: 0, adjustmentHours: 0, hasActualCarryCheckpoint: true,
    checkpointId: 'checkpoint-1', checkpointProductionDate: '2026-08-11', checkpointRevisionNumber: 4, checkpointRecordedAt: '2026-08-11T18:00:00Z',
    checkpointRecordedByUserId: null, checkpointConfirmedAt: null, checkpointConfirmedByUserId: null,
    checkpointActorType: null, checkpointSourceSystem: null, checkpointNote: null, checkpointCalculationVersion: null,
    flowLoad: 9, endingCarryOut: 1, openFlowCapacity: 8, flowStatus: 'resolved', flowUnresolvedReason: null,
    weekendBookingException: false, cards: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(card),
  };
  await mount(<ProductionBoardDay day={day}/>);
  await expect(page.getByText('✓ Carry checkpoint recorded · 0.00 hrs actual')).toBeVisible();
  await expect(page.getByText(/Revision 4/)).toHaveCount(0);
  await expect(page.locator('.production-booking-card')).toHaveCount(6);
  const expansion = page.getByRole('button', { name: '+ 3 more' });
  await expect(expansion).toBeVisible();
  await expect(expansion).toHaveAttribute('aria-expanded', 'false');
  await expansion.click();
  await expect(page.locator('.production-booking-card')).toHaveCount(9);
  await expect(page.getByText('Booking 9', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
});

test('entry and login contracts render branded, accessible actions without an app rail', async ({ mount, page }) => {
  await mount(<ContextTopBar title="fixture"/>);
  await page.evaluate(() => {
    document.body.innerHTML = `<main class="doorgo-entry"><section class="doorgo-entry-card"><img src="/brand/doorgo-mark.svg" alt="DoorGo"><p>Door Shop Operations</p><h1>DoorGo</h1><p>Measure. Build. Schedule.</p><a href="/login">Sign In</a></section></main>`;
  });
  await expect(page.getByRole('img', { name: 'DoorGo' })).toBeVisible();
  await expect(page.getByText('Door Shop Operations')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
  await expect(page.locator('.app-shell-sidebar')).toHaveCount(0);
  await page.evaluate(() => {
    document.body.innerHTML = `<main class="doorgo-entry"><img src="/brand/doorgo-mark.svg" alt="DoorGo"><h1>Sign in to DoorGo</h1><form><label>Email<input type="email" required></label><label>Password<input type="password" required></label><button>Sign in</button></form></main>`;
  });
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('.app-shell-sidebar')).toHaveCount(0);
});

test('shared navigation guard blocks dirty links, stays safely, and clears after save', async ({ mount, page }) => {
  await mount(<UnsavedNavigationHarness/>);
  const customer = page.getByLabel('Customer');
  await customer.fill('Unsaved customer');
  await page.getByRole('link', { name: 'Account' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  await expect(customer).toHaveValue('Unsaved customer');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(customer).toHaveValue('Unsaved customer');
  await page.getByRole('button', { name: 'Save fixture' }).click();
  await page.getByRole('link', { name: 'Account' }).click();
  await expect(dialog).toHaveCount(0);
});
