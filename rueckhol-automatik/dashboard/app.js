/* Conversion Rescue — Dashboard logic. Vanilla JS, no build step. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // App root (origin + optional path prefix), derived from this script's own
  // resolved URL — same trick cre.js uses — so /api/* calls work whether this
  // app sits at a domain root or is proxied under a path prefix (e.g. a Vercel
  // rewrite to /rueckhol/*).
  var APP_BASE = (document.currentScript && document.currentScript.src || '').replace(/\/dashboard\/app\.js(\?.*)?$/, '');

  var state = {
    campaigns: [], presets: [], sites: [],
    site: '',            // active site filter ('' = all)
    draft: null,         // canonical campaign object being edited
    editingId: null,     // id of the campaign being edited (null = new)
    device: 'desktop',
    dirty: false,        // unsaved changes in the editor
    window: 'allTime',   // analytics window: allTime | last7Days
  };

  function setDirty(on) {
    state.dirty = on;
    var btn = document.getElementById('btnSave');
    if (btn) btn.classList.toggle('dirty', on);
    if (on) saveNote('Nicht gespeichert', 'warn');
  }
  // Guard destructive context switches when there are unsaved edits.
  function confirmDiscard() {
    return !state.dirty || window.confirm('Ungespeicherte Änderungen verwerfen?');
  }

  var TRIGGER_LABELS = { exit_intent: 'Ausstieg', idle: 'Inaktiv', time_on_page: 'Nach Zeit', scroll_depth: 'Scroll', manual: 'Manuell' };
  var ACTION_LABELS = { url: 'Link', pdf: 'PDF', coupon: 'Rabattcode', newsletter: 'Newsletter', contact: 'Kontakt' };

  // ---- api ----
  function apiCall(path, opts) {
    return fetch(APP_BASE + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error(body.error || ('Fehler ' + r.status));
        return body;
      });
    });
  }
  function loadData() {
    return apiCall('/api/campaigns').then(function (d) {
      state.campaigns = d.campaigns || [];
      state.presets = d.themePresets || [];
      state.sites = d.sites || [];
    });
  }

  // ---- helpers ----
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function chk(id) { var el = document.getElementById(id); return !!(el && el.checked); }
  function num(id, dflt) { var el = document.getElementById(id); var n = el ? Number(el.value) : NaN; return isFinite(n) ? n : dflt; }
  function setVal(id, val) { var el = document.getElementById(id); if (el) el.value = val == null ? '' : val; }
  function setChk(id, val) { var el = document.getElementById(id); if (el) el.checked = !!val; }

  function toast(msg, isErr) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  // ---- draft <-> form ----
  function defaultTheme() { return state.presets[0] ? clone(state.presets[0]) : { name: 'Standard', position: 'center', colors: {}, font_family: '', radius: 16, logo_url: '', logo_max_height: 44 }; }

  function emptyDraft() {
    return {
      id: '', site_id: state.site || '', site_name: '', name: '', enabled: true,
      trigger: 'exit_intent', trigger_config: { frequencyHours: 24 },
      action_type: 'coupon', action_config: { code: '', label: 'Code kopieren' },
      page_pattern: '*', headline: '', body: '', cta_label: '',
      theme: defaultTheme(), custom_css: '',
    };
  }

  // Write a campaign object into the form inputs.
  function writeForm(c) {
    setVal('f-name', c.name); setVal('f-site', c.site_id); setVal('f-sitename', c.site_name);
    setVal('f-pattern', c.page_pattern === '*' ? '' : c.page_pattern); setChk('f-enabled', c.enabled);
    // trigger
    var trig = c.trigger || 'exit_intent';
    var radio = $('#triggerChoice input[value="' + trig + '"]'); if (radio) radio.checked = true;
    var tc = c.trigger_config || {};
    setVal('f-seconds', tc.seconds != null ? tc.seconds : 20);
    setVal('f-percent', tc.percent != null ? tc.percent : 50);
    setVal('f-cooldown', tc.frequencyHours != null ? tc.frequencyHours : 24);
    // content
    setVal('f-headline', c.headline); setVal('f-body', c.body); setVal('f-cta', c.cta_label);
    // action
    var at = c.action_type || 'coupon';
    var aRadio = $('#actionChoice input[value="' + at + '"]'); if (aRadio) aRadio.checked = true;
    var a = c.action_config || {};
    setVal('a-url', a.url); setChk('a-url-newtab', a.newTab);
    setVal('a-pdf', a.pdfUrl);
    setVal('a-code', a.code);
    setVal('a-news-ph', a.placeholder); setVal('a-news-consent', a.consentLabel); setVal('a-news-ok', a.successMessage);
    setVal('a-con-consent', a.consentLabel); setVal('a-con-ok', a.successMessage);
    // design
    var th = c.theme || {}; var col = th.colors || {};
    ['accent', 'accent_text', 'text', 'muted', 'surface', 'border'].forEach(function (k) {
      var picker = $('[data-color="' + k + '"]'); var hex = $('[data-color-hex="' + k + '"]');
      var val = col[k] || '#000000';
      if (hex) hex.value = val;
      if (picker) picker.value = toHex(val);
    });
    setVal('f-position', th.position || 'center');
    setVal('f-radius', th.radius != null ? th.radius : 18); $('#out-radius').textContent = (th.radius != null ? th.radius : 18) + 'px';
    setVal('f-logo', th.logo_url); setVal('f-font', th.font_family); setVal('f-css', c.custom_css);
    updateActionVisibility(); updateTriggerVisibility();
  }

  // color inputs only accept #rrggbb; keep a safe hex for the native picker
  function toHex(val) { return /^#([0-9a-f]{6})$/i.test(val) ? val : '#000000'; }

  // Build a canonical campaign object from the form.
  function readForm() {
    var d = state.draft || emptyDraft();
    var trigger = ($('#triggerChoice input:checked') || {}).value || 'exit_intent';
    var action = ($('#actionChoice input:checked') || {}).value || 'coupon';
    var tc = { frequencyHours: num('f-cooldown', 24) };
    if (trigger === 'idle' || trigger === 'time_on_page') tc.seconds = num('f-seconds', 30);
    if (trigger === 'scroll_depth') tc.percent = num('f-percent', 50);

    var cta = v('f-cta') || 'Weiter';
    var ac;
    if (action === 'url') ac = { url: v('a-url'), newTab: chk('a-url-newtab'), label: cta };
    else if (action === 'pdf') ac = { pdfUrl: v('a-pdf'), label: cta, newTab: true };
    else if (action === 'coupon') ac = { code: v('a-code'), label: cta };
    else if (action === 'newsletter') ac = { label: cta, placeholder: v('a-news-ph') || 'name@example.com', consentLabel: v('a-news-consent') || 'Ich stimme zu.', successMessage: v('a-news-ok') || 'Danke!' };
    else ac = { label: cta, consentLabel: v('a-con-consent') || 'Ich stimme zu.', successMessage: v('a-con-ok') || 'Danke!' };

    var colors = clone((d.theme && d.theme.colors) || {});
    ['accent', 'accent_text', 'text', 'muted', 'surface', 'border'].forEach(function (k) {
      var hex = $('[data-color-hex="' + k + '"]'); if (hex && hex.value.trim()) colors[k] = hex.value.trim();
    });

    return {
      id: d.id || '', site_id: v('f-site') || 'default', site_name: v('f-sitename'),
      name: v('f-name') || 'Neue Kampagne', enabled: chk('f-enabled'),
      trigger: trigger, trigger_config: tc, action_type: action, action_config: ac,
      page_pattern: v('f-pattern') || '*', headline: v('f-headline'), body: v('f-body'), cta_label: cta,
      theme: {
        name: (d.theme && d.theme.name) || 'Eigen', position: v('f-position') || 'center', colors: colors,
        font_family: v('f-font') || (d.theme && d.theme.font_family) || '',
        radius: num('f-radius', 18),
        logo_url: v('f-logo'), logo_max_height: (d.theme && d.theme.logo_max_height) || 44,
      },
      custom_css: v('f-css'),
    };
  }

  // ---- preview (uses the real widget: window.CRE.preview) ----
  function renderPreview() {
    state.draft = readForm();
    var host = $('#previewHost');
    if (window.CRE && typeof window.CRE.preview === 'function') {
      window.CRE.preview(host, state.draft);
    }
  }
  var previewTimer = null;
  function scheduleForm() {
    updateActionVisibility(); updateTriggerVisibility();
    $('#out-radius').textContent = num('f-radius', 18) + 'px';
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 80);
  }

  // ---- conditional field visibility ----
  function updateActionVisibility() {
    var action = ($('#actionChoice input:checked') || {}).value || 'coupon';
    $$('.act').forEach(function (el) { el.classList.toggle('hidden', el.className.indexOf('act-' + action) === -1); });
  }
  function updateTriggerVisibility() {
    var trigger = ($('#triggerChoice input:checked') || {}).value || 'exit_intent';
    $('#wrap-seconds').classList.toggle('hidden', !(trigger === 'idle' || trigger === 'time_on_page'));
    $('#wrap-percent').classList.toggle('hidden', trigger !== 'scroll_depth');
  }

  // ---- list ----
  function visibleCampaigns() {
    return state.campaigns.filter(function (c) { return !state.site || c.site_id === state.site; });
  }
  function renderList() {
    var list = $('#list'); var items = visibleCampaigns();
    $('#listCount').textContent = items.length;
    if (!items.length) {
      list.innerHTML = '<div class="empty"><h3>Noch keine Kampagne</h3><p>Legen Sie mit „+ Neue Kampagne“ die erste an.</p></div>';
      return;
    }
    list.innerHTML = items.map(function (c) {
      return '<div class="camp" data-id="' + esc(c.id) + '" aria-current="' + (c.id === state.editingId) + '">' +
        '<div class="camp-top"><span class="dot-status ' + (c.enabled ? 'on' : 'off') + '"></span>' +
        '<span class="camp-name">' + esc(c.name) + '</span></div>' +
        '<div class="camp-badges">' +
        '<span class="badge ' + (c.enabled ? 'on' : 'off') + '">' + (c.enabled ? 'Aktiv' : 'Aus') + '</span>' +
        '<span class="badge">' + esc(ACTION_LABELS[c.action_type] || c.action_type) + '</span>' +
        '<span class="badge">' + esc(TRIGGER_LABELS[c.trigger] || c.trigger) + '</span>' +
        (state.site ? '' : '<span class="badge">' + esc(c.site_id) + '</span>') +
        '</div></div>';
    }).join('');
    $$('.camp', list).forEach(function (el) {
      el.addEventListener('click', function () { if (confirmDiscard()) editCampaign(el.getAttribute('data-id')); });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- editing ----
  function editCampaign(id) {
    var c = state.campaigns.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    state.editingId = id; state.draft = clone(c);
    $('#editorTitle').textContent = c.name;
    $('#btnDelete').classList.remove('hidden'); $('#btnDuplicate').classList.remove('hidden');
    writeForm(c); renderPreview(); renderList(); setDirty(false); saveNote('');
  }
  function newCampaign() {
    state.editingId = null; state.draft = emptyDraft();
    $('#editorTitle').textContent = 'Neue Kampagne';
    $('#btnDelete').classList.add('hidden'); $('#btnDuplicate').classList.add('hidden');
    writeForm(state.draft); renderPreview(); renderList(); setDirty(false); saveNote('');
  }

  function saveNote(msg, kind) { var el = $('#saveNote'); el.textContent = msg || ''; el.className = 'save-note' + (kind ? ' ' + kind : ''); }

  function markInvalid(id) {
    $$('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
    var el = document.getElementById(id);
    if (el) { el.classList.add('invalid'); try { el.focus(); } catch (e) {} }
  }
  // Returns an error {msg, field} or null if the payload is publishable.
  function validate(payload) {
    if (!payload.name || payload.name === 'Neue Kampagne') return { msg: 'Bitte einen Namen vergeben.', field: 'f-name' };
    if (!payload.site_id) return { msg: 'Bitte eine Seiten-Kennung angeben.', field: 'f-site' };
    if (!v('f-cta')) return { msg: 'Bitte eine Button-Beschriftung angeben.', field: 'f-cta' };
    var a = payload.action_config || {};
    if (payload.action_type === 'url' && !a.url) return { msg: 'Bitte die Ziel-URL angeben.', field: 'a-url' };
    if (payload.action_type === 'pdf' && !a.pdfUrl) return { msg: 'Bitte die PDF-URL angeben.', field: 'a-pdf' };
    if (payload.action_type === 'coupon' && !a.code) return { msg: 'Bitte den Rabattcode angeben.', field: 'a-code' };
    return null;
  }

  function save() {
    var payload = readForm();
    var err = validate(payload);
    if (err) { saveNote(err.msg, 'err'); markInvalid(err.field); return; }
    $$('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
    var isUpdate = !!state.editingId;
    if (isUpdate) payload.id = state.editingId;
    saveNote('Speichert …');
    var opts = { method: isUpdate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
    apiCall('/api/campaigns', opts).then(function (res) {
      var saved = res.campaign || payload;
      return loadData().then(function () {
        state.editingId = saved.id;
        buildSiteSelect();
        editCampaign(saved.id);
        setDirty(false); saveNote('Gespeichert', 'ok'); toast('Kampagne gespeichert');
      });
    }).catch(function (e) { saveNote(e.message, 'err'); toast(e.message, true); });
  }

  function duplicate() {
    var source = state.campaigns.filter(function (x) { return x.id === state.editingId; })[0];
    if (!source) return;
    if (!confirmDiscard()) return; // unsaved edits on the original are not copied
    var payload = clone(source); payload.id = ''; payload.name = payload.name + ' (Kopie)';
    apiCall('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) {
        var saved = res.campaign || payload;
        return loadData().then(function () { buildSiteSelect(); editCampaign(saved.id); toast('Als Kopie gespeichert'); });
      }).catch(function (e) { toast(e.message, true); });
  }

  function del() {
    if (!state.editingId) return;
    if (!window.confirm('Diese Kampagne wirklich löschen?')) return;
    apiCall('/api/campaigns?id=' + encodeURIComponent(state.editingId), { method: 'DELETE' })
      .then(function () { return loadData(); })
      .then(function () { buildSiteSelect(); var first = visibleCampaigns()[0]; if (first) editCampaign(first.id); else newCampaign(); toast('Gelöscht'); })
      .catch(function (e) { toast(e.message, true); });
  }

  // ---- presets ----
  function renderPresets() {
    var box = $('#presets');
    box.innerHTML = state.presets.map(function (p, i) {
      var c = p.colors || {};
      return '<button class="preset" type="button" data-preset="' + i + '">' +
        '<span class="swatch" style="background:' + esc(c.accent || '#000') + '"></span>' + esc(p.name) + '</button>';
    }).join('');
    $$('.preset', box).forEach(function (el) {
      el.addEventListener('click', function () {
        var p = state.presets[Number(el.getAttribute('data-preset'))]; if (!p) return;
        // keep current logo, apply preset look
        var logo = v('f-logo');
        state.draft = state.draft || emptyDraft();
        state.draft.theme = clone(p); state.draft.theme.logo_url = logo;
        writeThemeInputs(p, logo); renderPreview(); setDirty(true);
      });
    });
  }
  function writeThemeInputs(p, logo) {
    var col = p.colors || {};
    ['accent', 'accent_text', 'text', 'muted', 'surface', 'border'].forEach(function (k) {
      var picker = $('[data-color="' + k + '"]'); var hex = $('[data-color-hex="' + k + '"]');
      if (hex) hex.value = col[k] || '';
      if (picker) picker.value = toHex(col[k] || '#000000');
    });
    setVal('f-position', p.position || 'center');
    setVal('f-radius', p.radius != null ? p.radius : 18); $('#out-radius').textContent = (p.radius != null ? p.radius : 18) + 'px';
    setVal('f-font', p.font_family || ''); setVal('f-logo', logo || '');
  }

  // ---- sites ----
  function buildSiteSelect() {
    var sel = $('#siteSelect');
    var ids = state.sites.map(function (s) { return s.id || s.site_id || s; });
    // include any site_id present on campaigns even if listSites missed it
    state.campaigns.forEach(function (c) { if (ids.indexOf(c.site_id) === -1) ids.push(c.site_id); });
    var opts = '<option value="">Alle Seiten</option>' + ids.map(function (id) {
      return '<option value="' + esc(id) + '"' + (id === state.site ? ' selected' : '') + '>' + esc(id) + '</option>';
    }).join('');
    sel.innerHTML = opts;
  }

  // ---- embed snippet ----
  function showEmbed() {
    var site = state.site || (state.draft && state.draft.site_id) || 'meine-seite';
    var snippet = '<script async src="' + APP_BASE + '/cre.js" data-cre-site="' + site + '" data-cre-api="' + APP_BASE + '"><\/script>';
    window.prompt('Diesen Code einmal ins <head> oder vor </body> Ihrer Seite einfügen:', snippet);
  }

  // ---- analytics ----
  var REASON_LABELS = { button: 'X-Button', x: 'X-Button', backdrop: 'daneben geklickt', esc: 'Esc-Taste' };
  function sumReasons(r) { var s = 0; if (r) Object.keys(r).forEach(function (k) { s += r[k] || 0; }); return s; }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  function renderAnalytics() {
    var view = $('#view-analytics');
    var site = state.site || (visibleCampaigns()[0] && visibleCampaigns()[0].site_id) || (state.campaigns[0] && state.campaigns[0].site_id);
    if (!site) { view.innerHTML = '<div class="panel empty"><h3>Noch keine Daten</h3><p>Sobald eine Kampagne ausgeliefert wird, erscheinen hier die Zahlen.</p></div>'; return; }
    view.innerHTML = '<div class="panel empty"><p>Lädt …</p></div>';
    apiCall('/api/analytics?siteId=' + encodeURIComponent(site)).then(function (d) {
      state.lastAnalytics = { d: d, site: site }; paintAnalytics();
    }).catch(function (e) { view.innerHTML = '<div class="panel empty err">' + esc(e.message) + '</div>'; });
  }

  function paintAnalytics() {
    var wrap = state.lastAnalytics; if (!wrap) return;
    var view = $('#view-analytics');
    var a = wrap.d[state.window] || wrap.d.allTime || {}; var bc = a.byCampaign || {};
    var shown = 0, conv = 0, inter = 0, dismiss = 0;
    Object.keys(bc).forEach(function (k) { var b = bc[k]; shown += b.shown || 0; conv += b.converted || 0; inter += b.interacted || 0; dismiss += sumReasons(b.reasons); });

    var toggle = '<div class="win-toggle">' +
      '<button class="chip" type="button" data-win="allTime" aria-pressed="' + (state.window === 'allTime') + '">Gesamt</button>' +
      '<button class="chip" type="button" data-win="last7Days" aria-pressed="' + (state.window === 'last7Days') + '">Letzte 7 Tage</button></div>';

    var kpis = '<div class="kpis">' +
      kpi(shown, 'Popups gezeigt', 'Seite: ' + esc(wrap.site)) +
      kpi(pct(inter, shown) + '%', 'Klickrate', inter + ' Klicks') +
      kpi(conv, 'Abschlüsse', '') +
      kpi(pct(conv, shown) + '%', 'Abschlussquote', shown ? '' : 'noch keine Daten') +
      kpi(pct(dismiss, shown) + '%', 'Weggeklickt', dismiss + ' Mal') +
      '</div>';

    var compare = (Object.keys(a.byTrigger || {}).length || Object.keys(a.byAction || {}).length)
      ? '<div class="compare"><div class="panel cmp">' + cmpTable('Nach Auslöser', a.byTrigger, TRIGGER_LABELS, 'trigger') + '</div>' +
        '<div class="panel cmp">' + cmpTable('Nach Aktion', a.byAction, ACTION_LABELS, 'actionType') + '</div></div>'
      : '';

    var funnels = Object.keys(bc).length
      ? '<div class="funnels">' + Object.keys(bc).map(function (k) { return funnelCard(bc[k]); }).join('') + '</div>'
      : '<div class="panel empty"><h3>Noch keine Auslieferung</h3><p>Für diesen Zeitraum wurden noch keine Popups gezeigt.</p></div>';

    view.innerHTML = '<div class="ana-head">' + toggle + '</div>' + kpis + compare + funnels;
    $$('.win-toggle .chip', view).forEach(function (el) {
      el.addEventListener('click', function () { state.window = el.getAttribute('data-win'); paintAnalytics(); });
    });
  }

  function cmpTable(title, map, labels, keyName) {
    map = map || {};
    var rows = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (x, y) { return (y.conversionRate || 0) - (x.conversionRate || 0); });
    if (!rows.length) return '<h3>' + esc(title) + '</h3><p class="cmp-empty">Keine Daten.</p>';
    var maxRate = Math.max.apply(null, rows.map(function (r) { return r.conversionRate || 0; }).concat([1]));
    return '<h3>' + esc(title) + '</h3>' + rows.map(function (r) {
      var name = labels[r[keyName]] || r[keyName] || '—';
      return '<div class="cmp-row"><span class="cmp-name">' + esc(name) + '</span>' +
        '<div class="bar"><span style="width:' + pct(r.conversionRate || 0, maxRate) + '%"></span></div>' +
        '<b>' + (r.conversionRate || 0) + '%</b></div>';
    }).join('');
  }

  function kpi(n, l, sub) { return '<div class="panel kpi"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>'; }
  function funnelCard(c) {
    var shown = c.shown || 0, inter = c.interacted || 0, conv = c.converted || 0, dismiss = sumReasons(c.reasons);
    var max = Math.max(shown, 1);
    var reasons = c.reasons && Object.keys(c.reasons).length
      ? '<div class="reasons">Weggeklickt via: ' + Object.keys(c.reasons).map(function (r) { return '<span>' + esc(REASON_LABELS[r] || r) + ' · ' + c.reasons[r] + '</span>'; }).join('') + '</div>'
      : '';
    return '<div class="panel funnel"><h3>' + esc(c.name || c.campaignId) + '</h3>' +
      '<div class="meta"><span class="badge">' + esc(ACTION_LABELS[c.actionType] || c.actionType || '') + '</span>' +
      '<span class="badge">' + esc(TRIGGER_LABELS[c.trigger] || c.trigger || '') + '</span></div>' +
      step('shown', 'Gezeigt', shown, max) +
      step('interacted', 'Interagiert (' + pct(inter, shown) + '%)', inter, max) +
      step('converted', 'Abgeschlossen', conv, max) +
      '<span class="rate">' + (c.conversionRate != null ? c.conversionRate : pct(conv, shown)) + '% Abschlussquote</span>' +
      (dismiss ? '<span class="rate dim">· ' + dismiss + '× weggeklickt</span>' : '') +
      reasons + '</div>';
  }
  function step(cls, label, val, max) {
    var pct = Math.round((val / max) * 100);
    return '<div class="step ' + cls + '"><div class="top"><span>' + label + '</span><b>' + val + '</b></div>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div></div>';
  }

  // ---- views ----
  function switchView(view) {
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === view); });
    $('#view-campaigns').classList.toggle('hidden', view !== 'campaigns');
    $('#view-analytics').classList.toggle('hidden', view !== 'analytics');
    if (view === 'analytics') renderAnalytics();
  }

  // ---- wire up ----
  function bind() {
    $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); }); });
    $('#btnNew').addEventListener('click', function () { if (confirmDiscard()) newCampaign(); });
    $('#btnSave').addEventListener('click', save);
    $('#btnReset').addEventListener('click', function () {
      if (!confirmDiscard()) return;
      if (state.editingId) editCampaign(state.editingId); else newCampaign();
    });
    $('#btnDelete').addEventListener('click', del);
    $('#btnDuplicate').addEventListener('click', duplicate);
    $('#btnEmbed').addEventListener('click', showEmbed);
    $('#siteSelect').addEventListener('change', function () {
      if (!confirmDiscard()) { this.value = state.site; return; } // revert on cancel
      state.site = this.value; renderList();
      var first = visibleCampaigns()[0]; if (first) editCampaign(first.id); else newCampaign();
    });

    // any form input → live preview + mark unsaved
    $('#form').addEventListener('input', function () { scheduleForm(); setDirty(true); });
    $('#form').addEventListener('change', function () { scheduleForm(); setDirty(true); });

    // color picker <-> hex sync
    $$('[data-color]').forEach(function (picker) {
      var key = picker.getAttribute('data-color'); var hex = $('[data-color-hex="' + key + '"]');
      picker.addEventListener('input', function () { hex.value = picker.value; scheduleForm(); setDirty(true); });
      hex.addEventListener('input', function () { if (/^#([0-9a-f]{6})$/i.test(hex.value.trim())) picker.value = hex.value.trim(); scheduleForm(); setDirty(true); });
    });

    $('#chipDesktop').addEventListener('click', function () { setDevice('desktop'); });
    $('#chipMobile').addEventListener('click', function () { setDevice('mobile'); });
  }
  function setDevice(dev) {
    state.device = dev;
    $('#stage').classList.toggle('mobile', dev === 'mobile');
    $('#chipDesktop').setAttribute('aria-pressed', dev === 'desktop');
    $('#chipMobile').setAttribute('aria-pressed', dev === 'mobile');
  }

  // ---- boot ----
  bind();
  loadData().then(function () {
    renderPresets(); buildSiteSelect();
    var first = state.campaigns[0];
    if (first) editCampaign(first.id); else newCampaign();
  }).catch(function (e) { toast('Laden fehlgeschlagen: ' + e.message, true); newCampaign(); });
})();
