# DoorGo architecture reference

This reference helps maintainers and future Codex sessions locate authoritative code, understand feature boundaries, and choose focused verification before making changes. It is a navigation and dependency map, not a replacement for domain contracts or product decisions.

## Index

| Section | Status | Scope |
| --- | --- | --- |
| [01 — Application overview](01-application-overview.md) | Completed | Stack, routes, modules, dependencies, risks, and verification entry points |
| [02 — Database and data ownership](02-database-and-data-ownership.md) | Completed | Entities, identifiers, effective local SQL/RPC/trigger relationships, access boundaries and unresolved risks |
| [03 — Authentication and security](03-authentication-and-security.md) | Completed | Session flow, feature permissions, server/database enforcement and security-review boundaries |
| [04 — Door geometry and configuration](04-door-geometry-and-configuration.md) | Completed | Shared calculators, input authority, validation, persistence, diagrams and output dependencies |
| 05 — Calendar and production operations | Planned; not written | Scheduling, capacity, checkpoints, fulfillment, Staff Away |
| 06 — Services and deployment | Planned; not written | External integrations, environment roles, migration/release operations |
| 07 — Testing and change-impact guide | Planned; not written | Focused checks, harness boundaries, regression and manual acceptance matrix |

Planned sections are proposals, not existing documentation or authorization to implement them.

## Authority and maintenance

- Follow the current task and [repository governance](../../AGENTS.md). Existing detailed contracts remain important; start with the links in the overview.
- Source code and the latest effective definitions in the current [SQL migration chain](../../supabase/migrations/) are authoritative for implemented behavior when architecture documentation becomes stale. This does not prove those migrations are applied to a hosted database.
- If implementation conflicts with an explicit product rule or authorized task, report the conflict rather than silently choosing a new behavior.
- Each document must record its verification commit, distinguish source observations from unverified runtime assumptions, and link to code instead of copying formulas or SQL.
- Recheck relevant links, effective SQL definitions, and tests when changing a documented boundary. Preserve historical documents as evidence; do not assume their checkpoint or deployment statements describe current main.

Tasks 1–4 cover the application overview, database/data ownership, authentication/security, and shared door geometry/configuration. Hosted-state verification and the remaining planned sections are deferred.
