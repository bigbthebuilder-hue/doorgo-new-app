import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';

export function LegacyJobImportShell({ children, editorActive, navigation }: { children: ReactNode; editorActive: boolean; navigation: AppNavigationItem[] }) {
  return <AppShell
    hasBottomBar={editorActive}
    hasTopBar={editorActive}
    navigation={navigation}
    scrollOwner={editorActive ? 'workspace' : 'main'}
  >{children}</AppShell>;
}
