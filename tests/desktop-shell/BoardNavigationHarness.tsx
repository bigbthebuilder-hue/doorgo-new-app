'use client';

import { useState } from 'react';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { ProductionWindowNavigation } from '@/components/ProductionScheduleNavigation';

export function BoardNavigationHarness() {
  const [href, setHref] = useState('');
  return <div className="h-[900px] overflow-y-auto"><ContextTopBar actions={<ProductionWindowNavigation anchorMonday="2026-08-10" currentMonday="2026-08-17" label="Production Board date window" onNavigate={setHref} pathname="/production-board"/>} secondary="Aug 10 – Oct 2, 2026 · 8 weeks" title="Production Board"/><output data-testid="board-navigation-href">{href}</output><div className="h-[1400px]"/></div>;
}
