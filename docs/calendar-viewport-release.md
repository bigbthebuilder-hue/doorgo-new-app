# Calendar viewport correction — production acceptance pending

Baseline: `2d0894f13038b33c01f5f09ea131137886756e75`.

Confirmed source defects: Calendar Open Job return links encoded the cached range start instead of the visible week; ordinary scrolling did not persist a date anchor; bare return routes initialized to today; prepend replayed scrollTop/scrollHeight captured before a network request; refresh scheduled an unguarded later frame even when its data merge could be rejected; initial/deep-link/search work could scroll after newer user input. Existing polling cadence and authorization are unchanged.

The shared viewport hook persists a validated account/device-local week and relative position, merges browser history metadata, and owns layout/reflow anchoring for all Calendar exits/returns and board updates. Delayed navigation is generation-guarded. No migrations, scheduling/capacity changes or hosted data writes.

## Acceptance status

Local unit, TypeScript, lint and production build checks passed. All 69 Windows browser checks passed across the verification runs, including both fixture corrections. Work Chromium cannot start because the environment rejects its singleton socket. Fixture views do not establish authenticated multi-user verification. On November 24, 2026, the user approved release before the two-account manual check; that check will run against production and final acceptance remains open.

Before closing this issue, use two independent authenticated sessions on desktop and phone. Position each at different past/future weeks, including month/year boundaries. Observe ordinary authorized business updates from the other session without adding artificial production records. Confirm data updates without moving the view. Exercise Open Job, Exit, Save and Exit, Go to Calendar, work order and label previews, sidebar and browser history; repeat while a response is delayed and while scrolling. Verify Today/date/search navigation still wins. Final manual production acceptance remains open even after automated tests pass.
