import type { ReactNode } from 'react';

export function ContextBottomBar({ status, context, actions, label = 'Context actions' }: {
  status?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  label?: string;
}) {
  return <footer aria-label={label} className="app-context-bottom-bar" role="region">
    <div className="app-context-bottom-status" aria-live="polite">{status}</div>
    <div className="app-context-bottom-context">{context}</div>
    <div className="app-context-bottom-actions">{actions}</div>
  </footer>;
}
