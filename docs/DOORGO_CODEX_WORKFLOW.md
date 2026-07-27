# DoorGo ChatGPT–Codex Operating Workflow

## Roles
- The user defines real shop needs, decides unresolved business rules, normally relays ChatGPT-prepared prompts to Codex, and performs targeted business acceptance testing.
- ChatGPT owns task sequencing, scope control, acceptance criteria, interpretation of Codex reports, and the next safe instruction.
- Codex owns bounded repository inspection, implementation, automated testing, and technical self-review.

The user may be occupied running the business and may relay Codex output without reading or interpreting it. Codex must not assume the user independently directed the development details or reviewed code, test output, warnings, changed files, or skipped checks. Reports must therefore be complete, structured, accurate, and safe to pass back to ChatGPT without interpretation. Manual user involvement should focus on unresolved business-rule decisions and targeted acceptance testing.

## Standard task cycle
1. Verify branch, commit, and working-tree state.
2. Read `AGENTS.md`, this workflow, the current checkpoint, and only task-relevant rule documents.
3. Restate scope, exclusions, stop conditions, and definition of done.
4. Inspect current implementation before editing.
5. Make the smallest coherent change.
6. Add or update relevant automated tests.
7. Run the authorized non-destructive checks.
8. Review the complete diff for regressions and unrelated changes.
9. Return the required structured completion report.
10. Stop. Do not take the recommended next step unless separately authorized.

ChatGPT controls milestone sequencing, scope review, and next-step decisions. Codex must stop before continuing to another milestone even when the current task succeeds.

## Mandatory stop conditions
Stop without making further changes when:
- the expected branch, commit, or clean-tree state does not match;
- unrelated pre-existing changes are present and their ownership is unclear;
- current source conflicts materially with approved DoorGo documentation;
- a business rule, permission, output requirement, or compatibility choice is unclear;
- the requested change would require material out-of-scope refactoring;
- a required test fails for a reason not clearly caused by the scoped change;
- a dependency, schema, migration, hosted configuration, or external service change appears necessary but was not authorized;
- manual visual, print, mobile, permission, or shop-workflow acceptance is the next meaningful check;
- push, merge, deployment, migration, or hosted writes would be next.

## Commit and hosted-action boundaries
A successful implementation does not authorize a commit unless the task says so. A commit does not authorize a push. A push does not authorize a merge. A merge does not authorize a deployment or migration. Each boundary requires explicit approval.

## Reporting standard
Reports must distinguish:
- what Codex observed;
- what Codex changed;
- what tests actually ran and passed;
- what could not be verified;
- what still requires the user's real-world judgment;
- what action is recommended next but was not performed.
