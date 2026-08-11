const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'widget', 'cre.js'), 'utf8');
const packageVersion = require('../package.json').version;

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is present`);
  let depth = 0;
  let end = source.indexOf('{', start);
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  assert.equal(depth, 0, `${name} function is complete`);
  return source.slice(start, end + 1);
}

function extractMatchesPage() {
  const start = source.indexOf('function matchesPage(c) {');
  assert.notEqual(start, -1, 'matchesPage is present');
  let depth = 0;
  let end = start;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  assert.equal(depth, 0, 'matchesPage function is complete');
  return source.slice(start, end + 1);
}

const matchesPage = new Function('location', `return (${extractMatchesPage()});`);

test('widget header version matches package version', () => {
  const headerVersion = source.match(/\* Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
  assert.ok(headerVersion, 'widget version header is present');
  assert.equal(headerVersion[1], packageVersion);
});

test('contact markup shows the file field only when uploads are allowed', () => {
  const actionMarkup = new Function('esc', 'safeUrl', `return (${extractFunction('actionMarkup')});`)(
    (value) => String(value == null ? '' : value),
    (value) => String(value || ''),
  );
  const theme = { radius: '10px', accent: '#123', accentText: '#fff', border: '#ddd', text: '#111', muted: '#666' };
  const campaign = { action_type: 'contact', action_config: {}, cta_label: 'Senden' };

  assert.doesNotMatch(actionMarkup(campaign, theme), /data-cre-file/);
  campaign.action_config.allowUpload = true;
  assert.match(actionMarkup(campaign, theme), /data-cre-file/);
});

test('widget includes the mobile popup safeguards', () => {
  const inpBlock = source.match(/var inp = [^\n]+/);
  assert.ok(inpBlock, 'input style block is present');
  assert.match(inpBlock[0], /font-size:\s*16px/);
  assert.match(source, /max-height:\s*calc\(100vh/);
  assert.match(source, /max-height:\s*calc\(100dvh/);
  assert.match(source, /safe-area-inset-bottom/);
  assert.match(source, /scrollY\s*<\s*200\)/);
  assert.match(source, /\.cre-x\{[^}]*width:44px;height:44px/);
});

test('widget caps repeats per campaign and enables the site-wide cap only from config', () => {
  // Pro Kampagne wird weiterhin gedeckelt (Standard 24 h) — sonst nervt dasselbe
  // Popup denselben Besucher endlos.
  assert.match(source, /cre_seen_/);
  assert.match(source, /if \(!force && isSuppressed\(c\)\) return;/);
  assert.match(source, /frequencyHours/);

  assert.match(source, /configuredCooldown = data && data\.siteCooldownHours/);
  assert.match(source, /siteCooldownHours = typeof configuredCooldown === 'number'/);
  assert.match(source, /function isAnyCampaignSuppressed\(c\) \{\s*if \(c && c\.trigger_config && c\.trigger_config\.ignoreSitePause\) return false;\s*if \(!\(siteCooldownHours > 0\)\) return false;/);
  assert.match(source, /function suppressAnyCampaign\(c\) \{\s*if \(c && c\.trigger_config && c\.trigger_config\.ignoreSitePause\) return;\s*if \(!\(siteCooldownHours > 0\)\) return;/);
  assert.match(source, /cre_any_/);
  assert.match(source, /JSON\.stringify\(\{\s*until: Date\.now\(\) \+ siteCooldownHours \* 3600 \* 1000,\s*id:/);
  assert.match(source, /lastId === c\.id/);
  assert.match(source, /dbg\('site-wide cap active'\)/);
  assert.match(source, /if \(!force\) suppressAnyCampaign\(c\)/);
});

test('widget keeps action links safe', () => {
  assert.match(source, /downloadUrl/);
  assert.match(source, /privacyUrl/);
  assert.match(source, /v\.indexOf\('\\\\'\) !== -1/);
  assert.doesNotMatch(source, /innerHTML\s*=[^;\n]*(?:downloadUrl|privacyUrl)/);
});

test('widget supports literal, wildcard, comma-separated, and excluding page patterns', () => {
  assert.match(source, /function matchesPattern\(pattern, value\)/);
  assert.match(source, /pattern\.split\('\*'\)/);
  assert.match(source, /patterns\.split\(', '\)|patterns\.split\(','\)/);
  assert.match(source, /if \(c\.page_exclude && matchesAny\(c\.page_exclude\)\) return false/);
  assert.match(source, /if \(!c\.page_pattern \|\| c\.page_pattern === '\*'\) return true/);
  assert.match(source, /value\.indexOf\(pattern\) !== -1/);
});

test('page patterns work by behavior, including literal matching and exclusion precedence', () => {
  const page = (href, pathname = href) => ({ href, pathname });
  const campaign = (page_pattern, page_exclude) => ({ page_pattern, page_exclude });
  const matches = (location, c) => matchesPage(location)(c);

  assert.equal(matches(page('https://shop.test/konfigurator'), campaign('/konfigurator')), true);
  assert.equal(matches(page('https://shop.test/checkout'), campaign('/konfigurator')), false);
  assert.equal(matches(page('https://shop.test/anything'), campaign('*')), true);
  assert.equal(matches(page('https://shop.test/anything'), campaign(undefined)), true);
  assert.equal(matches(page('https://shop.test/anything'), campaign('')), true);
  assert.equal(matches(page('https://shop.test/checkout'), campaign('/warenkorb, /checkout')), true);
  assert.equal(matches(page('https://shop.test/konfigurator/3'), campaign('/konfigurator/*')), true);

  assert.equal(matches(page('https://shop.test/preis(neu)'), campaign('/preis(neu)')), true);
  assert.equal(matches(page('https://shop.test/preisneu'), campaign('/preis(neu)')), false);
  assert.equal(matches(page('https://shop.test/a.b'), campaign('/a.b')), true);
  assert.equal(matches(page('https://shop.test/axb'), campaign('/a.b')), false);
  assert.equal(matches(page('https://shop.test/x+y'), campaign('/x+y')), true);
  assert.equal(matches(page('https://shop.test/xxxy'), campaign('/x+y')), false);

  assert.equal(matches(page('https://shop.test/aaaa'), campaign('/aa*aa')), true);
  assert.equal(matches(page('https://shop.test/anything'), campaign('*', '/anything')), false);
  assert.equal(matches(page('https://shop.test/anything'), campaign('*', ' , ')), true);
});

test('manual production triggers respect caps while test triggers force display', () => {
  assert.match(source, /CRE\.trigger = function[\s\S]*show\(c, 'manual', false\)/);
  assert.match(source, /CRE\.triggerTest = function[\s\S]*show\(c, 'manual_test', true\)/);
});

test('widget central close path tears down the dialog keydown handler', () => {
  assert.match(source, /function closeAll\(\) \{\s*if \(openCleanup\) openCleanup\(\)/);
  assert.match(source, /openCleanup = function \(\) \{ document\.removeEventListener\('keydown', onKey\); \}/);
});
