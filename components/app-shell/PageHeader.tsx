import type { ReactNode } from 'react';

export function PageHeader({ title, description, badge, actions }: {
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="app-page-header">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="app-page-title">{title}</h1>
          {badge}
        </div>
        {description ? <div className="app-page-description">{description}</div> : null}
      </div>
      {actions ? <div className="app-page-actions">{actions}</div> : null}
    </header>
  );
}
