import os from 'node:os';
import path from 'node:path';
import base from './playwright-desktop-shell.config';

// Keep this component registry/cache independent of Calendar and other shell tests.
const config = {
  ...base,
  testMatch: ['**/door-mode.spec.tsx', '**/door-line-comparison.spec.tsx'],
  use: {
    ...base.use,
    ctCacheDir: path.join(os.tmpdir(), 'doorgo-door-intake-tests', 'cache'),
  },
};

export default config;
