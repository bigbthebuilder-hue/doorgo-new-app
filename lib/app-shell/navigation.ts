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
  const items: AppNavigationItem[] = [{ href: '/', label: 'Home', icon: 'home', match: 'exact' }];

  if (hasAtLeastView(access, 'calendar')) {
    items.push({ href: '/calendar', label: 'Calendar', icon: 'schedule', match: 'section', showOnHome: true });
  }

  if (hasAtLeastView(access, 'production')) {
    items.push({ ...productionBoard, label:'Production Board' });
  }
  if(hasAtLeastView(access,'production_checkpoints'))items.push({href:'/production-checkpoints',label:'Production Checkpoints',icon:'checkpoint',match:'section',showOnHome:true});
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

export function protectedLandingDestination(access:CurrentDoorGoAccess):string{
  if(hasAtLeastView(access,'calendar'))return '/calendar';
  if(hasAtLeastView(access,'jobs'))return '/jobs';
  if(hasAtLeastView(access,'production'))return '/production-board';
  if(hasAtLeastView(access,'production_checkpoints'))return '/production-checkpoints';
  if(hasAtLeastView(access,'documents'))return '/documents';
  return '/account';
}
