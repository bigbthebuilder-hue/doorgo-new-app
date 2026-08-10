'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isAppNavigationItemActive, type AppNavigationIcon, type AppNavigationItem } from '@/lib/app-shell/navigation';

export function DesktopNav({ items }: { items: AppNavigationItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="app-shell-nav" aria-label="DoorGo application navigation">
      {items.map((item) => {
        const active = isAppNavigationItemActive(pathname, item);
        return (
          <Link
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className="app-shell-nav-link"
            href={item.href}
            key={item.href}
            title={item.label}
          >
            <NavIcon name={item.icon}/>
            <span className="app-shell-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function NavIcon({ name }: { name: AppNavigationIcon }) {
  const paths: Record<AppNavigationIcon, React.ReactNode> = {
    production: <><path d="M4 5h16v14H4z"/><path d="M8 9h2v6H8zm5-2h2v8h-2zm5 4h2v4h-2"/></>,
    schedule: <><path d="M5 4h14v16H5zM8 2v4m8-4v4M5 9h14"/><path d="M8 13h3m2 0h3m-8 3h3"/></>,
    recovery: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v4l3 2"/></>,
    checkpoint: <><path d="M6 3h12v18H6zM9 7h6m-6 4h6m-6 4h4"/><path d="m15 17 1.5 1.5L20 15"/></>,
    jobs: <><path d="M4 6h16v14H4zM9 6V4h6v2M4 11h16"/><path d="M10 11v2h4v-2"/></>,
    calculator: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 6h8v4H8zm0 8h2m3 0h2m-7 3h2m3 0h2"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  };
  return <svg className="app-shell-nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
