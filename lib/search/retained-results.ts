export type SearchSnapshot<T> = { query: string; scope: string; items: T[]; error: string | null };

// A broader query still matches server-only fields (e.g. note details) even when
// the result projection omits them. A narrower query must match known fields
// until the authoritative search responds. Never reuse across permission scopes.
export function retainedSearchItems<T>(snapshot: SearchSnapshot<T> | null, query: string, scope: string,
  enabled: boolean, matches: (item: T, query: string) => boolean): T[] {
  const value = query.trim();
  if (!enabled || !value || snapshot?.scope !== scope) return [];
  if (snapshot.query === value) return snapshot.items;
  return snapshot.items.filter(item => matches(item, value) || snapshot.query.toLocaleLowerCase().includes(value.toLocaleLowerCase()));
}
