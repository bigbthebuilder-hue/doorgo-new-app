'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { retainedSearchItems, type SearchSnapshot } from '@/lib/search/retained-results';

type SearchReply<T> = { ok: true; items: T[] } | { ok: false; message: string };

// Debouncing is pending work too. Keep a useful, query-filtered snapshot while
// fetching, and invalidate synchronously on input/selection (before effect cleanup).
export function useRetainedSearch<T>({ query, scope, enabled = true, delay, load, matches, failureMessage }: {
  query: string; scope: string; enabled?: boolean; delay: number;
  load: (query: string) => Promise<SearchReply<T>>;
  matches: (item: T, query: string) => boolean;
  failureMessage: string;
}) {
  const value = query.trim();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<SearchSnapshot<T> | null>(null);
  const invalidate = useCallback((clear = false) => {
    generation.current += 1;
    if (clear) setSnapshot(null);
  }, []);

  useEffect(() => {
    const token = ++generation.current;
    if (!enabled || !value) return;
    const timer = window.setTimeout(() => {
      void load(value).catch((): SearchReply<T> => ({ ok: false, message: failureMessage })).then(reply => {
        if (token !== generation.current) return;
        setSnapshot(previous => ({ query: value, scope,
          items: reply.ok ? reply.items : retainedSearchItems(previous, value, scope, true, matches),
          error: reply.ok ? null : reply.message }));
      });
    }, delay);
    return () => { generation.current += 1; window.clearTimeout(timer); };
  }, [query, value, scope, enabled, delay, load, matches, failureMessage]);

  const active = enabled && Boolean(value);
  const sameQuery = snapshot?.scope === scope && snapshot.query === value;
  const items = retainedSearchItems(snapshot, value, scope, enabled, matches);
  return { items, pending: active && !sameQuery, error: active && sameQuery ? snapshot.error : null, invalidate };
}
