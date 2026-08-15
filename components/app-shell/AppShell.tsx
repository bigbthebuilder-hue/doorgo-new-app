import type { ReactNode } from 'react';
import Image from 'next/image';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';
import { DesktopNav } from './DesktopNav';
import { UnsavedChangesProvider } from './UnsavedChangesGuard';

export type AppShellScrollOwner = 'main' | 'workspace';

export function AppShell({ children, navigation, topBar, bottomBar, scrollOwner, hasTopBar = false, hasBottomBar = false }: {
  children: ReactNode;
  navigation: AppNavigationItem[];
  topBar?: ReactNode;
  bottomBar?: ReactNode;
  scrollOwner?: AppShellScrollOwner;
  hasTopBar?: boolean;
  hasBottomBar?: boolean;
}) {
  return (
    <UnsavedChangesProvider><div className="app-shell">
      <aside className="app-shell-sidebar">
        <div className="app-shell-brand" title="DoorGo · Door Shop Operations">
          <Image className="app-shell-brand-mark" src="/brand/doorgo-mark.svg" alt="DoorGo" width={44} height={44} priority />
        </div>
        <DesktopNav items={navigation}/>
      </aside>
      <main className="app-shell-main" data-has-bottom-bar={bottomBar || hasBottomBar ? 'true' : undefined} data-has-top-bar={topBar || hasTopBar ? 'true' : undefined} data-scroll-owner={scrollOwner}>
        {topBar}
        {children}
        {bottomBar}
      </main>
    </div></UnsavedChangesProvider>
  );
}
