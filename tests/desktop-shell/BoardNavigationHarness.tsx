'use client';

import { useState } from 'react';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { ProductionWindowNavigation } from '@/components/ProductionScheduleNavigation';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import type { CurrentDoorGoAccess } from '@/lib/auth/access';

const access: CurrentDoorGoAccess = { state: 'active', user: { id: 'fixture-user', email: 'fixture@example.invalid' }, profile: { userId: 'fixture-user', displayName: 'Fixture', active: true, isManager: false, companyLocation: null, mustChangePassword: false }, permissions: { production: 'use', production_checkpoints: 'use', jobs: 'use' } };

export function BoardNavigationHarness() {
  const [href, setHref] = useState('');
  const navigation = buildProtectedAppNavigation(access);
  return <div className="app-shell"><aside className="app-shell-sidebar"><nav aria-label="DoorGo application navigation">{navigation.map((item) => <a aria-label={item.label} href={item.href} key={item.href}>{item.label}</a>)}</nav></aside><main className="app-shell-main"><ContextTopBar actions={<ProductionWindowNavigation anchorMonday="2026-08-10" currentMonday="2026-08-17" label="Production Board date window" onNavigate={setHref} pathname="/production-board"/>} density="schedule" secondary="Aug 10 – Oct 2, 2026 · 8 weeks" status={<span>Read only</span>} title="Production Board"/><output data-testid="board-navigation-href">{href}</output><div className="h-[1400px]"/></main></div>;
}
