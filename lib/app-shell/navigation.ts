import { hasAtLeastView, type CurrentDoorGoAccess } from '../auth/access';

export type AppNavigationIcon = 'home' | 'account' | 'calculator' | 'documents' | 'jobs' | 'production' | 'recovery' | 'schedule' | 'checkpoint';

export type AppNavigationItem = {
  href: string;
  label: string;
  icon: AppNavigationIcon;
  match?: 'exact' | 'section';
  placement?: 'bottom';
  showOnHome?: boolean;
};

const productionBoard: AppNavigationItem = {
  href: '/production-board',
  label: 'View Schedule',
  icon: 'production',
  match: 'exact',
  showOnHome: true,
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

  if (hasAtLeastView(access, 'calendar')) {
    items.push({ href: '/calendar', label: 'Calendar', icon: 'schedule', match: 'section', showOnHome: true });
  }

  if (hasAtLeastView(access, 'production')) {
    items.push(
      { href: '/production-schedule', label: 'Edit Schedule', icon: 'schedule', match: 'section', showOnHome: true },
    );
  }
  if (hasAtLeastView(access, 'documents')) items.push({ href: '/documents', label: 'Documents', icon: 'documents', match: 'section', showOnHome: true });
  if (hasAtLeastView(access, 'jobs')) {
    items.push(
      { href: '/jobs', label: 'Jobs', icon: 'jobs', match: 'section', showOnHome: true },
      { href: '/glass-calculator', label: 'Glass Calculator', icon: 'calculator', showOnHome: true },
    );
  }

  items.push({ href: '/account', label: 'Account', icon: 'account', placement: 'bottom' });
  return items;
}
