import type { ReactNode } from 'react';

export function Workspace({ children, className, width = 'default' }: {
  children: ReactNode;
  className?: string;
  width?: 'default' | 'fluid' | 'focused';
}) {
  const widthClass = width === 'fluid' ? ' app-workspace-fluid' : width === 'focused' ? ' app-workspace-focused' : '';
  return <div className={`app-workspace app-workspace-region${widthClass}${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function WorkspaceSurface({ children, className }: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`app-workspace-surface${className ? ` ${className}` : ''}`}>{children}</section>;
}
