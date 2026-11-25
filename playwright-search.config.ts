import path from 'node:path';
import base from './playwright-calendar-permissions.config';
const vite = base.use.ctViteConfig;
const config = { ...base, testMatch: '**/search-continuity.spec.tsx', use: { ...base.use,
  ctViteConfig: { resolve: { alias: [
    { find: /^@\/lib\/(?:calendar\/calendar-item-actions|production-bookings\/calendar-production-actions)$/, replacement: path.resolve('tests/desktop-shell/search-actions-shim.ts') },
    ...vite.resolve.alias,
  ] } },
} };

export default config;
