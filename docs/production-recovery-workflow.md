# Past Scheduled Bookings (Phase 2F-D3)

Past Scheduled Bookings is a private, permission-scoped workflow for reviewing
recent past production bookings. DoorGo does not infer that a past booking is
unfinished. An employee must decide that the whole job was not started before
moving that booking to today.

The default view covers the five previous Monday-to-Friday business days in
America/Vancouver. A compact older-date search accepts a bounded past date
range. `production = view` may read the list, while `production = use` may also
confirm a move. Missing or `none` access provides neither navigation nor data;
manager, Calendar, and checkpoint permissions provide no fallback.

Booking cards remain single-column on phones and use at most two columns on
desktop. DoorGo-origin bookings are labeled `DoorGo-linked` and show an
available `Job` identifier; BizTrack-origin bookings are labeled
`BizTrack-only` and show an available `Sales order` identifier. Raw origin
values are not employee-facing labels. An open confirmation card spans the
desktop grid so the approved confirmation content remains readable.

The confirmation shows today's existing planned and available capacity using
the trusted Production Board calculation. Closure, unknown capacity, and
projected overload warnings never block an otherwise valid move. Partly
completed jobs remain on their original date, with only remaining hours entered
in Actual carry. A moved whole job's hours must not be included in Actual carry.

This workflow never moves work automatically, performs bulk or partial moves,
changes booking hours, creates carry, changes capacity, or offers undo. It uses
the native DoorGo booking RPC and has no Google Calendar or Apps Script runtime
behavior.
