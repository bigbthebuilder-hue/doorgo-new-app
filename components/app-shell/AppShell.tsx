import type { ReactNode } from 'react';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';
import { DesktopNav } from './DesktopNav';

export function AppShell({ children, navigation }: { children: ReactNode; navigation: AppNavigationItem[] }) {
  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar">
        <div className="app-shell-brand" title="DoorGo · Door Shop Operations">
          <span className="app-shell-brand-mark" aria-hidden="true">D</span>
          <span className="app-shell-brand-copy"><strong>DoorGo</strong><small>Door Shop Operations</small></span>
        </div>
        <DesktopNav items={navigation}/>
      </aside>
      <main className="app-shell-main">{children}</main>
    </div>
  );
}
