# Production flow checkpoint actions contract (Phase 2F-C3)

Checkpoint mutations cross a server-only boundary. Thin Next.js Server Actions accept untrusted request objects and delegate to a service that creates the existing cookie-aware authenticated Supabase client and verifies identity with `auth.getUser()`. It never uses a service-role or admin client.

Requests carry a caller-generated command UUID so retries retain the database idempotency contract. The application strictly validates UUIDs, real `YYYY-MM-DD` dates without local-time conversion, bounded two-decimal hour values, revision numbers, text limits, and unexpected fields before invoking one of the three approved RPCs.

The database remains authoritative for active-profile and dedicated `production_checkpoints = use` authorization, Vancouver future-date rules, stale revisions, history consistency, idempotency, and UUID collisions. The application has no manager or broad production-permission fallback and performs no direct checkpoint-table writes.

Successful rows are checked and converted into a limited camelCase DTO. Numeric strings must use ordinary decimal notation, and timestamps must be valid with an explicit `Z` or numeric offset. Raw rows, user identity columns, response metadata, and SQL errors are not returned. Known `checkpoint.*` failures match complete error tokens exactly; unknown failures remain sanitized. The result is a discriminated `{ ok: true, checkpoint } | { ok: false, code, message, fieldErrors? }` union.

C3 adds no UI, routes, redirects, cache revalidation, migrations, Production Board changes, or Calendar behavior. Future UI work belongs to C4.
