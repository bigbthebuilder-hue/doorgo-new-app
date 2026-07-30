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
