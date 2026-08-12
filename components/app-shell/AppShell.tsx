import type { ReactNode } from 'react';
import Image from 'next/image';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';
import { DesktopNav } from './DesktopNav';
import { UnsavedChangesProvider } from './UnsavedChangesGuard';

export function AppShell({ children, navigation, topBar }: {
  children: ReactNode;
  navigation: AppNavigationItem[];
  topBar?: ReactNode;
}) {
  return (
    <UnsavedChangesProvider><div className="app-shell">
      <aside className="app-shell-sidebar">
        <div className="app-shell-brand" title="DoorGo · Door Shop Operations">
          <Image className="app-shell-brand-mark" src="/brand/doorgo-mark.svg" alt="DoorGo" width={44} height={44} priority />
        </div>
        <DesktopNav items={navigation}/>
      </aside>
      <main className="app-shell-main">
        {topBar}
        {children}
      </main>
    </div></UnsavedChangesProvider>
  );
}
