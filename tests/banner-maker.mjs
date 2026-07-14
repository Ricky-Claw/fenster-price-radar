import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ACTION_CALENDAR } from '../src/actionCalendar.js';
import branding from '../tools/banner-maker/branding.json' with { type: 'json' };
import {
  checkAdhocWording,
  parseDateRange,
  resolveBrief,
  selectActiveAction,
} from '../tools/banner-maker/select-action.mjs';
import { readImageMeta } from '../tools/banner-maker/image-meta.mjs';
import { finalizeBanner } from '../tools/banner-maker/compress.mjs';
import { findChrome } from '../tools/lib/find-chrome.mjs';
import { ChromeUnavailableError, renderScreenshot } from '../tools/banner-maker/render.mjs';
import { loadFontsCss } from '../tools/banner-maker/fonts.mjs';
import {
  checkCopyFits,
  classifySize,
  escapeHtml,
  renderBannerHtml,
} from '../tools/banner-maker/banner-template.mjs';
import sizes from '../tools/banner-maker/sizes.json' with { type: 'json' };

const range = parseDateRange('15.05.2026 - 19.07.2026');
assert.equal(range.start.getFullYear(), 2026);
assert.equal(range.start.getMonth(), 4);
assert.equal(range.start.getDate(), 15);
assert.equal(range.start.getHours(), 0);
assert.equal(range.end.getHours(), 23);
assert.equal(range.end.getMilliseconds(), 999);
assert.throws(() => parseDateRange('Quatsch'), /Ungültiger Datumsbereich/);
assert.throws(() => parseDateRange('30.02.2026 - 01.03.2026'), /Ungültiges Datum/);
assert.throws(() => parseDateRange('19.07.2026 - 15.05.2026'), /Start liegt nach dem Ende/);

assert.equal(selectActiveAction(ACTION_CALENDAR, () => new Date(2026, 5, 20)).id, 'ruhiges-heimspiel');
assert.equal(selectActiveAction(ACTION_CALENDAR, () => new Date(2026, 7, 1)).id, 'foerderheld-energieberater');
assert.equal(selectActiveAction(ACTION_CALENDAR, () => new Date(2020, 0, 1)), null);

const heimspiel = resolveBrief({ aktionId: 'ruhiges-heimspiel', calendar: ACTION_CALENDAR, branding });
assert.ok(heimspiel.title);
assert.ok(heimspiel.claim);
assert.ok(heimspiel.offer);
assert.match(heimspiel.badge, /^10/);
assert.ok(!heimspiel.badge.includes('Drutex'));
assert.ok(heimspiel.badge.length <= 20);
assert.ok(heimspiel.wordingDont.length);

const datedBrief = resolveBrief({ calendar: ACTION_CALENDAR, branding, now: () => new Date(2026, 5, 20) });
assert.equal(datedBrief.id, 'ruhiges-heimspiel');

const adhocBrief = resolveBrief({ adhoc: { title: 'Neue Fenster', claim: 'Gut planen.' }, calendar: ACTION_CALENDAR, branding });
assert.equal(adhocBrief.mode, 'adhoc');
assert.equal(adhocBrief.cta, branding.ctaDefault);
assert.throws(
  () => resolveBrief({ adhoc: { id: '../evil', title: 'Neue Fenster', claim: 'Gut planen.' }, calendar: ACTION_CALENDAR, branding }),
  /Ad-hoc-id darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten/,
);
assert.equal(
  resolveBrief({ adhoc: { id: 'sommer-check', title: 'Neue Fenster', claim: 'Gut planen.' }, calendar: ACTION_CALENDAR, branding }).id,
  'sommer-check',
);
assert.throws(() => resolveBrief({ adhoc: { title: 'Ohne Claim' }, calendar: ACTION_CALENDAR, branding }), /claim/);
assert.throws(
  () => resolveBrief({ aktionId: 'unbekannt', calendar: ACTION_CALENDAR, branding }),
  /ruhiges-heimspiel.*foerderheld-energieberater/,
);

const activeWording = resolveBrief({ adhoc: { title: 'Test', claim: '10 % auf alles' }, calendar: ACTION_CALENDAR, branding, now: () => new Date(2026, 5, 20) });
assert.ok(checkAdhocWording(activeWording).length >= 1);
const fifaWording = resolveBrief({ adhoc: { title: 'Test', claim: 'Offizielle FIFA WM-Aktion' }, calendar: ACTION_CALENDAR, branding });
assert.ok(checkAdhocWording(fifaWording).length >= 1);
const cleanWording = resolveBrief({ adhoc: { title: 'Test', claim: 'Fenster planen. Beratung mitdenken.' }, calendar: ACTION_CALENDAR, branding });
assert.deepEqual(checkAdhocWording(cleanWording), []);

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02,
]);
assert.deepEqual(readImageMeta(png), { format: 'png', width: 3, height: 2 });

const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02,
  0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x04, 0x00, 0x05, 0x03,
]);
assert.deepEqual(readImageMeta(jpeg), { format: 'jpeg', width: 5, height: 4 });
assert.deepEqual(readImageMeta(Buffer.from('hallo')), { format: 'unknown', width: null, height: null });

const expectedClasses = {
  'medium-rectangle': 'box',
  'large-rectangle': 'box',
  leaderboard: 'thin',
  billboard: 'wide',
  'wide-skyscraper': 'tall',
  'half-page': 'tall',
  'mobile-banner': 'thin',
  'large-mobile-banner': 'wide',
};
for (const size of sizes.sizes) {
  assert.equal(classifySize(size.width, size.height), expectedClasses[size.name]);
}

const fontsCss = loadFontsCss();
assert.equal((fontsCss.match(/data:font\/woff2;base64,/g) || []).length, 3);
assert.match(fontsCss, /Montserrat/);
assert.match(fontsCss, /Inter/);
assert.ok(fontsCss.length > 30000);
assert.match(fontsCss.replaceAll(' ', ''), /font-display:block/);

const boxSize = { width: 300, height: 250 };
const logoDataUri = 'data:image/png;base64,TEST';
const boxHtml = renderBannerHtml({
  brief: heimspiel,
  size: boxSize,
  branding,
  fontsCss,
  logoDataUri,
});
assert.ok(boxHtml.includes(escapeHtml(heimspiel.claim)));
assert.ok(boxHtml.includes(logoDataUri));
assert.match(boxHtml, /width:\s*300px/);
assert.match(boxHtml, /height:\s*250px/);
assert.ok(!boxHtml.includes('http://'));
assert.ok(!boxHtml.includes('https://'));
assert.ok(!boxHtml.includes('<script'));

const escapedHtml = renderBannerHtml({
  brief: { ...heimspiel, title: '<script>alert(1)</script>' },
  size: boxSize,
  branding,
  fontsCss,
  logoDataUri,
});
assert.ok(escapedHtml.includes('&lt;script&gt;'));
assert.ok(!escapedHtml.includes('<script>alert'));

const thinHtml = renderBannerHtml({
  brief: { ...heimspiel, offer: 'Dieser Offer-Text darf im schmalen Banner nicht erscheinen.' },
  size: { width: 320, height: 50 },
  branding,
  fontsCss,
  logoDataUri,
});
assert.ok(!thinHtml.includes('Dieser Offer-Text darf im schmalen Banner nicht erscheinen.'));
assert.ok(thinHtml.includes(heimspiel.cta));

const wideHtml = renderBannerHtml({
  brief: heimspiel,
  size: { width: 970, height: 250 },
  branding,
  fontsCss,
  logoDataUri,
});
assert.ok(wideHtml.includes(heimspiel.cta));
assert.ok(wideHtml.includes('class="badge"'));

const partnerLogoDataUri = 'data:image/png;base64,PARTNER';
const tallHtml = renderBannerHtml({
  brief: heimspiel,
  size: { width: 160, height: 600 },
  branding,
  fontsCss,
  logoDataUri,
  partnerLogoDataUri,
});
const narrowTallHtml = renderBannerHtml({
  brief: heimspiel,
  size: { width: 120, height: 600 },
  branding,
  fontsCss,
  logoDataUri,
});
assert.ok(narrowTallHtml.includes('banner tall narrow') && !tallHtml.includes('banner tall narrow'));
assert.ok(tallHtml.includes(partnerLogoDataUri));
assert.match(tallHtml, /class="partner-logo"[^>]*src="data:image\/png;base64,PARTNER"/);
assert.ok(!tallHtml.includes('partner-chip'));
assert.doesNotMatch(tallHtml, /\.partner-logo\s*\{[^}]*background\s*:/);
assert.match(tallHtml, /\.tall\.narrow \.partner-logo \{ height: 16px; \}/);

const motifHtml = renderBannerHtml({
  brief: heimspiel,
  size: boxSize,
  branding,
  fontsCss,
  logoDataUri,
  motifDataUri: 'data:image/jpeg;base64,MOTIV',
});
assert.ok(motifHtml.includes('data:image/jpeg;base64,MOTIV'));
assert.ok(motifHtml.includes('object-fit: cover'));
assert.ok(!boxHtml.includes('MOTIV'));

assert.ok(checkCopyFits({ claim: 'x'.repeat(200) }, 'thin').length >= 1);
assert.deepEqual(checkCopyFits({ claim: 'Fenster mit Ruhe planen.' }, 'box'), []);

const flatPng = await sharp({
  create: { width: 600, height: 500, channels: 3, background: '#0C2D57' },
}).png().toBuffer();
const pngBanner = await finalizeBanner({ pngBuffer: flatPng, width: 300, height: 250, preferPng: true });
assert.equal(pngBanner.format, 'png');
assert.deepEqual(readImageMeta(pngBanner.buffer), { format: 'png', width: 300, height: 250 });
assert.ok(pngBanner.bytes <= 150 * 1024);

const jpegBanner = await finalizeBanner({ pngBuffer: flatPng, width: 300, height: 250, preferPng: false });
assert.equal(jpegBanner.format, 'jpeg');
assert.deepEqual(readImageMeta(jpegBanner.buffer), { format: 'jpeg', width: 300, height: 250 });
assert.ok(jpegBanner.bytes <= 150 * 1024);
assert.ok(jpegBanner.quality);

const chrome = findChrome();
if (!chrome) {
  console.log('test:banner: Chrome-Render-Tests übersprungen (Chrome/Chromium nicht gefunden)');
} else {
  const realLogo = path.resolve('src', branding.logo.replace(/^src\//, ''));
  if (!existsSync(realLogo)) throw new Error(`Logo fehlt: ${realLogo}`);
  const realLogoDataUri = `data:image/png;base64,${readFileSync(realLogo).toString('base64')}`;
  const renderSizes = [{ width: 300, height: 250 }, { width: 320, height: 50 }];
  const firstSize = renderSizes[0];
  const firstHtml = renderBannerHtml({ brief: heimspiel, size: firstSize, branding, fontsCss, logoDataUri: realLogoDataUri });
  let firstScreenshot;
  try {
    firstScreenshot = renderScreenshot({ html: firstHtml, width: firstSize.width, height: firstSize.height, chromePath: chrome, workDir: os.tmpdir() });
  } catch (error) {
    if (error instanceof ChromeUnavailableError) {
      console.log(`test:banner: Chrome-Render-Tests übersprungen (${error.message})`);
    } else {
      throw error;
    }
  }
  if (firstScreenshot) {
    for (const [index, size] of renderSizes.entries()) {
      const screenshot = index === 0
        ? firstScreenshot
        : renderScreenshot({
          html: renderBannerHtml({ brief: heimspiel, size, branding, fontsCss, logoDataUri: realLogoDataUri }),
          width: size.width,
          height: size.height,
          chromePath: chrome,
          workDir: os.tmpdir(),
        });
      const banner = await finalizeBanner({ pngBuffer: screenshot, width: size.width, height: size.height, preferPng: true });
      const meta = readImageMeta(banner.buffer);
      assert.equal(meta.width, size.width);
      assert.equal(meta.height, size.height);
      assert.ok(['png', 'jpeg'].includes(meta.format));
      assert.ok(banner.bytes <= 150 * 1024);
      assert.ok(!banner.buffer.subarray(0, 5).toString().startsWith('<?xml'));
      assert.ok(!banner.buffer.subarray(0, 4).toString().startsWith('<svg'));
    }
  }
}

console.log('banner-maker ok');
