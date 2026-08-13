import type { ReactNode } from 'react';
import { GuardedLink } from './UnsavedChangesGuard';

export function ContextTopBar({ title, secondary, status, controls, actions, backHref, backLabel = 'Back' }: {
  title: string;
  secondary?: ReactNode;
  status?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="app-context-bar">
      {backHref ? <GuardedLink className="app-context-back" href={backHref} aria-label={backLabel} title={backLabel}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></svg><span>{backLabel}</span></GuardedLink> : null}
      <div className="app-context-primary">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="app-context-title">{title}</h1>
          {status}
        </div>
        {secondary ? <div className="app-context-secondary">{secondary}</div> : null}
      </div>
      {controls ? <div className="app-context-controls">{controls}</div> : null}
      {actions ? <div className="app-context-actions">{actions}</div> : null}
    </header>
  );
}
