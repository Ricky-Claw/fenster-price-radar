import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(app, /href="#aktionskalender"/, 'top navigation should link to the action calendar');
assert.match(app, /<ActionCalendar \/>/, 'action calendar should be rendered in the main app shell');
assert.doesNotMatch(app, /DFS Audit/, 'stale DFS Audit tab should not be visible in the top navigation');
assert.doesNotMatch(app, /mapping-audit\.html/, 'stale mapping audit report should not be linked from the top navigation');

console.log('app-shell ok');
