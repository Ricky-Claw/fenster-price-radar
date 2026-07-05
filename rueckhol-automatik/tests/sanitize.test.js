const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanCsvList,
  cleanText,
  cleanUrl,
  sanitizeAction,
  sanitizeSubmission,
  sanitizeTrigger,
} = require('../server/lib/sanitize');

test('cleanText strips control characters and collapses whitespace', () => {
  assert.equal(cleanText('  hi\u0000\tthere \n friend  ', 40), 'hi there friend');
});

test('cleanUrl only keeps absolute http or https URLs and strips hashes', () => {
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('data:text/html,hi'), '');
  assert.equal(cleanUrl('/relative/path'), '');
  assert.equal(cleanUrl('https://example.com/offer#section'), 'https://example.com/offer');
});

test('cleanCsvList returns trimmed safe values', () => {
  assert.deepEqual(cleanCsvList(' Price \nTiming,   Support  '), ['Price', 'Timing', 'Support']);
});

test('sanitizeTrigger clamps numeric config and keeps supported trigger names', () => {
  assert.deepEqual(
    sanitizeTrigger('scroll_depth', { percent: 150, frequencyHours: -2 }),
    {
      trigger: 'scroll_depth',
      triggerConfig: {
        percent: 100,
        frequencyHours: 0,
      },
    },
  );
});

test('sanitizeAction rejects unsafe URLs and keeps abandon-reason options', () => {
  const action = sanitizeAction('url', {
    url: 'javascript:alert(1)',
    newTab: '1',
    reasonPrompt: 'Why leave?',
    reasonOptions: 'Too expensive,Not ready',
  });

  assert.equal(action.actionType, 'url');
  assert.equal(action.actionConfig.url, '');
  assert.equal(action.actionConfig.newTab, true);
  assert.equal(action.actionConfig.reasonPrompt, 'Why leave?');
  assert.deepEqual(action.actionConfig.reasonOptions, ['Too expensive', 'Not ready']);
});

test('sanitizeSubmission enforces consent and validates emails', () => {
  assert.throws(
    () => sanitizeSubmission('newsletter', { email: 'not-an-email', consent: true }),
    /valid email/i,
  );
  assert.throws(
    () => sanitizeSubmission('newsletter', { email: 'person@example.com', consent: false }),
    /consent/i,
  );

  assert.deepEqual(
    sanitizeSubmission('contact', {
      name: 'Sam',
      email: 'sam@example.com',
      message: 'Need help',
      consent: true,
    }),
    {
      kind: 'contact',
      payload: {
        name: 'Sam',
        email: 'sam@example.com',
        message: 'Need help',
        consent: true,
      },
    },
  );
});
