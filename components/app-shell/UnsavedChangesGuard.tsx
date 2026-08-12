'use client';

import Link, { type LinkProps } from 'next/link';
import { createContext, type MouseEvent, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

type GuardContextValue = {
  dirty: boolean;
  register: (id: string, dirty: boolean) => void;
  unregister: (id: string) => void;
  requestNavigation: (href: string) => void;
};

const GuardContext = createContext<GuardContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const registrations = useRef(new Map<string, boolean>());
  const [dirty, setDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const refreshDirty = useCallback(() => setDirty([...registrations.current.values()].some(Boolean)), []);
  const register = useCallback((id: string, nextDirty: boolean) => {
    registrations.current.set(id, nextDirty);
    refreshDirty();
  }, [refreshDirty]);
  const unregister = useCallback((id: string) => {
    registrations.current.delete(id);
    refreshDirty();
  }, [refreshDirty]);
  const requestNavigation = useCallback((href: string) => {
    if (registrations.current.size && [...registrations.current.values()].some(Boolean)) setPendingHref(href);
    else window.location.assign(href);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const preventExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventExit);
    return () => window.removeEventListener('beforeunload', preventExit);
  }, [dirty]);

  useEffect(() => {
    if (!pendingHref) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPendingHref(null);
      }
      if (event.key === 'Tab' && dialog.current) trapDialogFocus(event, dialog.current);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus(); };
  }, [pendingHref]);

  const value = useMemo(() => ({ dirty, register, unregister, requestNavigation }), [dirty, register, unregister, requestNavigation]);
  return <GuardContext.Provider value={value}>
    {children}
    {pendingHref ? <div className="app-unsaved-overlay" role="presentation">
      <section aria-describedby="unsaved-changes-description" aria-labelledby="unsaved-changes-title" aria-modal="true" className="app-unsaved-dialog" ref={dialog} role="alertdialog">
        <h2 id="unsaved-changes-title">Unsaved changes</h2>
        <p id="unsaved-changes-description">You have changes that have not been saved. Leave this page and discard them?</p>
        <div className="app-unsaved-dialog-actions">
          <button className="app-button app-button-secondary" onClick={() => setPendingHref(null)} ref={stayButton} type="button">Stay</button>
          <button className="app-button app-button-danger" onClick={() => { const href = pendingHref; setPendingHref(null); window.location.assign(href); }} type="button">Leave without saving</button>
        </div>
      </section>
    </div> : null}
  </GuardContext.Provider>;
}

export function useUnsavedChanges(dirty: boolean) {
  const context = useContext(GuardContext);
  const register = context?.register;
  const unregister = context?.unregister;
  const id = useId();
  useEffect(() => {
    if (!register || !unregister) return;
    register(id, dirty);
    return () => unregister(id);
  }, [dirty, id, register, unregister]);
}

export function useGuardedNavigation() {
  const context = useContext(GuardContext);
  return context?.requestNavigation ?? ((href: string) => window.location.assign(href));
}

export function GuardedLink({ href, onClick, ...props }: LinkProps & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & { children: ReactNode }) {
  const requestNavigation = useGuardedNavigation();
  const dirty = useContext(GuardContext)?.dirty ?? false;
  const destination = typeof href === 'string' ? href : href.pathname ?? '/';
  function guard(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank') return;
    if (!dirty) return;
    event.preventDefault(); requestNavigation(destination);
  }
  return <Link {...props} href={href} onClick={guard}/>;
}

export function UnsavedChangesDialog({ open, onStay, onDiscard, title = 'Unsaved changes', description }: {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
  title?: string;
  description: string;
}) {
  const stayButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onStay(); }
      if (event.key === 'Tab' && dialog.current) trapDialogFocus(event, dialog.current);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus(); };
  }, [open, onStay]);
  if (!open) return null;
  return <div className="app-unsaved-overlay app-unsaved-overlay--workspace" role="presentation"><section aria-describedby="local-unsaved-description" aria-labelledby="local-unsaved-title" aria-modal="true" className="app-unsaved-dialog" ref={dialog} role="alertdialog"><h2 id="local-unsaved-title">{title}</h2><p id="local-unsaved-description">{description}</p><div className="app-unsaved-dialog-actions"><button className="app-button app-button-secondary" onClick={onStay} ref={stayButton} type="button">Stay</button><button className="app-button app-button-danger" onClick={onDiscard} type="button">Leave without saving</button></div></section></div>;
}

function trapDialogFocus(event: KeyboardEvent, container: HTMLElement) {
  const nodes = [...container.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]')].filter((node) => !node.hasAttribute('disabled') && node.tabIndex >= 0);
  if (!nodes.length) return;
  const first = nodes[0]; const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
