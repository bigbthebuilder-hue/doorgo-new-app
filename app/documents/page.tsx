import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { DOORGO_DOCUMENT_DEFINITIONS } from '@/lib/documents/document-definitions';

export default async function DocumentsPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'documents')) redirect('/account');
  return <AppShell navigation={buildProtectedAppNavigation(access)} topBar={<ContextTopBar density="compact" title="Documents" secondary="Document tools"/>}><div className="app-workspace app-workspace-fluid"><section className="grid gap-2 md:grid-cols-2">{DOORGO_DOCUMENT_DEFINITIONS.map((definition) => {
    const permitted = hasAtLeastView(access, 'jobs');
    return <article className="app-workspace-panel rounded-lg p-4" key={definition.key}><h2 className="text-base font-semibold">{definition.label}</h2><p className="mt-1 text-sm text-slate-600">{definition.description}</p><p className="mt-2 text-xs text-slate-500">{definition.availability}</p>{permitted ? <Link className="app-button app-button-primary mt-3" href={definition.entryHref}>Open {definition.label}</Link> : <p className="mt-3 text-sm font-semibold text-slate-500">Your current permissions do not expose this tool.</p>}</article>;
  })}</section><p className="text-xs text-slate-500">DoorGo does not yet have a persisted document library. Future document types require separately approved contracts.</p></div></AppShell>;
}
