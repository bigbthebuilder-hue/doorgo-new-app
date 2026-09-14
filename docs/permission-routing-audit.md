# Permission routing audit

Baseline: `f8e17ec7e2fa4905d377cd89298726e7bcc36406`, retaining the uncommitted Admin implementation. The user reports the Admin migration is now applied and its eight functions/grants verified. This audit does not execute SQL, change accounts, or change that migration.

## Findings

Before editing, Glass Calculator's navigation entry was inside the `jobs` branch and its server page required `jobs`. Home inherits navigation's `showOnHome` entries. Thus `tools=use, jobs=none` hid and denied the calculator; granting Jobs unlocked it regardless of Tools. Both boundaries now use `tools`.

Documents' Glass Calculations entry opens `/glass-calculator`: a live local calculation/print tool, not a saved Job artifact. It now checks `tools`. Work Orders still opens `/jobs` and requires `jobs`.

Production Board navigation used `production` but the page was historically public. The current explicit brief supersedes that public-board contract: its server page now requires protected access and `production>=view` before loading board data. Scheduling and calculation behavior are unchanged.

No other module-level key mismatch was found. Reports remains a reserved key with no route, navigation, workspace or actions.

## Complete matrix

All operational sidebar entries and Home tiles use `buildProtectedAppNavigation`. View+ means explicit view/use on an active profile. Protected pages retain login/password-setup redirects; inactive/missing-profile and insufficient module access are denied. The root layout adds no module authority; the session proxy only refreshes cookies.

| Workspace / routes | Sidebar and Home | Page guard | Server/data/action guard | Extra dependency / manager |
|---|---|---|---|---|
| Board `/production-board` | production view+ | production view+ before data loading | Shared read-only loader runs after page authorization; both levels remain read-only | None |
| Schedule `/production-schedule`, Past Schedule `/production-recovery` | Secondary Production routes, no separate rail tiles | production view+ | Read services require production; mutation services/RPCs require production use | Optional checkpoint link requires production_checkpoints; existing eligibility rules unchanged |
| Checkpoints `/production-checkpoints` | production_checkpoints view+ | production_checkpoints view+ | Read service/calculated-carry checks this key; mutation RPCs require use | No production/manager fallback |
| Calendar `/calendar` | calendar view+ | active + calendar view+ | Actions/RPCs require calendar use for mutations | Jobs search/linking uses jobs; production operations/staff-away use production; configuration uses settings. These do not block module entry |
| Jobs `/jobs`, `/jobs/[id]/edit`, `/jobs/[id]/work-order`, PDF endpoint | jobs view+ | jobs view+ | Read/PDF services require jobs view+; saves require jobs use and authenticated RPCs | Permanent deletion retains existing manager requirement plus job-write authority; not a module-entry dependency |
| New Job `/jobs/new`, import `/jobs/import` | Actions within Jobs | jobs use | Existing mutation services and RPC checks | Embedded job calculations do not require tools |
| Documents `/documents` | documents view+ | documents view+ | Hub has no independent persisted-document mutations | Work Orders link: jobs view+. Glass Calculations link: tools view+ |
| Glass Calculator `/glass-calculator` | tools view+ | tools view+ | Local computation/printing; no server mutation | No jobs, production, settings, users or manager dependency |
| Admin configuration `/manager` | settings view+ OR users view+ | Same OR-entry rule | Configuration loads only with settings view+; mutation actions/RPCs require settings use | users does not grant configuration |
| Users & Access `/manager` | Same shared Admin entry | users view+ for tab/data | Active, password-setup-complete users view+ for reads; users use for mutations, repeated in RPCs | settings/manager do not grant user administration |
| Reports | No surface | No route | Reserved key; no action consumes it | reports alone adds no workspace |
| Home `/`, Account `/account` | Utility entries | Existing session/account behavior | Home filters module tiles from navigation; Account shows own access | No manufactured module grants |

## View versus Use

View does not enable persisted mutations. Job creation/import/saves, Calendar changes, checkpoints, scheduling and Admin retain use checks. Work-order preview/download/print/send retain existing Jobs contracts; permanent deletion remains separately protected.

Standalone Glass Calculator has no persisted read/write distinction: view/use both allow local input changes, calculation and printing without saving a Job or mutating the database. No artificial read-only workflow was introduced.

## Regression coverage

`npm run verify:permission-routing` executes real navigation builders and transpiled server page guards with mocked session/data boundaries. It covers all nine keys at none/view/use, both manager states, each key denied while unrelated keys are enabled, inactive/missing/unauthenticated states, password setup redirects, secondary Job/Production routes, document destinations and reserved Reports.

Aaron-equivalent fixture: non-manager, calendar=use, tools=use, every other key=none. Expected rail: Home, Calendar, Glass Calculator, Account. Home tiles: Calendar and Glass Calculator. Other current operational routes are denied. Tests never read or modify the real account.
