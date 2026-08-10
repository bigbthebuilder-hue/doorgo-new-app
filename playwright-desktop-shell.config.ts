import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/experimental-ct-react';

const artifactRoot = path.join(os.tmpdir(), 'doorgo-desktop-shell-tests');

export default defineConfig({
  testDir: './tests/desktop-shell',
  outputDir: path.join(artifactRoot, 'results'),
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], ctPort: 3120, ctCacheDir: path.join(artifactRoot, 'cache-phase-1c-final'), screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
