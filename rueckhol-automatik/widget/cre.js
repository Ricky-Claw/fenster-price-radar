/* Conversion Rescue — embeddable widget. Self-contained, no dependencies.
 * Version: 1.0.0 (keep in sync with package.json)
 * Embed: <script async src="HOST/cre.js" data-cre-site="SITE" data-cre-api="HOST"></script>
 * Optional: data-cre-debug="1" logs why no popup appears (config errors, no campaigns).
 * Renders an exit-intent/idle rescue popup in a Shadow DOM (no CSS clash with host).
 */
(function () {
  'use strict';
  if (window.__creLoaded) return;
  window.__creLoaded = true;

  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var d = (script && script.dataset) || {};
  var SITE = (d.creSite || 'default').trim();
  var API = (d.creApi || (script && script.src ? script.src.replace(/\/cre\.js.*$/, '') : '')).replace(/\/+$/, '');
  var DEBUG = d.creDebug === '1';
  function dbg(msg) { if (DEBUG && window.console) console.info('[Rueckhol] ' + msg); }

  function api(path) { return API + path; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) {
    var v = String(u || '').trim();
    if (/^https?:\/\//i.test(v) || /^\//.test(v) || /^mailto:/i.test(v)) return v;
    return '';
  }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '')); }

  // ---- suppression (don't nag) ----
  function suppressKey(id) { return 'cre_seen_' + SITE + '_' + id; }
  function isSuppressed(c) {
    try {
      var raw = localStorage.getItem(suppressKey(c.id));
      if (!raw) return false;
      var until = parseInt(raw, 10);
      return isFinite(until) && Date.now() < until;
    } catch (e) { return false; }
  }
  function suppress(c) {
    try {
      var cfg = c.trigger_config || {};
      var raw = cfg.frequencyHours != null ? cfg.frequencyHours : cfg.cooldownHours;
      var hours = raw == null || raw === '' ? 24 : Number(raw);
      if (!isFinite(hours) || hours < 0) hours = 24;
      localStorage.setItem(suppressKey(c.id), String(Date.now() + hours * 3600 * 1000));
    } catch (e) {}
  }

  // ---- events ----
  function track(campaignId, type, metadata) {
    try {
      var body = JSON.stringify({ siteId: SITE, campaignId: campaignId, type: type, metadata: metadata || {} });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(api('/api/events'), new Blob([body], { type: 'application/json' }));
      } else {
        fetch(api('/api/events'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }
  function submit(campaignId, kind, payload) {
    return fetch(api('/api/submit'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: SITE, campaignId: campaignId, kind: kind, payload: payload })
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  // ---- theme ----
  // Reads the canonical (server-normalized) theme shape:
  // { position, colors:{accent,accent_text,text,muted,surface,border,backdrop},
  //   font_family, radius:<number>, logo_url, logo_max_height }
  // Falls back to a flat shape for backward compatibility.
  function theme(c) {
    var t = c.theme || {};
    var col = t.colors || {};
    var radius = typeof t.radius === 'number' ? t.radius + 'px' : (t.radius || '16px');
    return {
      surface: col.surface || t.surface || '#ffffff',
      text: col.text || t.text || '#1a1a1a',
      muted: col.muted || t.muted || '#5a5a5a',
      accent: col.accent || t.accent || '#0d4a3c',
      accentText: col.accent_text || t.accentText || '#ffffff',
      border: col.border || t.border || '#e6e2da',
      backdrop: col.backdrop || t.backdrop || 'rgba(15,20,18,.5)',
      radius: radius,
      font: t.font_family || t.font || 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      logo: safeUrl(t.logo_url || t.logo),
      logoMaxHeight: typeof t.logo_max_height === 'number' ? t.logo_max_height : 34,
      position: t.position || 'center' // center | corner | bar
    };
  }
  function flexAlign(pos) {
    if (pos === 'corner' || pos === 'bottom-right') return 'align-items:flex-end;justify-content:flex-end;';
    if (pos === 'bottom-left') return 'align-items:flex-end;justify-content:flex-start;';
    if (pos === 'bar') return 'align-items:flex-end;justify-content:center;padding:0;';
    return 'align-items:center;justify-content:center;'; // center
  }

  var openHost = null;
  function closeAll() {
    if (openHost && openHost.parentNode) openHost.parentNode.removeChild(openHost);
    openHost = null;
  }

  // ---- action UIs ----
  function actionMarkup(c, t) {
    var a = c.action_config || {};
    var label = esc(c.cta_label || 'Weiter');
    var btn = 'display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:12px 18px;border:0;border-radius:' + t.radius + ';background:' + t.accent + ';color:' + t.accentText + ';font-weight:700;font:inherit;cursor:pointer;text-decoration:none;';
    var inp = 'width:100%;box-sizing:border-box;min-height:46px;padding:11px 13px;border:1px solid ' + t.border + ';border-radius:' + t.radius + ';font:inherit;color:' + t.text + ';background:#fff;';
    var consent = '<label style="display:flex;gap:8px;align-items:flex-start;color:' + t.muted + ';font-size:12px;line-height:1.4;margin-top:2px"><input type="checkbox" data-cre-consent style="margin-top:3px"><span>' + esc(a.consentLabel || 'Ich stimme der Kontaktaufnahme zu.') + '</span></label>';
    var status = '<p data-cre-status aria-live="polite" style="margin:6px 0 0;font-size:13px;font-weight:600;color:' + t.accent + '"></p>';

    switch (c.action_type) {
      case 'url':
        return '<a data-cre-action="url" href="' + esc(safeUrl(a.url)) + '"' + (a.newTab ? ' target="_blank" rel="noopener noreferrer"' : '') + ' style="' + btn + '">' + label + '</a>';
      case 'pdf':
        return '<a data-cre-action="pdf" href="' + esc(safeUrl(a.pdfUrl)) + '" target="_blank" rel="noopener noreferrer" download style="' + btn + '">' + label + '</a>';
      case 'coupon':
        return '<div><div data-cre-code style="display:flex;gap:8px;align-items:center;justify-content:center;border:1px dashed ' + t.accent + ';border-radius:' + t.radius + ';padding:12px;font-size:20px;font-weight:800;letter-spacing:2px;color:' + t.accent + ';margin-bottom:10px">' + esc(a.code || 'CODE') + '</div><button type="button" data-cre-action="coupon" style="' + btn + 'width:100%">' + label + '</button></div>';
      case 'newsletter':
        return '<div data-cre-form="newsletter" style="display:grid;gap:10px"><input data-cre-email type="email" autocomplete="email" placeholder="' + esc(a.placeholder || 'Deine E-Mail') + '" style="' + inp + '">' + consent + '<button type="button" data-cre-action="newsletter" style="' + btn + '">' + label + '</button>' + status + '</div>';
      case 'contact':
        return '<div data-cre-form="contact" style="display:grid;gap:10px"><input data-cre-name type="text" placeholder="Name" style="' + inp + '"><input data-cre-email type="email" autocomplete="email" placeholder="E-Mail" style="' + inp + '"><textarea data-cre-message rows="3" placeholder="Deine Nachricht" style="' + inp + 'resize:vertical"></textarea>' + consent + '<button type="button" data-cre-action="contact" style="' + btn + '">' + label + '</button>' + status + '</div>';
      default:
        return '<button type="button" data-cre-action="close" style="' + btn + '">' + label + '</button>';
    }
  }

  function bindActions(root, c) {
    function setStatus(msg, ok) {
      var el = root.querySelector('[data-cre-status]');
      if (el) { el.textContent = msg; el.style.color = ok ? '#1a7f4b' : '#b3261e'; }
    }
    var url = root.querySelector('[data-cre-action="url"], [data-cre-action="pdf"]');
    if (url) url.addEventListener('click', function () {
      track(c.id, 'cta_click', { action: c.action_type });
      // emit the canonical conversion event the analytics engine counts
      track(c.id, c.action_type === 'pdf' ? 'pdf_open' : 'url_open', { action: c.action_type });
      suppress(c);
    });

    var coupon = root.querySelector('[data-cre-action="coupon"]');
    if (coupon) coupon.addEventListener('click', function () {
      var code = (c.action_config && c.action_config.code) || '';
      track(c.id, 'cta_click', { action: 'coupon' });
      try { navigator.clipboard && navigator.clipboard.writeText(code); } catch (e) {}
      coupon.textContent = 'Kopiert ✓';
      track(c.id, 'coupon_reveal', { action: 'coupon' });
      suppress(c);
    });

    ['newsletter', 'contact'].forEach(function (kind) {
      var b = root.querySelector('[data-cre-action="' + kind + '"]');
      if (!b) return;
      b.addEventListener('click', function () {
        var email = root.querySelector('[data-cre-email]');
        var consent = root.querySelector('[data-cre-consent]');
        if (!email || !isEmail(email.value)) { setStatus('Bitte gültige E-Mail eingeben.', false); return; }
        if (!consent || !consent.checked) { setStatus('Bitte die Zustimmung setzen.', false); return; }
        var payload = { email: email.value, consent: true };
        if (kind === 'contact') {
          var nm = root.querySelector('[data-cre-name]'); var msg = root.querySelector('[data-cre-message]');
          payload.name = nm ? nm.value : ''; payload.message = msg ? msg.value : '';
        }
        track(c.id, 'cta_click', { action: kind });
        b.disabled = true; setStatus('Wird gesendet …', true);
        submit(c.id, kind, payload).then(function (ok) {
          if (ok) {
            // conversion is recorded server-side (/api/submit -> newsletter_opt_in / contact_submit)
            suppress(c);
            var form = root.querySelector('[data-cre-form]');
            var okMsg = (c.action_config && c.action_config.successMessage) || 'Danke! Wir melden uns.';
            if (form) form.innerHTML = '<p style="margin:0;font-weight:700;color:#1a7f4b">' + esc(okMsg) + '</p>';
          } else { b.disabled = false; setStatus('Etwas ging schief. Bitte später erneut.', false); }
        });
      });
    });
  }

  // ---- render ----
  // Builds the full shadow-root markup. Shared by the live popup and the
  // dashboard preview so both look identical. `contained` renders the backdrop
  // absolutely inside a positioned host (preview panel) instead of fixed to the
  // viewport, and drops the entrance animation.
  function innerHtml(c, t, contained) {
    var logo = t.logo ? '<img src="' + esc(t.logo) + '" alt="" style="height:' + t.logoMaxHeight + 'px;width:auto;margin-bottom:10px">' : '';
    var custom = c.custom_css ? '<style>' + String(c.custom_css).replace(/<\/style/gi, '<\\/style') + '</style>' : '';
    var backPos = contained ? 'position:absolute' : 'position:fixed';
    var anim = contained ? '' : 'animation:creFade .2s ease';
    var boxAnim = contained ? '' : ';animation:crePop .28s cubic-bezier(.16,1,.3,1)';
    return '<style>' +
      ':host,*{box-sizing:border-box}' +
      '.cre-back{' + backPos + ';inset:0;background:' + t.backdrop + ';display:flex;padding:16px;' + flexAlign(t.position) + anim + '}' +
      '.cre-box{position:relative;max-width:' + (t.position === 'bar' ? 'none' : '400px') + ';width:100%;background:' + t.surface + ';color:' + t.text + ';font-family:' + t.font + ';border:1px solid ' + t.border + ';border-radius:' + (t.position === 'bar' ? '0' : t.radius) + ';box-shadow:0 24px 60px rgba(0,0,0,.28);padding:22px 20px' + boxAnim + '}' +
      '.cre-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border:1px solid ' + t.border + ';background:' + t.surface + ';color:' + t.muted + ';border-radius:10px;font-size:18px;line-height:1;cursor:pointer}' +
      '.cre-x:hover{background:' + t.border + '}' +
      '.cre-h{margin:0 30px 8px 0;font-size:21px;line-height:1.2;color:' + t.text + '}' +
      '.cre-b{margin:0 0 16px;color:' + t.muted + ';line-height:1.5;font-size:15px}' +
      '@keyframes creFade{from{opacity:0}to{opacity:1}}@keyframes crePop{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}' +
      '@media (prefers-reduced-motion:reduce){.cre-back,.cre-box{animation:none}}' +
      '</style>' + custom +
      '<div class="cre-back" data-cre-back>' +
      '<div class="cre-box" role="dialog" aria-modal="true" aria-labelledby="cre-title">' +
      '<button class="cre-x" type="button" data-cre-close aria-label="Schließen"><span aria-hidden="true">×</span></button>' +
      logo +
      '<h2 class="cre-h" id="cre-title">' + esc(c.headline || 'Hinweis') + '</h2>' +
      '<p class="cre-b">' + esc(c.body || '') + '</p>' +
      actionMarkup(c, t) +
      '</div></div>';
  }

  function show(c, trigger, force) {
    if (openHost || (!force && isSuppressed(c))) return;
    var t = theme(c);
    var host = document.createElement('div');
    host.setAttribute('data-cre-host', '');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;';
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    shadow.innerHTML = innerHtml(c, t, false);
    var prevFocus = document.activeElement;

    function focusables() { return Array.prototype.slice.call(shadow.querySelectorAll('input,button,a,textarea,select,[tabindex]')); }
    function close(reason) {
      document.removeEventListener('keydown', onKey);
      track(c.id, 'close', { reason: reason || 'x', trigger: trigger });
      suppress(c);
      closeAll();
      try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) {}
    }
    function onKey(e) {
      if (e.key === 'Escape') { close('esc'); return; }
      if (e.key !== 'Tab') return;
      // trap focus inside the dialog while aria-modal is set
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1], active = shadow.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    shadow.querySelector('[data-cre-close]').addEventListener('click', function () { close('button'); });
    var backEl = shadow.querySelector('[data-cre-back]');
    backEl.addEventListener('click', function (e) { if (e.target === backEl) close('backdrop'); });
    document.addEventListener('keydown', onKey);
    bindActions(shadow, c);

    document.body.appendChild(host);
    openHost = host;
    track(c.id, 'popup_shown', { trigger: trigger });
    var focusEl = shadow.querySelector('input,button,a');
    if (focusEl) try { focusEl.focus(); } catch (e) {}
  }

  // ---- triggers ----
  function matchesPage(c) {
    // '*' is the server/dashboard default for "all pages" — must match everything,
    // not be substring-searched in the URL (that silently killed every auto-trigger).
    if (!c.page_pattern || c.page_pattern === '*') return true;
    return location.href.indexOf(c.page_pattern) !== -1 || location.pathname.indexOf(c.page_pattern) !== -1;
  }
  function arm(campaigns) {
    var fired = {};
    function fire(c, trig) {
      if (fired[c.id] || !matchesPage(c) || isSuppressed(c)) return;
      fired[c.id] = true;
      show(c, trig);
    }
    campaigns.forEach(function (c) {
      if (!c.enabled) return;
      var cfg = c.trigger_config || {};
      if (c.trigger === 'exit_intent') {
        document.addEventListener('mouseout', function (e) {
          if (!e.relatedTarget && e.clientY <= 0) fire(c, 'exit_intent');
        });
        // Touch devices have no mouse-leave signal. A fast upward flick
        // (back toward the top/browser chrome) is the mobile equivalent of
        // "about to leave" — same trigger category. Sampled on a fixed
        // interval rather than diffed between raw scroll events: native
        // touch scrolling fires many small steps (~16ms apart), so a real
        // fast flick shows up as distance-per-tick, not one big single jump.
        var sampleY = window.scrollY;
        var scrollSampler = setInterval(function () {
          var y = window.scrollY;
          if (sampleY - y > 70) { fire(c, 'exit_intent'); clearInterval(scrollSampler); }
          sampleY = y;
        }, 120);
      } else if (c.trigger === 'idle') {
        var secs = Number(cfg.seconds) || 30, timer;
        function reset() { clearTimeout(timer); timer = setTimeout(function () { fire(c, 'idle'); }, secs * 1000); }
        ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, reset, { passive: true }); });
        reset();
      } else if (c.trigger === 'time_on_page') {
        setTimeout(function () { fire(c, 'time_on_page'); }, (Number(cfg.seconds) || 15) * 1000);
      } else if (c.trigger === 'scroll_depth') {
        var pct = Number(cfg.percent) || 50;
        function onScroll() {
          var h = document.documentElement.scrollHeight - window.innerHeight;
          if (h > 0 && (window.scrollY / h) * 100 >= pct) { window.removeEventListener('scroll', onScroll); fire(c, 'scroll_depth'); }
        }
        window.addEventListener('scroll', onScroll, { passive: true });
      }
      // 'manual' → via window.CRE.trigger(id)
    });
    window.CRE = window.CRE || {};
    window.CRE.trigger = function (id) {
      var c = campaigns.filter(function (x) { return x.id === id; })[0];
      if (c) { closeAll(); show(c, 'manual', true); }
    };
    window.CRE.close = closeAll;
  }

  // Global API available even before/without campaigns (used by the dashboard).
  window.CRE = window.CRE || {};
  window.CRE.close = closeAll;
  // Render an in-progress campaign into a host element for a live design preview.
  // No tracking, no navigation, no persistence — purely visual WYSIWYG.
  window.CRE.preview = function (hostEl, campaign) {
    if (!hostEl) return;
    var shadow = hostEl.__creShadow;
    if (!shadow) {
      shadow = hostEl.attachShadow ? hostEl.attachShadow({ mode: 'open' }) : hostEl;
      hostEl.__creShadow = shadow;
      shadow.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
    }
    shadow.innerHTML = innerHtml(campaign || {}, theme(campaign || {}), true);
  };

  function init() {
    fetch(api('/api/config?siteId=' + encodeURIComponent(SITE)), { credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) dbg('config request failed: HTTP ' + r.status + ' (check data-cre-api and SITE_ORIGINS)');
        return r.json();
      })
      .then(function (data) {
        var campaigns = (data && data.campaigns) || [];
        if (!campaigns.length) { dbg('no active campaigns for site "' + SITE + '" — create one in the dashboard'); return; }
        dbg(campaigns.length + ' campaign(s) armed for site "' + SITE + '"');
        arm(campaigns);
      })
      .catch(function (e) { dbg('config fetch error: ' + (e && e.message ? e.message : 'network/CORS') + ' — popup stays off'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
