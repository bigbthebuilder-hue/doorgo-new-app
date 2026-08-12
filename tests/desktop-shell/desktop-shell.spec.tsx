import { expect, test } from '@playwright/experimental-ct-react';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { UnsavedNavigationHarness } from './UnsavedNavigationHarness';
import { ProductionBookingCard } from '@/components/ProductionBookingCard';
import { ProductionBoardDay } from '@/components/ProductionBoardDay';
import { ProductionBoardSummary } from '@/components/ProductionBoardSummary';
import { BoardNavigationHarness } from './BoardNavigationHarness';
import { DoorLineWorkspaceHarness } from './DoorLineWorkspaceHarness';
import { JobsWorkspace } from '@/components/jobs/JobsWorkspace';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';
import type { ProductionBoardCard, ProductionBoardDay as ProductionBoardDayModel, ProductionBoardViewModel } from '@/lib/production-board/types';
import type { NativeJobListItem } from '@/lib/jobs/job-intake-types';

const desktopShellLabels = ['Production Board', 'Production Schedule', 'Past Schedule', 'Carry Checkpoint', 'Glass Calculator', 'Account'];

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
      if (label === 'Production Schedule') link.setAttribute('aria-current', 'page');
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
  await expect(page.getByText('Production Schedule', { exact: true }).locator('..')).toHaveAttribute('aria-current', 'page');
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
  expect(height).toBeLessThanOrEqual(92);
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
    weeks: 1, days: [], weekGroups: [], calculationStartDate: '2026-08-10',
    summary: { totalBookings: 4, totalKnownShopHours: 12, scheduledDays: 3, doorGoLinkedCount: 2, bizTrackOnlyCount: 2, missingShopHoursCount: 0 },
  } satisfies ProductionBoardViewModel;
  await mount(<ProductionBoardSummary board={board}/>);
  await expect(page.getByText('Bookings', { exact: true })).toBeVisible();
  await expect(page.getByText('DoorGo-linked', { exact: true })).toHaveCount(0);
  await expect(page.getByText('BizTrack-only', { exact: true })).toHaveCount(0);
});

test('read-only Production Board navigation changes only the viewed week in the sticky top bar', async ({ mount, page }) => {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const component = await mount(<BoardNavigationHarness/>);
    for (const label of ['Home', 'Production Board', 'Production Schedule', 'Past Schedule', 'Carry Checkpoint', 'Jobs', 'Glass Calculator', 'Account']) await expect(component.getByRole('link', { name: label })).toBeVisible();
    const navigation = component.getByLabel('Production Board date window');
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
  await expect(page.getByRole('link', { name: 'New Draft Job' })).toBeVisible();
  await expect(page.locator('.app-context-bar').getByRole('heading', { name: 'Jobs' })).toBeVisible();
  await expect(page.locator('.app-shell-main > .app-workspace').getByText('Filter jobs')).toHaveCount(0);
  await expect(page.getByPlaceholder(/salesperson/i)).toHaveCount(0);
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
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
    for (const label of ['Door Type', 'Configuration', 'Width', 'Height', 'Swing', 'Prep', 'Quantity', 'Jamb Width', 'Jamb Type', 'Hinge Type', 'Material', 'Sill', 'Weatherstrip', 'Custom Slab / RO', 'Door Thickness']) await expect(component.getByLabel(label, { exact: true })).toBeVisible();
    await expect(component.getByText('More Details', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await component.unmount();
  }
});

test('standalone Glass Calculator embeds one interactive diagram beside a purpose-built print result', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await mount(<div className="app-workspace app-workspace-fluid"><StandaloneGlassCalculator/></div>);
  const editor = page.locator('.glass-calculator-editor');
  const results = page.locator('.glass-calculator-results');
  await expect(editor).toBeVisible();
  await expect(results).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send unavailable' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Update Result' })).toHaveCount(0);
  await expect(page.locator('.glass-unit-builder[role="dialog"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add left sidelight' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add right sidelight' })).toBeVisible();
  await expect(editor.locator('.glass-unit-diagram')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove left sidelight' }).click();
  await page.getByLabel('RO Height (inches)').fill('96');
  await page.getByLabel('RO Height (inches)').blur();
  await page.getByRole('button', { name: 'Add transom' }).click();
  const transomGlassType = page.getByLabel('Transom Glass Type');
  await expect(transomGlassType).toHaveValue('CLEAR');
  await expect(results.getByText('Complete', { exact: true }).first()).toBeVisible();
  await expect(results.getByText('Transom product size', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Calculated measurements')).toHaveCount(0);
  await transomGlassType.selectOption('SATIN_ETCH');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Remove transom' }).click();
  await page.getByLabel('RO Height (inches)').fill('96');
  await page.getByLabel('RO Height (inches)').blur();
  await page.getByRole('button', { name: 'Add transom' }).click();
  await expect(transomGlassType).toHaveValue('SATIN_ETCH');
  await transomGlassType.selectOption('CUSTOM');
  await expect(page.getByLabel('Custom Transom Glass Description')).toBeVisible();
  await expect(results.getByText('Glass Detail Needed', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave Glass Detail Needed' })).toHaveCount(0);
  const editorBox = await editor.boundingBox(); const resultsBox = await results.boundingBox();
  expect((resultsBox?.x ?? 0)).toBeGreaterThan((editorBox?.x ?? 0));
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: 'Glass Calculation printout' })).toBeVisible();
  await expect(page.getByText('DoorGo', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Glass Calculation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add right sidelight' })).toBeHidden();
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
