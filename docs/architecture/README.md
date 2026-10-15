# DoorGo architecture reference

This reference helps maintainers and future Codex sessions locate authoritative code, understand feature boundaries, and choose focused verification before making changes. It is a navigation and dependency map, not a replacement for domain contracts or product decisions.

## Index

| Section | Status | Scope |
| --- | --- | --- |
| [01 — Application overview](01-application-overview.md) | Completed | Stack, routes, modules, dependencies, risks, and verification entry points |
| [02 — Database and data ownership](02-database-and-data-ownership.md) | Completed | Entities, identifiers, effective local SQL/RPC/trigger relationships, access boundaries and unresolved risks |
| [03 — Authentication and security](03-authentication-and-security.md) | Completed | Session flow, feature permissions, server/database enforcement and security-review boundaries |
| [04 — Door geometry and configuration](04-door-geometry-and-configuration.md) | Completed | Shared calculators, input authority, validation, persistence, diagrams and output dependencies |
| [05 — Calendar and production workflows](05-calendar-and-production-workflows.md) | Completed | Booking lifecycle, scheduling, capacity, checkpoints, fulfillment, Staff Away and synchronization |
| [06 — Testing and development guide](06-testing-and-development-guide.md) | Completed | Environment, test selection, harness boundaries, database safety and change workflow |

The authorized six-task documentation series is complete. The earlier proposed separate services/deployment and testing sections were superseded by Task 6's testing/development scope. Deployment operations and hosted-state certification remain outside this series; completion is not authorization for remediation.

## Authority and maintenance

- Follow the current task and [repository governance](../../AGENTS.md). Existing detailed contracts remain important; start with the links in the overview.
- Source code and the latest effective definitions in the current [SQL migration chain](../../supabase/migrations/) are authoritative for implemented behavior when architecture documentation becomes stale. This does not prove those migrations are applied to a hosted database.
- If implementation conflicts with an explicit product rule or authorized task, report the conflict rather than silently choosing a new behavior.
- Each document must record its verification commit, distinguish source observations from unverified runtime assumptions, and link to code instead of copying formulas or SQL.
- Recheck relevant links, effective SQL definitions, and tests when changing a documented boundary. Preserve historical documents as evidence; do not assume their checkpoint or deployment statements describe current main.

Tasks 1–6 provide the architecture and development reference. Each document records its own source-verification commit; hosted state and current application test health remain separately unverified.
