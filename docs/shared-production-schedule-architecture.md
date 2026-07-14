# Shared Production Schedule architecture

Phase 2F-E2A presents the existing production Board through one server-rendered component tree and two small route wrappers. The extraction does not change booking normalization, capacity calculations, checkpoint-aware carry calculations, booking cards, or the default eight-week date window.

## Route boundaries

- `/production-board` remains anonymous and read-only. It performs no DoorGo authentication or permission lookup, passes no private navigation, and labels the shared view **Production Board** / **Read only**.
- `/production-schedule` is private. It resolves authenticated DoorGo access first, requires an active profile with `production=view` or `production=use`, and redirects denied access before calling the trusted read-only Board loader. Both permitted levels receive the same read-only schedule in E2A, labeled **Production Schedule** / **Schedule view**.
- The Account page exposes Production Schedule only when the same production permission is at least `view`.

The trusted loader remains a server-only read mechanism. On the private route it is invoked exactly once, after authorization; it is not itself treated as an authorization check. The public and private wrappers share the same date parsing, loader, normalized view model, summary, weekly/day layout, and booking-card presentation.

## Presentation and future controls

`ProductionBoardView` and its descendants remain Server Components. They receive only the normalized Board view model, safe title/status text, and an optional server-rendered header navigation slot. They do not import authentication, permission, database, Calendar, or mutation modules. The raw trusted result is not copied into a client-side DTO or refetched in the browser.

E2A adds no create, move, reschedule, correction, checkpoint, capacity, Shop Date, or Calendar controls. Day-level and booking-level action insertion points are intentionally deferred until a later mutation phase can define them without coupling private actions to the public component graph. Existing Technical details rendering is preserved without adding fields or increasing visibility.

No migration or Calendar runtime behavior is part of this phase.
