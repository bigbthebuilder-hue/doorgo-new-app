'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DOORGO_PERMISSION_KEYS, type DoorGoPermissionMap } from '@/lib/auth/access';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '@/lib/auth/password-setup';
import { MODULE_LABELS, type AdminResult, type AdminUser } from '@/lib/admin/users-contract';
import { createAdminUser, loadAdminUsers, requireAdminPasswordChange, resetAdminPassword, saveAdminPermissions, setAdminUserActive } from '@/lib/admin/users-actions';

const emptyPermissions = () => Object.fromEntries(DOORGO_PERMISSION_KEYS.map(key => [key, 'none'])) as DoorGoPermissionMap;

export function UsersAccessWorkspace({ canEdit, callerId, initialUsers, loadError, defaultLocation }: {
  canEdit: boolean; callerId: string; initialUsers: AdminUser[]; loadError?: string; defaultLocation: string | null;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [permissions, setPermissions] = useState<DoorGoPermissionMap>(emptyPermissions);
  const [message, setMessage] = useState(loadError ?? '');
  const [pending, startTransition] = useTransition();
  const [passwordKey, setPasswordKey] = useState(0);
  const [showReset, setShowReset] = useState(false);
  const [listReady, setListReady] = useState(!loadError);
  function clearEditor() { setSelected(null); setCreating(false); setShowReset(false); setPasswordKey(key => key + 1); }
  async function refreshList() {
    try {
      const result = await loadAdminUsers();
      if (!result.ok) { setMessage(result.message); setListReady(false); clearEditor(); return null; }
      setUsers(result.users); setListReady(true);
      return result.users;
    } catch { setMessage('Users could not be refreshed. Try again.'); setListReady(false); clearEditor(); return null; }
  }
  function openUser(id: string) {
    startTransition(async () => {
      const fresh = await refreshList();
      if (!fresh) return;
      const user = fresh.find(user => user.userId === id);
      if (!user) { clearEditor(); setMessage('User is no longer available.'); return; }
      setSelected(user); setPermissions({ ...emptyPermissions(), ...user.permissions });
      setCreating(false); setShowReset(false); setMessage(''); setPasswordKey(key => key + 1);
    });
  }
  function run(operation: () => Promise<AdminResult>) {
    startTransition(async () => {
      try {
        const result = await operation();
        setMessage(result.message);
        if (result.ok && result.user) {
          const persisted = result.user;
          const user = { ...persisted, email: persisted.email ?? selected?.email ?? null };
          setUsers(old => [...old.filter(item => item.userId !== user.userId), user].sort((a, b) => a.displayName.localeCompare(b.displayName)));
          setSelected(user); setPermissions({ ...emptyPermissions(), ...user.permissions });
          setCreating(false); setShowReset(false); router.refresh();
        }
      } catch { setMessage('The request could not be confirmed. Refresh users before retrying.'); }
      finally { setPasswordKey(key => key + 1); }
    });
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setPasswordKey(key => key + 1); run(() => createAdminUser(form, permissions));
  }
  function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const form = new FormData(event.currentTarget);
    setPasswordKey(key => key + 1); run(() => resetAdminPassword(selected.userId, form));
  }
  return <section className="admin-users" aria-labelledby="users-access-heading">
    <div className="admin-users-heading"><div><h2 id="users-access-heading">Users &amp; Access</h2><p>Manage account access as staff complete training.</p></div>
      <div className="admin-user-actions"><button type="button" disabled={pending} onClick={() => startTransition(async () => { clearEditor(); setMessage(''); await refreshList(); })}>Refresh Users</button>
        {canEdit && <button type="button" disabled={pending || !listReady} onClick={() => { clearEditor(); setCreating(true); setPermissions(emptyPermissions()); setMessage(''); }}>Create User</button>}</div>
    </div>
    {message && <p className="admin-user-message" role="status">{message}</p>}
    {pending && <p role="status">Working…</p>}
    <div className="admin-users-layout">
      <ul className="admin-user-list" aria-label="DoorGo users">{users.map(user => <li key={user.userId}><button type="button" disabled={pending || !listReady} aria-pressed={selected?.userId === user.userId} onClick={() => openUser(user.userId)}>
        <strong>{user.displayName}</strong><span>{user.email ?? 'Email unavailable'}</span><span>{user.active ? 'Active' : 'Inactive'}{user.companyLocation ? ` · ${user.companyLocation}` : ''}</span>
      </button></li>)}{listReady && !users.length && <li>No DoorGo users found.</li>}</ul>
      <div className="admin-user-detail">
        {!selected && !creating && <p>Select a user to inspect their saved access.</p>}
        {creating && <form onSubmit={create}><h3>Create User</h3><fieldset disabled={pending}>
          <label>Display name<input name="displayName" required maxLength={200}/></label>
          <label>Email<input name="email" type="email" required maxLength={254} autoComplete="off"/></label>
          <label>Company / location<input name="companyLocation" maxLength={200} defaultValue={defaultLocation ?? ''}/></label>
          <label>Status<select name="active" defaultValue="true"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <PasswordFields key={passwordKey}/><PermissionFields permissions={permissions} setPermissions={setPermissions} readOnly={false}/>
          <button type="submit">Create User</button><button type="button" onClick={clearEditor}>Cancel</button>
        </fieldset></form>}
        {selected && <><h3>{selected.displayName}</h3><dl className="admin-user-summary">
          <div><dt>Email</dt><dd>{selected.email ?? 'Unavailable'}</dd></div>
          <div><dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd></div>
          <div><dt>Company / location</dt><dd>{selected.companyLocation ?? 'Not set'}</dd></div>
          <div><dt>Password change</dt><dd>{selected.mustChangePassword ? 'Required' : 'Setup complete'}</dd></div>
          <div><dt>Last setup completed</dt><dd>{selected.passwordChangedAt ? new Date(selected.passwordChangedAt).toLocaleString() : 'Not yet completed'}</dd></div>
        </dl>
          <fieldset disabled={pending}><PermissionFields permissions={permissions} setPermissions={setPermissions} readOnly={!canEdit}/>
            {canEdit && <div className="admin-user-actions"><button type="button" onClick={() => run(() => saveAdminPermissions(selected.userId, permissions))}>Save Access</button>
              <button type="button" disabled={selected.userId === callerId && selected.active} onClick={() => run(() => setAdminUserActive(selected.userId, !selected.active))}>{selected.active ? 'Deactivate' : 'Reactivate'}</button>
              <button type="button" onClick={() => run(() => requireAdminPasswordChange(selected.userId))}>Require Password Change</button>
              <button type="button" onClick={() => { setShowReset(!showReset); setPasswordKey(key => key + 1); }}>Reset Temporary Password</button></div>}
          </fieldset>
          {!canEdit && <p>Your User Administration access is read-only.</p>}
          {showReset && canEdit && <form onSubmit={reset}><fieldset disabled={pending}><legend>Reset Temporary Password</legend><PasswordFields key={passwordKey}/><button type="submit">Save Temporary Password</button><button type="button" onClick={() => setShowReset(false)}>Cancel</button></fieldset></form>}
        </>}
      </div>
    </div>
  </section>;
}
function PasswordFields() {
  return <div className="admin-password-fields"><label>Temporary password<input name="newPassword" type="password" required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} autoComplete="new-password"/></label>
    <label>Confirm temporary password<input name="confirmPassword" type="password" required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} autoComplete="new-password"/></label>
    <p>Use at least {MIN_PASSWORD_LENGTH} characters. The user must change this password when entering DoorGo.</p></div>;
}
function PermissionFields({ permissions, setPermissions, readOnly }: { permissions: DoorGoPermissionMap; setPermissions: (permissions: DoorGoPermissionMap) => void; readOnly: boolean }) {
  return <div className="admin-permissions">{DOORGO_PERMISSION_KEYS.map(key => <fieldset key={key} disabled={readOnly}><legend>{MODULE_LABELS[key]}</legend><div className="admin-access-levels">
    {(['none', 'view', 'use'] as const).map(level => <label key={level} data-selected={(permissions[key] ?? 'none') === level}><input type="radio" name={`permission-${key}`} value={level} checked={(permissions[key] ?? 'none') === level} onChange={() => setPermissions({ ...permissions, [key]: level })}/>{level[0].toUpperCase() + level.slice(1)}</label>)}
  </div></fieldset>)}</div>;
}
