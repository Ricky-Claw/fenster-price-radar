const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'widget', 'cre.js'), 'utf8');
const packageVersion = require('../package.json').version;

test('widget header version matches package version', () => {
  const headerVersion = source.match(/\* Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
  assert.ok(headerVersion, 'widget version header is present');
  assert.equal(headerVersion[1], packageVersion);
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

test('widget includes site-wide frequency and safe action links', () => {
  assert.match(source, /cre_any_/);
  assert.match(source, /\(!force && \(isAnyCampaignSuppressed\(c\)/);
  assert.match(source, /if \(!force\) suppressAnyCampaign\(c\)/);
  assert.match(source, /JSON\.stringify\(\{\s*until:[^,]+,\s*id:/);
  assert.match(source, /lastId === c\.id/);
  assert.match(source, /dbg\('site-wide cap active'\)/);
  assert.match(source, /downloadUrl/);
  assert.match(source, /privacyUrl/);
  assert.match(source, /v\.indexOf\('\\\\'\) !== -1/);
  assert.doesNotMatch(source, /innerHTML\s*=[^;\n]*(?:downloadUrl|privacyUrl)/);
});

test('manual production triggers respect caps while test triggers force display', () => {
  assert.match(source, /CRE\.trigger = function[\s\S]*show\(c, 'manual', false\)/);
  assert.match(source, /CRE\.triggerTest = function[\s\S]*show\(c, 'manual_test', true\)/);
});

test('widget central close path tears down the dialog keydown handler', () => {
  assert.match(source, /function closeAll\(\) \{\s*if \(openCleanup\) openCleanup\(\)/);
  assert.match(source, /openCleanup = function \(\) \{ document\.removeEventListener\('keydown', onKey\); \}/);
});
