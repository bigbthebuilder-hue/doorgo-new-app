# Codex Task 01 — Install DoorGo Governance Baseline

## Goal
Install and validate the DoorGo repository guidance pack without changing application behavior.

## Current expected checkpoint
- Branch: `feature/native-job-intake-glass-unit-builder`
- Commit: `63e0f60a12ca4a568ecce87bd4ad6c9b2a47e153`
- Expected tracked working tree: clean
- Expected untracked files: only the supplied `docs/DOORGO_*.md` files, `docs/history/DOORGO_SCHEDULING_CONTINUITY_2026-06-20_TO_2026-07-03.md`, and files under `codex_tasks/`

Do not assume these are correct. Verify them first and stop if the branch, commit, or working-tree state does not match safely.

## Work
1. Read root `AGENTS.md`, `docs/DOORGO_CURRENT_CHECKPOINT.md`, and `docs/DOORGO_CODEX_WORKFLOW.md`.
2. Inspect the repository structure, package/config files, scripts, test setup, deployment configuration, database/migration folders, and existing documentation.
3. Review the supplied `docs/DOORGO_*.md` files against the actual repository. Do not change approved business rules merely because implementation is incomplete.
4. Add a short `Repository Commands` section to root `AGENTS.md` containing only verified commands for:
   - dependency installation;
   - development server;
   - lint and typecheck;
   - unit/integration tests;
   - production build;
   - existing PDF or database test commands, when present.
5. If narrower folder instructions appear necessary, propose them in the report. Do not create nested `AGENTS.md` files yet.
6. Add links from an existing developer README only when clearly useful. Do not rewrite the README broadly.
7. Run practical, non-destructive documentation-safe checks and existing local lint/typecheck/test commands. Do not run migrations or commands that contact or modify hosted systems.
8. Review the diff for accidental source, dependency, generated-file, configuration, schema, or migration changes.

## Restrictions
- Documentation and repository-guidance task only.
- Do not alter application code, schemas, migrations, dependencies, generated files, hosted configuration, or deployment settings.
- Do not push, merge, deploy, migrate, perform hosted writes, or commit.
- Do not invent commands. Record only commands verified from repository files and/or successfully run locally.
- Do not remove existing documentation. Report conflicts or uncertainty.

## Stop immediately if
- branch or commit differs from the expected checkpoint;
- any tracked modification is present before installation;
- any untracked file exists outside the exact supplied governance set described above;
- a supplied rule materially conflicts with current source or existing authoritative documentation;
- a supposedly safe command would contact or modify a hosted system;
- application-code or dependency changes appear necessary.

## Done when
- Root `AGENTS.md` is concise and includes verified repository commands.
- DoorGo reference documents exist under `docs/`.
- No application behavior changed.
- Checks are reported accurately.
- Working-tree state and a proposed checkpoint commit message are reported.
- Codex stops without committing.

## Completion report
Use the exact headings required by root `AGENTS.md`. Include documentation conflicts and the proposed commit subject under `Recommended next step`.
