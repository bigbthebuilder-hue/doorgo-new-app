import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/experimental-ct-react';

const artifactRoot = path.join(os.tmpdir(), 'doorgo-legacy-transfer-import-review');

export default defineConfig({
  testDir: './tests/legacy-transfer-import-browser',
  outputDir: path.join(artifactRoot, 'results'),
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure', screenshot: 'only-on-failure', ctPort: 3122, ctCacheDir: path.join(artifactRoot, 'cache') },
});
