import { expect, test } from '@playwright/experimental-ct-react';
import { AppShell } from '@/components/app-shell/AppShell';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { resolveCurrentDoorGoAccess } from '@/lib/auth/access';

function navigation(jobs: 'view' | 'use') {
  return buildProtectedAppNavigation(resolveCurrentDoorGoAccess({
    user: { id: 'navigation-fixture' },
    profile: { user_id: 'navigation-fixture', display_name: 'Staff', active: true, is_manager: false, company_location: null, must_change_password: false },
    permissionRows: [{ permission_key: 'jobs', access_level: jobs }, { permission_key: 'calendar', access_level: 'view' }],
  }));
}

for (const width of [1440, 390]) {
  test(`sidebar New Job uses the existing route at ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    const shell = await mount(<AppShell navigation={navigation('use')}><p>Workspace</p></AppShell>);
    const create = shell.getByRole('link', { name: '+ New Job', exact: true });
    await expect(create).toBeVisible();
    await expect(create).toHaveAttribute('href', '/jobs/new');
    await expect(create).toHaveAttribute('aria-current', 'page');
    await expect(shell.getByRole('link', { name: 'Jobs', exact: true })).not.toHaveAttribute('aria-current');
    await expect(shell.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
    await expect(shell.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
    await page.route('**/jobs/new', route => route.fulfill({ contentType: 'text/html', body: '<h1>Existing New Job route</h1>' }));
    await create.click();
    await expect(page).toHaveURL(/\/jobs\/new$/);
  });
}

test('Jobs view has no creation shortcut', async ({ mount }) => {
  const shell = await mount(<AppShell navigation={navigation('view')}><p>Workspace</p></AppShell>);
  await expect(shell.getByRole('link', { name: '+ New Job', exact: true })).toHaveCount(0);
  await expect(shell.getByRole('link', { name: 'Jobs', exact: true })).toBeVisible();
});
