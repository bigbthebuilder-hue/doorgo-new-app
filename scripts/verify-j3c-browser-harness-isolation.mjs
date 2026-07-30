import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function walk(root) { return (await readdir(root, { recursive: true })).map((entry) => path.join(root, String(entry))).filter((file) => /\.[cm]?[jt]sx?$/.test(file)); }
const productionFiles = [...await walk('app'), ...await walk('components/jobs'), ...await walk('lib/jobs')];
for (const file of productionFiles) {
  const source = await readFile(file, 'utf8');
  assert.equal(/tests\/j3c-browser|playwright-ct|J3C_HARNESS_ONLY_MARKER|DOORGO_J3C_HARNESS_FIXTURE_7Q9|recording provider|mock provider/i.test(source), false, `${file} imports or embeds harness-only content`);
  assert.equal(/DOORGO_.*(?:MOCK|HARNESS|BYPASS)/.test(source), false, `${file} contains a production mock switch`);
}
const appEntries = await readdir('app/jobs', { recursive: true });
assert.equal(appEntries.some((name) => /j3c|mock|harness/i.test(String(name))), false, 'no J3C browser route may exist');
try {
  await access('.next');
  const buildFiles = (await readdir('.next', { recursive: true })).map((entry) => path.join('.next', String(entry))).filter((file) => /\.(?:js|html|json)$/.test(file));
  for (const file of buildFiles) {
    try { assert.equal((await readFile(file, 'utf8')).includes('DOORGO_J3C_HARNESS_FIXTURE_7Q9'), false, `${file} contains the harness marker`); } catch (error) { if (error?.code !== 'EISDIR') throw error; }
  }
} catch (error) { if (error?.code !== 'ENOENT') throw error; }
console.log('J3C browser harness production-isolation verifier: PASS');
