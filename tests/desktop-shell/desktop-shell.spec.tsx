import { expect, test } from '@playwright/experimental-ct-react';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';

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
});

test('phone fallback leaves the contextual bar non-sticky', async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(<ContextTopBar title="Jobs" secondary="Native DoorGo jobs" />);
  await prepareShell(page);
  await expect(page.locator('.app-context-bar')).toHaveCSS('position', 'static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});
