import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const repo = dirname(root);
if (!process.argv[2]) throw new Error('Provide a fresh staging directory outside the repository.');
const output = resolve(process.argv[2], '.vercel', 'output');
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
await mkdir(resolve(output, 'static'));

const allowed = new Set([
  'door-label-preview/index.html',
  'door-label-preview/main.tsx',
  'door-label-preview/samples.ts',
  'app/globals.css',
  'components/jobs/DoorLabelDialog.tsx',
  ...[
    'door-label-contract', 'door-size-presentation', 'double-door-sizing-contract',
    'dimension-contract', 'slab-sizing-contract', 'double-door-astragal-contract',
    'glass-unit-composition-contract',
  ].map((name) => 'lib/jobs/' + name + '.ts'),
]);

await build({
  configFile: false,
  root,
  envDir: false,
  publicDir: false,
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': repo } },
  css: { postcss: repo },
  build: { outDir: resolve(output, 'static'), emptyOutDir: false, modulePreload: { polyfill: false } },
  plugins: [{
    name: 'door-label-preview-module-boundary',
    moduleParsed({ id }) {
      const path = id.split('?')[0].replaceAll('\\', '/');
      const local = path.slice(repo.replaceAll('\\', '/').length + 1);
      if (allowed.has(local) || /^node_modules\/(react|react-dom|scheduler)\//.test(local)) return;
      this.error('Unexpected preview module: ' + id);
    },
    generateBundle(_, bundle) {
      for (const [name, item] of Object.entries(bundle)) {
        const content = item.type === 'chunk' ? item.code : item.source.toString();
        if (!/^(index\.html|assets\/[\w-]+\.(js|css))$/.test(name) ||
            /supabase|service_role|process\.env|\/api\//i.test(content)) {
          this.error('Unexpected preview output: ' + name);
        }
      }
    },
  }],
});

await writeFile(resolve(output, 'config.json'), JSON.stringify({ version: 3 }));
