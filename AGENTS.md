<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# DoorGo repository governance

## Authority order
1. The current explicit Codex task brief.
2. This root `AGENTS.md`.
3. `docs/DOORGO_CURRENT_CHECKPOINT.md` and `docs/DOORGO_CODEX_WORKFLOW.md`.
4. Existing detailed contract and acceptance documents.
5. Remaining `docs/DOORGO_*.md` summary documents.
6. Files under `docs/history/`.

A lower-authority file must not silently override a higher-authority source. If two higher-authority sources materially conflict, stop and report instead of guessing.

The [architecture reference](docs/architecture/README.md) describes implemented behavior and dependencies; it does not override this authority order or approved product requirements. Source code and effective database definitions establish current implementation, not proof of hosted migration state. Explicitly approved new behavior takes precedence over outdated documentation. Report disagreements between requirements, implementation and documentation; resolve them only within the authorized task, otherwise stop for direction. Never turn an unverified architectural assumption into a product requirement.

## Focused architecture reference usage
- Developers and Codex share [docs/architecture/README.md](docs/architecture/README.md) as the maintained architecture entry point.
- For each task, read root `AGENTS.md`, consult the architecture index, identify the affected feature, and read only relevant chapter sections and linked source files. Do not read all six chapters routinely.
- Expand to other chapters only when dependencies or risks require it. Trivial, isolated cosmetic changes do not require a broad architecture investigation.
- Verify important claims against current code before changing behavior; use the references to avoid repeatedly rediscovering the application.

| Feature | Reference |
| --- | --- |
| Application overview | [01 — Application overview](docs/architecture/01-application-overview.md) |
| Database and data ownership | [02 — Database and data ownership](docs/architecture/02-database-and-data-ownership.md) |
| Authentication and security | [03 — Authentication and security](docs/architecture/03-authentication-and-security.md) |
| Door geometry and configuration | [04 — Door geometry and configuration](docs/architecture/04-door-geometry-and-configuration.md) |
| Calendar and production workflows | [05 — Calendar and production workflows](docs/architecture/05-calendar-and-production-workflows.md) |
| Testing and development | [06 — Testing and development guide](docs/architecture/06-testing-and-development-guide.md) |

## Architecture maintenance with implementation
- For every code change, identify affected chapters, review relevant behavior/dependencies, implement the approved change, and run appropriate verification. Update only documents whose documented behavior or dependencies actually changed.
- Required architecture updates belong in the same development task and, when a commit is authorized, the same commit as the implementation. Do not defer them indefinitely to documentation cleanup. This rule does not independently authorize a commit or override a task's file restrictions; report any scope conflict.
- New features must document purpose/behavior, data ownership, applicable tables/RPCs/permissions, cross-feature dependencies, and tests/verification commands. Add a chapter only when existing chapters cannot reasonably accommodate the feature.
- In the completion report, name updated chapters or explain why no architecture update was necessary. Keep source links and verification context accurate, and distinguish verified behavior from unknowns.
- Before changing shared behavior, trace Job/Calendar synchronization (including retained combined-trigger logic), Sales Order portions, booking identity/revisions, and production scheduling/capacity dependencies as applicable. Do not duplicate shared geometry or capacity rules in consumers.
- Inspect effective migration history, including later patches and grants. Local SQL is not evidence of hosted state. Protect shared objects belonging to other applications; hosted access, migration and deployment restrictions below still apply.

## Working rules
- Verify branch, commit, complete working-tree state, and relevant repository structure before editing.
- Inspect the current implementation and task-relevant contracts before changing behavior.
- Before changing Next.js behavior, read the relevant installed guidance under `node_modules/next/dist/docs/`.
- Make only scoped changes. Do not perform unrelated cleanup, refactoring, dependency changes, or workflow redesign.
- Do not push, merge, deploy, migrate, modify production or hosted data, or perform hosted writes unless the current task explicitly authorizes that exact action.
- Do not change dependencies unless explicitly in scope.
- Do not duplicate authoritative domain calculators or reinterpret their formulas in UI, output, or persistence code.
- Preserve verified workflows unless the current task explicitly places them in scope.
- Add or update automated tests for business-rule changes and run checks appropriate to the risk and task authorization.
- Stop and report when repository state is unexpected, instructions conflict, required authority is missing, or completion would exceed scope.

## Verified repository commands
- Install dependencies: `npm ci`
- Development server: `npm run dev`
- Lint: `npm run lint`
- Type-check: `npx tsc --noEmit`
- Production build: `npm run build`
- Scoped tests/verifiers: use the exact applicable `npm run verify:<name>` script from `package.json`, for example:
  - `npm run verify:native-job-intake-glass-unit-builder`
  - `npm run verify:native-job-intake-j3a`
  - `npm run verify:native-job-intake-j3b`

Do not run installation, broad tests, database tests, migrations, or hosted commands unless the task authorizes them. This repository has no generic `npm test` script.

## Required final report
Use these exact headings:

`CODEX RUN REPORT`

`Starting state:`

`Files changed:`

`What was implemented:`

`Tests and checks run:`

`Tests and checks passed:`

`Tests and checks failed or skipped:`

`Known risks or unresolved questions:`

`Manual checks required:`

`Prohibited actions performed:`

`Working-tree state:`

`Recommended next step:`

Write `None` under `Prohibited actions performed` when none occurred. Stop after the report; do not continue into the recommended next step without separate authorization.
