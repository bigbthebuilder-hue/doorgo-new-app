import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const css = read('app/globals.css');
const shell = read('components/app-shell/AppShell.tsx');
const nav = read('lib/app-shell/navigation.ts');
const jobs = read('app/jobs/page.tsx');
const production = read('components/ProductionBoardView.tsx');
const mark = read('public/brand/doorgo-mark.svg');

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

console.log('Desktop shell static verification passed.');
