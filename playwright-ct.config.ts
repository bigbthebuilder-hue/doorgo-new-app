import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/experimental-ct-react';

const artifactRoot = path.join(os.tmpdir(), 'doorgo-j3c-browser-acceptance');

export default defineConfig({
  testDir: './tests/j3c-browser',
  outputDir: path.join(artifactRoot, 'results'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(artifactRoot, 'report') }]],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure', ctPort: 3117, ctCacheDir: path.join(artifactRoot, 'cache') },
});
