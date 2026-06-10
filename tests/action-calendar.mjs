import assert from 'node:assert/strict';
import {
  ACTION_CALENDAR,
  createActionComment,
  currentActionCalendarVersion,
} from '../src/actionCalendar.js';

assert.equal(currentActionCalendarVersion, '2026-06-10');
assert.ok(ACTION_CALENDAR.length >= 6, 'calendar should include the campaign pipeline through year end');

const heimspiel = ACTION_CALENDAR.find(action => action.id === 'ruhiges-heimspiel');
assert.ok(heimspiel, 'Ruhiges Heimspiel action should exist');
assert.equal(heimspiel.dateRange, '15.05.2026 - 19.07.2026');
assert.match(heimspiel.timingNote, /WM-Finale am 19\.07\.2026/);
assert.ok(heimspiel.wording.dont.some(rule => /FIFA|Turnier/i.test(rule)));

const foerderheld = ACTION_CALENDAR.find(action => action.id === 'foerderheld-energieberater');
assert.ok(foerderheld, 'Foerderheld action should exist');
assert.equal(foerderheld.dateRange, '20.07.2026 - 14.09.2026');
assert.equal(foerderheld.partner, 'Deutscher Fenstershop x Förderheld');
assert.deepEqual(foerderheld.channels, ['Website', 'E-Mail', 'Social Media', 'Ads']);
assert.equal(foerderheld.scale, 'Große Aktion');
assert.ok(foerderheld.designRules.some(rule => /Foerderheld|Förderheld|Energie/i.test(rule)));
assert.ok(foerderheld.wording.do.some(line => /Energieberater/i.test(line)));
assert.ok(foerderheld.wording.dont.some(line => /Förderzusage|Foerderzusage|garant/i.test(line)));

for (const action of ACTION_CALENDAR) {
  assert.ok(action.designRules.length >= 3, `${action.id} needs design rules`);
  assert.ok(action.wording.do.length >= 2, `${action.id} needs approved wording`);
  assert.ok(action.commentPrompts.length >= 3, `${action.id} needs comment prompts`);
}

const comment = createActionComment({
  actionId: 'foerderheld-energieberater',
  author: 'Elvis',
  channel: 'Ads',
  status: 'Erledigt',
  note: 'Search-Kampagne vorbereitet',
  now: () => new Date('2026-07-21T08:30:00.000Z'),
});

assert.equal(comment.actionId, 'foerderheld-energieberater');
assert.equal(comment.author, 'Elvis');
assert.equal(comment.channel, 'Ads');
assert.equal(comment.status, 'Erledigt');
assert.equal(comment.note, 'Search-Kampagne vorbereitet');
assert.equal(comment.createdAt, '2026-07-21T08:30:00.000Z');
assert.match(comment.id, /^foerderheld-energieberater-2026-07-21T08-30-00-000Z-/);

console.log('action-calendar ok');
