import path from 'node:path';
import os from 'node:os';
import base from './playwright-desktop-shell.config';

const vite = base.use?.ctViteConfig;
const aliases = typeof vite === 'object' && Array.isArray(vite.resolve?.alias) ? vite.resolve.alias : [];

const config = {
  ...base,
  testMatch: '**/calendar-permissions.spec.tsx',
  use: {
    ...base.use,
    ctCacheDir: path.join(os.tmpdir(), 'doorgo-calendar-permissions-tests', 'cache'),
    ctViteConfig: { resolve: { alias: [
      { find: /^@\/lib\/(?:calendar\/(?:calendar-item-actions|staff-away-actions|fulfillment-actions)|production-bookings\/calendar-production-actions)$/, replacement: path.resolve('tests/desktop-shell/calendar-permissions-actions-shim.ts') },
      ...aliases,
    ] } },
  },
};

export default config;
