import Image from 'next/image';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';

export default async function HomePage() {
  const access = await getCurrentDoorGoAccess();
  if (access.state === 'unauthenticated') return <main className="doorgo-entry"><section className="doorgo-entry-card"><Image src="/brand/doorgo-mark.svg" alt="DoorGo" width={112} height={112} priority/><div><p className="doorgo-entry-kicker">Door Shop Operations</p><h1>DoorGo</h1><p className="doorgo-entry-tagline">Measure. Build. Schedule.</p></div><p className="doorgo-entry-copy">The door-shop workflow application for preparing jobs and coordinating production.</p><Link className="app-button app-button-primary" href="/login">Sign In</Link></section></main>;
  const destinations = buildProtectedAppNavigation(access).filter((item) => item.href !== '/' && item.href !== '/account');
  return <AppShell navigation={buildProtectedAppNavigation(access)} topBar={<ContextTopBar title="Home" secondary={access.profile?.displayName || 'DoorGo'}/>}><div className="app-workspace"><section className="app-workspace-panel rounded-xl p-5"><p className="text-sm text-slate-600">Choose an available DoorGo workspace.</p><nav className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="DoorGo workspaces">{destinations.map((item) => <Link className="rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-900 transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" href={item.href} key={item.href}>{item.label}<span className="mt-1 block text-sm font-normal text-slate-500">Open workspace</span></Link>)}</nav></section></div></AppShell>;
}
