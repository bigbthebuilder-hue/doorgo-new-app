import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const css = read('app/globals.css');
const shell = read('components/app-shell/AppShell.tsx');
const nav = read('lib/app-shell/navigation.ts');
const jobs = read('app/jobs/page.tsx');
const production = read('components/ProductionBoardView.tsx');
const account = read('app/account/page.tsx');
const calculator = read('app/glass-calculator/page.tsx');
const editor = read('app/jobs/[internalJobId]/edit/page.tsx');
const jobForm = read('components/jobs/JobHeaderForm.tsx');
const home = read('app/page.tsx');
const login = read('app/login/page.tsx');
const mark = read('public/brand/doorgo-mark.svg');
const bookingCard = read('components/ProductionBookingCard.tsx');
const schedulePage = read('app/production-schedule/page.tsx');

assert.match(css, /--app-shell-nav-width:\s*4\.75rem/, 'Desktop rail width must remain 4.75rem');
assert.match(css, /\.app-shell-nav-label\s*\{[^}]*white-space:\s*normal[^}]*\}/s, 'Desktop labels must wrap');
assert.doesNotMatch(css.match(/\.app-shell-nav-label\s*\{[^}]*\}/gs)?.at(-1) ?? '', /text-overflow:\s*ellipsis|white-space:\s*nowrap/, 'Desktop labels must not ellipsize');
assert.match(css, /\.app-shell-nav-link\[data-placement="bottom"\]\s*\{\s*margin-top:\s*auto/, 'Account must anchor at the bottom');
assert.match(css, /\.app-context-bar\s*\{[^}]*position:\s*sticky[^}]*max-height:\s*4\.75rem/s, 'Desktop contextual bar must be sticky and bounded');
assert.match(css, /\.app-shell\s*\{[^}]*height:\s*100vh[^}]*overflow:\s*hidden/s, 'Desktop shell must own a bounded viewport');
assert.match(css, /\.app-shell-main\s*\{[^}]*height:\s*100vh[^}]*overflow-y:\s*auto/s, 'Desktop main must be the real vertical scroll surface');
for (const token of ['--app-color-background', '--app-color-surface', '--app-color-border', '--app-color-primary', '--app-color-navy', '--app-color-toolbar']) {
  assert.ok(css.includes(token), `Missing shared shell token ${token}`);
}

assert.match(shell, /src="\/brand\/doorgo-mark\.svg"/, 'Shell must use the approved DoorGo mark');
assert.match(shell, /topBar\?: ReactNode/, 'Shell must expose the contextual top-bar slot');
assert.match(css, /\.app-shell-main\s*\{[^}]*min-width:\s*0/, 'Workspace must not introduce shell-level horizontal overflow');
assert.doesNotMatch(css, /\.app-shell-main\s*\{[^}]*overflow-x:\s*(?:hidden|clip)/, 'Horizontal overflow must not be hidden as a sizing workaround');
assert.match(mark, /<title[^>]*>DoorGo mark<\/title>/);
assert.match(mark, /fill="#0B1D3A"/);
assert.match(mark, /fill="#1E6BFF"/);
assert.match(nav, /label: 'Past Schedule'/);
assert.match(nav, /label: 'Carry Checkpoint'/);
assert.match(nav, /label: 'Account'.*placement: 'bottom'/);
assert.match(jobs, /<ContextTopBar/);
assert.match(production, /<ContextTopBar/);
assert.match(production, /<ProductionBoardSummary board=\{board\}/);
for (const [name, source] of [['Account', account], ['Glass Calculator', calculator], ['job editor', editor]]) assert.match(source, /<AppShell/, `${name} must use AppShell`);
assert.match(jobForm, /<ContextTopBar[\s\S]{0,240}title=\{visibleIdentifier\}/, 'Job editor context must use its live authoritative identifier');
assert.equal((jobForm.match(/id="customer"/g) ?? []).length, 1, 'Customer must have one editor input');
assert.equal((jobForm.match(/id="salesperson"/g) ?? []).length, 1, 'Salesperson must have one editor input');
assert.equal((jobForm.match(/id="siteAddress"/g) ?? []).length, 1, 'Site / Address must have one editor input');
assert.match(jobForm, /placeholder="Not entered"/, 'Blank contextual values must not repeat their labels');
assert.match(jobForm, /app-workspace job-editor-workspace/, 'Job editor must use the full shell workspace');
assert.match(jobForm, /backHref="\/jobs"/, 'Job editor must provide contextual Back navigation');
assert.match(bookingCard, /production-booking-card/, 'Production bookings must use the compact rendered contract');
assert.match(bookingCard, /aria-label="DoorGo job"/, 'Native Production bookings must use a subtle accessible indicator');
assert.doesNotMatch(schedulePage, /href="\/(?:production-board|production-recovery|production-checkpoints|account)"/, 'Production context must not duplicate rail navigation');
assert.match(home, /getCurrentDoorGoAccess/);
assert.match(home, /Measure\. Build\. Schedule\./);
assert.match(home, /buildProtectedAppNavigation\(access\)/, 'Authenticated Home must reuse permission-aware navigation');
assert.match(login, /\/brand\/doorgo-mark\.svg/);
assert.doesNotMatch(login, /<AppShell/, 'Unauthenticated login must not render the authenticated rail');

console.log('Desktop shell static verification passed.');
