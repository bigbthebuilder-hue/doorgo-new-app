// Static regression guard. Does not inspect secrets, contact Google or certify external shutdown.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const forbidden = [
  /(?:www\.|calendar\.)?googleapis\.com\/calendar\b/i,
  /(?:accounts\.google\.com|oauth2\.googleapis\.com)/i,
  /(?:google\.calendar\s*\(|CalendarApp\s*\.|GoogleAuth\s*\()/i,
  /(?:from\s*|require\s*\()\s*['"](?:googleapis|google-auth-library|@googleapis\/calendar)/i,
  /\bGOOGLE_(?:CALENDAR|CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN|SERVICE_ACCOUNT)\w*/i,
  /(?:connect|reconnect|sync|synchronize)\s+(?:to\s+|with\s+)?Google Calendar/i,
];
const violates = text => forbidden.some(pattern => pattern.test(text));
for (const sample of [
  'https://www.googleapis.com/calendar/v3/calendars',
  'https://accounts.google.com/o/oauth2/auth',
  'https://oauth2.googleapis.com/token',
  "google.calendar({version:'v3'})", 'CalendarApp.getDefaultCalendar()',
  "import {google} from 'googleapis'", 'process.env.GOOGLE_CLIENT_SECRET',
  'Reconnect Google Calendar', 'Sync with Google Calendar',
]) assert.ok(violates(sample), sample);
for (const sample of ['calendar_event_id', 'calendar_sync_state',
  'sync_native_job_calendar_obligations', 'native_capacity_bridge_available_hours',
  "import {Geist} from 'next/font/google'",
]) assert.ok(!violates(sample), sample);

// Track all deployable source/config; exclude tests/docs and historical migrations.
// Scan scripts too, allowing regex/assertion-based verifiers rather than their test literals.
const files = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
const scanned = files.filter(file =>
  !/(?:\.test\.|\.spec\.|^tests\/|^docs\/|^supabase\/migrations\/)/.test(file)
  && !/^scripts\/verify-/.test(file)
  && !/(?:^|\/)\.env(?!\.example$)/.test(file)
  && /\.(?:tsx?|jsx?|mjs|cjs|json|toml|ya?ml|sql|gs)$|^\.env\.example$/.test(file)
  && !/^(?:package-lock\.json|tsconfig\.json)$/.test(file));
for (const file of scanned) assert.ok(!violates(fs.readFileSync(file,'utf8')), file);
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
for (const name of Object.keys({...pkg.dependencies,...pkg.devDependencies})) {
  assert.doesNotMatch(name, /^(?:googleapis|google-auth-library|@googleapis\/calendar)$/);
}
for (const file of files) {
  if (/^(?:app|lib|components|supabase\/functions)\//.test(file)) {
    assert.doesNotMatch(path.basename(file), /google[-_]?calendar|gcal[-_](?:sync|oauth|connect)/i);
  }
}
assert.match(fs.readFileSync('docs/DOORGO_SCHEDULING_RULES.md','utf8'), /Google Calendar is permanently discontinued/);
console.log(`Google Calendar retirement guard passed (${scanned.length} source/config files); historical references allowed. External shutdown unverified.`);
