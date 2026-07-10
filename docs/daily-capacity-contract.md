# Daily capacity contract

This table is a resolved bridge contract for read-only daily capacity.

Apps Script remains the operational bridge and data-preparation tool. During the bridge period it publishes resolved daily capacity rows into Supabase. The Next.js application reads those rows and uses them as the authoritative read contract.

## Resolution precedence

The resolved row contract uses the following precedence when a row is published:

1. override
2. closure
3. calculated
4. unknown

A missing row or a row with `capacity_source = 'unknown'` means capacity is unknown, not zero.

## Important rules

- `production_date` is a date-only `YYYY-MM-DD` business date.
- The bridge must publish rows without converting the date through browser-local timestamps.
- Explicit shop closures are represented with `available_hours = 0`, `is_closed = true`, and `capacity_source = 'closure'`.
- The Next.js app consumes the resolved rows and does not recompute staffing rules during the bridge period.
- No staff values are hardcoded in Next.js.
- Future Supabase-native staffing, absence, closure, and override management remains intentionally deferred.
