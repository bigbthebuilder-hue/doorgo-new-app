# Search continuity — verified for release

Baseline: `43295f9423c536f360676aa04551bd51abe36177` (accepted Calendar viewport release).

## Source audit and correction

The Calendar toolbar computed immediate local matches but its pending branch replaced the complete dropdown with Searching. Quick Add cleared matches on each keystroke and did not mark the debounce as pending, briefly showing a false empty state. The Note linked-job picker also cleared options on input and lacked rejection feedback. Jobs filtering is synchronous and remains unchanged; the remaining entry controls are native selectors/free-text fields, not additional asynchronous search interfaces.

All three asynchronous searches now share generation-guarded request handling with retained relevant options; both job pickers reuse one adapter. Results remain selectable and keyed during background work. Only empty pending searches display Searching, settled current empty searches display No results, and failures remain distinct. Clear synchronously invalidates replies and closes/empties results. Server matching, permission checks, result limits, historical/future coverage and Calendar viewport/navigation authority are unchanged. No schema, RPC, dependency, saved-record or sizing changes.

## Verification

Retained-result unit checks, TypeScript, lint (two existing warnings), Calendar pending/performance, continuous-range, return-navigation and viewport unit checks passed. Production build passed. Work browser execution was blocked by the environment singleton-socket permission. Windows verification passed all 82 browser tests: 13 search, 14 viewport, 43 permissions and 12 stability checks. The retained-search unit check also passed on Windows.

The pre-existing `verify-calendar-quick-add-corrections.mjs` icon assertion references `calendar-expanded-production`, which does not exist in baseline `43295f9`. That baseline failure is unrelated to search; the asynchronous catch guard was updated to the shared hook without altering unrelated production markup.

The new browser suite covers rapid typing, debounce, deleting/refining, selecting while pending, stale/empty/error responses, clearing, linked-job selection, Jobs filtering, narrow/desktop layouts and dates outside the initial loaded range. The existing viewport/permissions/stability suites passed. Manual production checks should confirm normal mouse/touch/keyboard searches and selected-date navigation after deployment. Release is authorized; this verification record does not itself establish a production deployment. No Supabase changes or migrations are included.
