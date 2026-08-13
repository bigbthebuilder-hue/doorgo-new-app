'use client';

import { useState } from 'react';
import { GuardedLink, UnsavedChangesProvider, useUnsavedChanges } from '@/components/app-shell/UnsavedChangesGuard';

function EditableFixture() {
  const [value, setValue] = useState('Saved customer');
  const [baseline, setBaseline] = useState('Saved customer');
  useUnsavedChanges(value !== baseline);
  return <><label>Customer<input onChange={(event) => setValue(event.target.value)} value={value}/></label><button onClick={() => setBaseline(value)} type="button">Save fixture</button><GuardedLink href="/account">Account</GuardedLink></>;
}

export function UnsavedNavigationHarness() {
  return <UnsavedChangesProvider><EditableFixture/></UnsavedChangesProvider>;
}
