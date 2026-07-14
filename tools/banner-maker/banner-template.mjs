export function classifySize(width, height) {
  const ratio = width / height;
  if (ratio >= 5) return 'thin';
  if (ratio >= 2.5) return 'wide';
  if (ratio <= 0.6) return 'tall';
  return 'box';
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeText(value) {
  return escapeHtml(value).replace(/https?:/gi, (protocol) => protocol.replace(':', '&#58;'));
}

function dataUri(value) {
  return typeof value === 'string' && value.startsWith('data:') ? escapeHtml(value) : '';
}

function imageMarkup(className, uri, alt = '') {
  const source = dataUri(uri);
  return source ? `<img class="${className}" src="${source}" alt="${safeText(alt)}">` : '';
}

export function checkCopyFits(brief, sizeClass) {
  const warnings = [];
  const claimLimit = sizeClass === 'thin' ? 90 : 140;
  if (String(brief.claim || '').length > claimLimit) warnings.push(`Claim ist für ${sizeClass} wahrscheinlich zu lang.`);
  if (String(brief.offer || '').length > 200) warnings.push('Offer-Text ist wahrscheinlich zu lang.');
  return warnings;
}

export function renderBannerHtml({
  brief,
  size,
  branding,
  fontsCss,
  logoDataUri,
  partnerLogoDataUri = null,
  motifDataUri = null,
}) {
  const sizeClass = classifySize(size.width, size.height);
  const colors = branding.colors || {};
  const blue = colors.blue || '#0C2D57';
  const orange = colors.orange || '#F47B20';
  const white = colors.white || '#FFFFFF';
  const textOnDark = colors.textOnDark || white;
  const hasMotif = Boolean(dataUri(motifDataUri));
  const isCompactWide = sizeClass === 'wide' && size.height < 200;
  const isNarrowTall = sizeClass === 'tall' && size.width <= 160;
  const showOffer = Boolean(brief.offer) && sizeClass !== 'thin' && !(sizeClass === 'tall' && size.width < 250);
  const showBadge = (Boolean(brief.badge) && sizeClass !== 'thin')
    || (sizeClass === 'thin' && size.width >= 600 && String(brief.badge || '').length <= 20);
  const partner = sizeClass === 'tall' ? imageMarkup('partner-logo', partnerLogoDataUri, brief.partner || 'Partner') : '';
  const motif = hasMotif ? `${imageMarkup('motif', motifDataUri)}<div class="legibility-overlay"></div>` : '';
  const offer = showOffer ? `<p class="offer">${safeText(brief.offer)}</p>` : '';
  const badge = showBadge ? `<span class="badge">${safeText(brief.badge)}</span>` : '';
  const title = sizeClass === 'thin' ? '' : `<p class="title">${safeText(brief.title)}</p>`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<style>
${fontsCss}
html, body { width: ${size.width}px; height: ${size.height}px; margin: 0; overflow: hidden; }
* { box-sizing: border-box; }
body { position: relative; background: ${blue}; color: ${textOnDark}; }
.banner { position: relative; isolation: isolate; width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: linear-gradient(135deg, ${blue}, #17446f); font-family: 'Inter', sans-serif; }
.motif, .legibility-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
.motif { object-fit: cover; z-index: -2; }
.legibility-overlay { z-index: -1; background: linear-gradient(90deg, ${blue} 0%, color-mix(in srgb, ${blue} 92%, transparent) 48%, transparent 100%); }
.content { position: relative; z-index: 1; width: 100%; height: 100%; padding: 7%; display: flex; color: ${textOnDark}; }
.logo { display: block; object-fit: contain; object-position: left center; }
.title { margin: 0 0 .35em; font: 400 clamp(8px, 2vw, 13px)/1.15 'Inter', sans-serif; opacity: .9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.claim { margin: 0; font: 800 clamp(15px, 5vw, 42px)/1.05 'Montserrat', sans-serif; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; }
.offer { margin: .55em 0 0; font: 400 clamp(10px, 2vw, 18px)/1.25 'Inter', sans-serif; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.badge { display: inline-block; width: fit-content; margin-top: .7em; padding: .38em .7em; border-radius: 999px; background: ${orange}; color: ${white}; font: 700 clamp(9px, 1.5vw, 15px)/1 'Inter', sans-serif; }
.cta { display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; background: ${orange}; color: ${white}; font: 700 clamp(10px, 1.6vw, 16px)/1 'Inter', sans-serif; text-decoration: none; white-space: nowrap; }
.partner-logo { display: block; height: 20px; width: auto; max-width: 90px; object-fit: contain; }
.thin .content { align-items: center; gap: 2%; padding: 3px 3%; }
.thin .logo { height: 55%; width: auto; max-width: 31%; flex: 0 0 auto; }
.thin .copy { flex: 1 1 0; min-width: 0; }
.thin .claim { -webkit-line-clamp: 1; white-space: nowrap; text-overflow: ellipsis; font-size: clamp(11px, 2vw, 24px); }
.thin .actions { display: flex; align-items: center; gap: .45em; min-width: 0; }
.thin .cta { flex: 0 0 auto; padding: .65em .9em; font-size: clamp(11px, 1.6vw, 16px); }
.thin .badge { flex: 0 1 auto; min-width: 0; max-width: 140px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wide .content { flex-direction: column; align-items: flex-start; gap: 3%; padding: 20px 7%; }
.wide .logo { height: 22%; width: auto; max-width: 50%; flex: 0 0 auto; }
.wide .copy { max-width: 72%; min-height: 0; }
.wide .claim { -webkit-line-clamp: 2; font-size: clamp(15px, 3vw, 30px); }
.wide .offer { -webkit-line-clamp: 1; }
.wide .actions { display: flex; align-items: center; gap: .7em; width: 100%; margin-top: auto; }
.wide .cta { flex: 0 0 auto; padding: .75em 1.1em; }
.wide .badge { flex: 0 1 auto; min-width: 0; max-width: 60%; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wide.compact .content { flex-direction: row; align-items: center; gap: 3%; padding: 5%; }
.wide.compact .logo { height: 40%; max-width: 31%; }
.wide.compact .copy { flex: 1; min-width: 0; }
.wide.compact .claim { max-width: none; -webkit-line-clamp: 1; white-space: nowrap; text-overflow: ellipsis; font-size: clamp(13px, 4vw, 20px); }
.wide.compact .title { display: none; }
.wide.compact .actions { width: auto; margin: 0; }
.wide.compact .cta { padding: .65em .75em; }
.wide.compact .badge { display: none; }
.box .content { flex-direction: column; align-items: flex-start; }
.box .logo { width: 45%; max-height: 19%; margin-bottom: 7%; }
.box .claim { -webkit-line-clamp: 3; }
.box .offer { -webkit-line-clamp: 1; }
.box .actions { margin-top: auto; }
.box .cta { padding: .8em 1em; }
.tall .legibility-overlay { background: linear-gradient(0deg, ${blue} 0%, color-mix(in srgb, ${blue} 92%, transparent) 58%, transparent 100%); }
.tall .content { flex-direction: column; align-items: flex-start; justify-content: flex-end; padding: 10%; }
.tall .logo { position: absolute; top: 6%; left: 10%; width: 70%; max-height: 16%; }
.tall .claim { -webkit-line-clamp: 5; }
.tall .offer { -webkit-line-clamp: 3; }
.tall .actions { display: flex; flex-direction: column; width: 100%; margin-top: 1em; }
.tall .cta { width: 100%; margin-top: 1em; padding: .85em; }
.tall .partner-logo { margin-top: .7em; }
.tall.narrow .partner-logo { height: 16px; }
</style>
</head>
<body>
<main class="banner ${sizeClass}${isCompactWide ? ' compact' : ''}${isNarrowTall ? ' narrow' : ''}" aria-label="${safeText(brief.title)}">
${motif}
<div class="content">
${imageMarkup('logo', logoDataUri, 'Deutscher Fenstershop')}
<div class="copy">${title}<h1 class="claim">${safeText(brief.claim)}</h1>${offer}</div>
<div class="actions">${badge}${partner}<span class="cta">${safeText(brief.cta)}</span></div>
</div>
</main>
</body>
</html>`;
}
