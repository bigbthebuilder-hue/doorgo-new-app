import { hasAtLeastView, type CurrentDoorGoAccess } from '../auth/access';

export type AppNavigationIcon = 'home' | 'account' | 'calculator' | 'jobs' | 'production' | 'recovery' | 'schedule' | 'checkpoint';

export type AppNavigationItem = {
  href: string;
  label: string;
  icon: AppNavigationIcon;
  match?: 'exact' | 'section';
  placement?: 'bottom';
};

const productionBoard: AppNavigationItem = {
  href: '/production-board',
  label: 'Production Board',
  icon: 'production',
  match: 'exact',
};

export function buildPublicAppNavigation(): AppNavigationItem[] {
  return [productionBoard];
}

export function isAppNavigationItemActive(pathname: string, item: AppNavigationItem): boolean {
  return item.match === 'section'
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}

export function buildProtectedAppNavigation(access: CurrentDoorGoAccess): AppNavigationItem[] {
  const items: AppNavigationItem[] = [{ href: '/', label: 'Home', icon: 'home', match: 'exact' }, productionBoard];

  if (hasAtLeastView(access, 'production')) {
    items.push(
      { href: '/production-schedule', label: 'Production Schedule', icon: 'schedule' },
      { href: '/production-recovery', label: 'Past Schedule', icon: 'recovery' },
    );
  }
  if (hasAtLeastView(access, 'production_checkpoints')) {
    items.push({ href: '/production-checkpoints', label: 'Carry Checkpoint', icon: 'checkpoint' });
  }
  if (hasAtLeastView(access, 'jobs')) {
    items.push(
      { href: '/jobs', label: 'Jobs', icon: 'jobs', match: 'section' },
      { href: '/glass-calculator', label: 'Glass Calculator', icon: 'calculator' },
    );
  }

  items.push({ href: '/account', label: 'Account', icon: 'account', placement: 'bottom' });
  return items;
}
