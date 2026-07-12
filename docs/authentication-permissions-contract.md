# DoorGo authentication and permissions contract

DoorGo uses invite/pre-provisioned Supabase Auth users and email/password sign-in.
Managers or administrators create users and assign strong temporary passwords;
there is no public signup or self-registration flow. Project-level Supabase Auth
settings must keep public signup disabled. Sessions use cookie-backed Supabase SSR
clients and may remain active on several devices.

Returned login failures use one generic credential message and remount only the
password input, clearing the submitted password while leaving the email available
for correction. Password values are never returned in Server Action state.

## Profiles and broad permissions

`public.dg_user_profiles` stores active state, display name, a simple manager
flag, and optional descriptive company/location text. `company_location` is not a
tenant boundary and does not filter production data. Stronger company isolation
can be added later only if outside usage requires it.

`public.dg_user_permissions` stores broad module access using `none`, `view`, or
`use`. A missing row or unknown access value means `none`. Initial module keys are:

- `production`
- `calendar`
- `jobs`
- `documents`
- `tools`
- `reports`
- `settings`
- `users`

New broad keys may be added without redesigning authentication. The manager flag
identifies users who may later manage profiles and permissions; it does not
silently grant module access. Initial profiles, managers, and permissions are
created through a controlled Supabase administrative step. Future changes use
constrained RPCs, not direct table writes.

## Initial password setup

Every profile has `must_change_password`, defaulting to `true`, plus the nullable
audit timestamp `password_changed_at`. An active user whose flag is true must use
`/account/change-password` before entering protected DoorGo areas. Manager status
and module permissions do not bypass this rule. The public Production Board,
password-setup page, and local-device logout remain available.

The authenticated user changes their own Auth password through the cookie-aware
client. Only after that succeeds does DoorGo call the narrowly scoped
`public.complete_dg_initial_password_setup()` function. The security-definer
function derives identity from `auth.uid()`, updates only the caller's active
profile, and accepts no identity or authorization arguments. Direct authenticated
profile updates remain unavailable.

The Auth password operation and database completion flag cannot be one atomic
transaction. If the password succeeds but the completion RPC fails, the flag
stays true and the UI truthfully reports that the password changed but setup still
needs finalization. The user signs in with the new password and retries.

## Authority boundaries

- Authentication identity is not a salesperson record.
- Calendar ownership and color are not permissions.
- A future salesperson/calendar profile may optionally link to a user.
- A DoorGo user does not need to own a salesperson calendar.
- A salesperson calendar may exist without its owner having full application access.
- Google Calendar does not own DoorGo authentication or permissions.
- `America/Vancouver` remains the production business-date authority.

## Security and current scope

Authenticated users may read only their own profile and permission rows. Anonymous
reads and ordinary authenticated mutations are unavailable. The service-role key
remains contained in a trusted server-only legacy/read client and never authorizes
normal user actions.

Phase 2F-C1 adds no checkpoint writes, permission-management UI, salesperson
records, Calendar changes, or complex tenancy. The Production Board intentionally
remains public and unprotected while login, session, profile, and permission reads
are verified.

Normal logout explicitly uses Supabase `scope: 'local'`, affecting only the
current browser/device session. Other device sessions remain active. A future
controlled global-logout capability is outside this phase.

Password recovery is administrative for now: verify the user, assign a new strong
temporary password, and later reset `must_change_password` through a controlled
administrative path. There is no public forgot-password or broad service-role user
management interface in this phase.

## Manual and runtime verification

### Phase 2F-C1 runtime verification

Controlled local runtime verification confirmed that password login, forced
initial password setup, and `complete_dg_initial_password_setup()` all succeeded.
The profile changed to `must_change_password = false`, and
`password_changed_at` was populated. Local-device logout invalidated the tested
session, and permanent-password login subsequently opened the account without
returning to password setup.

The Production Board remained public while logged out. The account page rendered
the approved display name, active state, manager state, password-setup-complete
status, and eight explicit `use` permissions without displaying email, Auth UUID,
tokens, or metadata.

Session persistence and simultaneous sessions on multiple devices were verified.
Local logout invalidated only the current device while the other session remained
authenticated. A disposable second authenticated user could read exactly its own
profile and eight permission rows and could not read the manager's records,
confirming self-only RLS isolation. The disposable profile, cascading permissions,
and Auth user were then removed successfully.

The profile, permission, and password-setup migrations were applied and verified
in the controlled Supabase project, including the completion function's security
and execution grants. Public signup remained disabled throughout verification.
Static checks do not independently prove hosted configuration or deployed runtime
behavior, so deployment URL, environment, cookie, and routing checks remain part
of release verification.
