import { canUse, hasAtLeastView, type CurrentDoorGoAccess } from '../auth/access';

export type AppNavigationIcon = 'home' | 'account' | 'calculator' | 'documents' | 'jobs' | 'production' | 'recovery' | 'schedule' | 'checkpoint' | 'manager';

export type AppNavigationItem = {
  href: string;
  label: string;
  icon: AppNavigationIcon;
  match?: 'exact' | 'section';
  placement?: 'bottom';
  prominent?: boolean;
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
  if (item.href === '/jobs' && pathname === '/jobs/new') return false;
  return item.match === 'section'
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}

export function buildProtectedAppNavigation(access: CurrentDoorGoAccess): AppNavigationItem[] {
  const items: AppNavigationItem[] = [];
  if (canUse(access, 'jobs')) {
    items.push({ href: '/jobs/new', label: '+ New Job', icon: 'jobs', match: 'exact', prominent: true });
  }

  if (hasAtLeastView(access, 'calendar')) {
    items.push({ href: '/calendar', label: 'Calendar', icon: 'schedule', match: 'section', showOnHome: true });
  }

  if (hasAtLeastView(access, 'production')) {
    items.push({ ...productionBoard, label:'Production Board' });
  }
  if(hasAtLeastView(access,'production_checkpoints'))items.push({href:'/production-checkpoints',label:'Production Checkpoints',icon:'checkpoint',match:'section',showOnHome:true});
  if(hasAtLeastView(access,'settings') || hasAtLeastView(access,'users'))items.push({href:'/manager',label:'Admin',icon:'manager',match:'section',showOnHome:true});
  if (hasAtLeastView(access, 'documents')) items.push({ href: '/documents', label: 'Documents', icon: 'documents', match: 'section', showOnHome: true });
  if (hasAtLeastView(access, 'jobs')) {
    items.push({ href: '/jobs', label: 'Jobs', icon: 'jobs', match: 'section', showOnHome: true });
  }
  if (hasAtLeastView(access, 'tools')) {
    items.push({ href: '/glass-calculator', label: 'Glass Calculator', icon: 'calculator', showOnHome: true });
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
  if(hasAtLeastView(access,'tools'))return '/glass-calculator';
  if(hasAtLeastView(access,'settings') || hasAtLeastView(access,'users'))return '/manager';
  return '/account';
}
