const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanCsvList,
  cleanCustomCss,
  cleanDownloadUrl,
  cleanText,
  cleanUrl,
  sanitizeAction,
  sanitizeCampaignInput,
  sanitizeSubmission,
  sanitizeTrigger,
} = require('../server/lib/sanitize');

test('sanitizeCampaignInput cleans page exclusions and supports camelCase', () => {
  assert.equal(sanitizeCampaignInput({ name: 'Default' }).page_exclude, '');
  assert.equal(
    sanitizeCampaignInput({ pageExclude: ' /warenkorb, /kasse ' }).page_exclude,
    '/warenkorb, /kasse',
  );
  assert.equal(sanitizeCampaignInput({ page_exclude: 'x'.repeat(321) }).page_exclude.length, 320);
});

test('cleanCustomCss decodes CSS escapes before filtering imports', () => {
  assert.equal(/import/i.test(cleanCustomCss('@\\69mport "https://evil.example/x.css";')), false);
});

test('cleanCustomCss repeatedly decodes nested CSS escapes before filtering', () => {
  const cleaned = cleanCustomCss('@\\00005c69mport "https://evil.example/x.css";');
  assert.equal(/import/i.test(cleaned), false);
  assert.equal(/evil\.example/i.test(cleaned), false);
});

test('sanitizeCampaignInput keeps existing site assignment on updates', () => {
  assert.equal(
    sanitizeCampaignInput({ id: 'existing-id', site_id: 'site-b' }, { id: 'existing-id', site_id: 'site-a' }).site_id,
    'site-a',
  );
  assert.equal(sanitizeCampaignInput({ site_id: 'site-b' }, {}).site_id, 'site-b');
});

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

test('newsletter and contact action URLs only allow HTTPS or root-relative paths', () => {
  assert.equal(cleanDownloadUrl('https://example.com/freebie.pdf'), 'https://example.com/freebie.pdf');
  assert.equal(cleanDownloadUrl('/datenschutz'), '/datenschutz');
  assert.equal(cleanDownloadUrl('/\\evil.com'), '');
  assert.equal(cleanDownloadUrl('http://example.com/freebie.pdf'), '');
  assert.equal(cleanDownloadUrl('javascript:alert(1)'), '');

  const newsletter = sanitizeAction('newsletter', {
    downloadUrl: 'https://example.com/freebie.pdf',
    privacyUrl: '/datenschutz',
  });
  assert.equal(newsletter.actionConfig.downloadUrl, 'https://example.com/freebie.pdf');
  assert.equal(newsletter.actionConfig.privacyUrl, '/datenschutz');

  const unsafeNewsletter = sanitizeAction('newsletter', {
    downloadUrl: 'http://example.com/freebie.pdf',
    privacyUrl: 'javascript:alert(1)',
  });
  assert.equal(unsafeNewsletter.actionConfig.downloadUrl, '');
  assert.equal(unsafeNewsletter.actionConfig.privacyUrl, '');

  const contact = sanitizeAction('contact', { privacyUrl: 'https://example.com/privacy' });
  assert.equal(contact.actionConfig.privacyUrl, 'https://example.com/privacy');
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
