import { expect, test } from '@playwright/experimental-ct-react';
import { LegacyImportShellHarness } from './legacy-import-shell-harness';

const initialViewports = [
  { width: 1600, height: 900 }, { width: 1366, height: 768 },
  { width: 1280, height: 720 }, { width: 1024, height: 720 },
];
const editorViewports = [
  { width: 1600, height: 900 }, { width: 1440, height: 800 }, { width: 1366, height: 768 },
  { width: 1280, height: 720 }, { width: 1100, height: 720 }, { width: 1024, height: 720 },
  { width: 900, height: 700 }, { width: 1280, height: 500 },
];

test('legacy import changes explicit shell ownership at the existing editor transition', async ({ mount, page }) => {
  const component = await mount(<LegacyImportShellHarness/>);
  const main = component.locator('.app-shell-main');

  for (const viewport of initialViewports) {
    await page.setViewportSize(viewport);
    await expect(main).toHaveAttribute('data-scroll-owner', 'main');
    await expect(main).not.toHaveAttribute('data-has-bottom-bar');
    await expect(component.getByRole('region', { name: 'Job actions' })).toHaveCount(0);
    const geometry = await main.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
    expect(geometry.overflowY).toBe('auto');
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }

  await component.getByRole('button', { name: 'Accept fixture' }).click();
  await expect(main).toHaveAttribute('data-scroll-owner', 'workspace');
  await expect(main).toHaveAttribute('data-has-top-bar', 'true');
  await expect(main).toHaveAttribute('data-has-bottom-bar', 'true');

  for (const viewport of editorViewports) {
    await page.setViewportSize(viewport);
    const geometry = await component.evaluate((root) => {
      const shellMain = root.querySelector<HTMLElement>('.app-shell-main')!;
      const top = root.querySelector<HTMLElement>('.app-context-bar')!.getBoundingClientRect();
      const workspace = root.querySelector<HTMLElement>('.job-editor-workspace')!;
      const workspaceRect = workspace.getBoundingClientRect();
      const bottom = root.querySelector<HTMLElement>('.app-context-bottom-bar')!.getBoundingClientRect();
      return {
        mainClientHeight: shellMain.clientHeight, mainScrollHeight: shellMain.scrollHeight,
        mainOverflow: getComputedStyle(shellMain).overflowY,
        workspaceClientHeight: workspace.clientHeight, workspaceScrollHeight: workspace.scrollHeight,
        workspaceOverflow: getComputedStyle(workspace).overflowY,
        topBottom: top.bottom, workspaceTop: workspaceRect.top,
        workspaceBottom: workspaceRect.bottom, bottomTop: bottom.top,
      };
    });
    expect(geometry.mainOverflow).toBe('hidden');
    expect(geometry.mainScrollHeight).toBeLessThanOrEqual(geometry.mainClientHeight);
    expect(geometry.workspaceTop).toBeGreaterThanOrEqual(geometry.topBottom - 1);
    expect(geometry.workspaceBottom).toBeLessThanOrEqual(geometry.bottomTop + 1);
    if (viewport.width <= 1440) {
      expect(geometry.workspaceOverflow).toBe('auto');
      expect(geometry.workspaceScrollHeight).toBeGreaterThan(geometry.workspaceClientHeight);
      await component.locator('.job-editor-workspace').evaluate((element) => { element.scrollTop = 100; });
      await expect.poll(() => component.locator('.job-editor-workspace').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    }
    await expect(component.getByRole('region', { name: 'Job actions' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(main).toHaveAttribute('data-scroll-owner', 'workspace');
  await expect(component.getByRole('region', { name: 'Job actions' })).toBeInViewport();
});
