import type { ReactNode } from 'react';

export function ContextTopBar({ title, secondary, status, controls, actions }: {
  title: string;
  secondary?: ReactNode;
  status?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="app-context-bar">
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
