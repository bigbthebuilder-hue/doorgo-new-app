'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getPublicSupabaseEnvironment } from './public-env';

export function createAuthenticatedSupabaseBrowserClient() {
  const { url, publishableKey } = getPublicSupabaseEnvironment();
  return createBrowserClient(url, publishableKey);
}
