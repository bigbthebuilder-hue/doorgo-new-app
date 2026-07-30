import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/experimental-ct-react';

const artifactRoot = path.join(os.tmpdir(), 'doorgo-native-job-archive');

export default defineConfig({
  testDir: './tests/native-job-archive-browser',
  outputDir: path.join(artifactRoot, 'results'),
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure', screenshot: 'only-on-failure', ctPort: 3121, ctCacheDir: path.join(artifactRoot, 'cache') },
});
