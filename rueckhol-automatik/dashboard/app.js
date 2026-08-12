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
    window: 'allTime',   // analytics window: allTime | last7Days | last30Days | last90Days | last180Days | last365Days
    leadsGen: 0,         // ignores stale lead responses after a site switch
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

  // ---- what's new banner ----
  // Bump WHATS_NEW_VERSION + replace WHATS_NEW_ITEMS whenever there's something
  // worth telling Elvis about. Dismissing stores the version he's seen, so the
  // banner reappears only once there's something newer than that.
  var WHATS_NEW_VERSION = '1.14.0';
  var WHATS_NEW_ITEMS = [
    'Auswertung korrigiert: Ein Popup, das bereits zu einem Abschluss geführt hat (Gutschein, Anmeldung, Anfrage), zählte beim anschließenden Schließen fälschlich auch als „weggeklickt". Das ist jetzt korrekt.',
    'Alle Zahlen in der Auswertung erklären sich jetzt selbst: Kurz mit der Maus draufhalten zeigt in einem Satz, was genau gezählt wird.',
  ];
  function initWhatsNew() {
    try {
      var KEY = 'cre_whatsnew_seen';
      if (localStorage.getItem(KEY) === WHATS_NEW_VERSION) return;
      $('#whatsNewTitle').textContent = 'Was ist neu (Stand v' + WHATS_NEW_VERSION + ')';
      $('#whatsNewList').innerHTML = WHATS_NEW_ITEMS.map(function (item) { return '<li>' + item + '</li>'; }).join('');
      $('#whatsNew').classList.remove('hidden');
      $('#btnWhatsNewClose').addEventListener('click', function () {
        try { localStorage.setItem(KEY, WHATS_NEW_VERSION); } catch (e) {}
        $('#whatsNew').classList.add('hidden');
      });
    } catch (e) { /* localStorage unavailable (e.g. private mode) — just skip the banner */ }
  }

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
      page_exclude: '',
      theme: defaultTheme(), custom_css: '',
    };
  }

  function renderExtraFields(fields) {
    var list = $('#a-con-extra-fields');
    fields = Array.isArray(fields) ? fields.slice(0, 5) : [];
    list.innerHTML = fields.map(function (field, index) {
      var type = ['text', 'tel', 'email', 'number'].indexOf(field.type) !== -1 ? field.type : 'text';
      return '<div class="extra-field-row" data-extra-field>' +
        '<input type="text" maxlength="60" data-extra-label placeholder="Beschriftung" value="' + esc(field.label || '') + '">' +
        '<select data-extra-type aria-label="Art des zusätzlichen Feldes">' +
        '<option value="text"' + (type === 'text' ? ' selected' : '') + '>Text</option>' +
        '<option value="tel"' + (type === 'tel' ? ' selected' : '') + '>Telefon</option>' +
        '<option value="email"' + (type === 'email' ? ' selected' : '') + '>E-Mail</option>' +
        '<option value="number"' + (type === 'number' ? ' selected' : '') + '>Zahl</option></select>' +
        '<button class="btn btn-sm" type="button" data-extra-remove="' + index + '">Entfernen</button></div>';
    }).join('');
    $('#a-con-extra-add').disabled = fields.length >= 5;
  }

  function readExtraFields() {
    return $$('[data-extra-field]', $('#a-con-extra-fields')).map(function (row) {
      return { label: $('[data-extra-label]', row).value.trim(), type: $('[data-extra-type]', row).value };
    }).filter(function (field) { return field.label; }).slice(0, 5);
  }

  // Write a campaign object into the form inputs.
  function writeForm(c) {
    setVal('f-name', c.name); setVal('f-site', c.site_id); setVal('f-sitename', c.site_name);
    setVal('f-pattern', c.page_pattern === '*' ? '' : c.page_pattern); setChk('f-enabled', c.enabled);
    setVal('f-exclude', c.page_exclude || '');
    // trigger
    var trig = c.trigger || 'exit_intent';
    var radio = $('#triggerChoice input[value="' + trig + '"]'); if (radio) radio.checked = true;
    var tc = c.trigger_config || {};
    setVal('f-seconds', tc.seconds != null ? tc.seconds : 20);
    setVal('f-percent', tc.percent != null ? tc.percent : 50);
    setVal('f-cooldown', tc.frequencyHours != null ? tc.frequencyHours : 24);
    setChk('f-ignore-pause', tc.ignoreSitePause);
    // content
    setVal('f-headline', c.headline); setVal('f-body', c.body); setVal('f-cta', c.cta_label);
    // action
    var at = c.action_type || 'coupon';
    var aRadio = $('#actionChoice input[value="' + at + '"]'); if (aRadio) aRadio.checked = true;
    var a = c.action_config || {};
    setVal('a-url', a.url); setChk('a-url-newtab', a.newTab);
    setVal('a-pdf', a.pdfUrl);
    setVal('a-code', a.code);
    setVal('a-news-ph', a.placeholder); setVal('a-news-download', a.downloadUrl);
    setVal('a-news-consent', a.consentLabel); setVal('a-news-ok', a.successMessage);
    setVal('a-privacy', a.privacyUrl);
    setVal('a-con-consent', a.consentLabel); setVal('a-con-ok', a.successMessage);
    setChk('a-con-upload', a.allowUpload);
    renderExtraFields(a.extraFields);
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
    var tc = { frequencyHours: num('f-cooldown', 24), ignoreSitePause: chk('f-ignore-pause') };
    if (trigger === 'idle' || trigger === 'time_on_page') tc.seconds = num('f-seconds', 30);
    if (trigger === 'scroll_depth') tc.percent = num('f-percent', 50);

    var cta = v('f-cta') || 'Weiter';
    var ac;
    if (action === 'url') ac = { url: v('a-url'), newTab: chk('a-url-newtab'), label: cta };
    else if (action === 'pdf') ac = { pdfUrl: v('a-pdf'), label: cta, newTab: true };
    else if (action === 'coupon') ac = { code: v('a-code'), label: cta };
    else if (action === 'newsletter') ac = { label: cta, placeholder: v('a-news-ph') || 'name@example.com', downloadUrl: v('a-news-download'), privacyUrl: v('a-privacy'), consentLabel: v('a-news-consent') || 'Ich stimme zu.', successMessage: v('a-news-ok') || 'Danke!' };
    else ac = { label: cta, privacyUrl: v('a-privacy'), consentLabel: v('a-con-consent') || 'Ich stimme zu.', successMessage: v('a-con-ok') || 'Danke!', allowUpload: chk('a-con-upload'), extraFields: readExtraFields() };

    var colors = clone((d.theme && d.theme.colors) || {});
    ['accent', 'accent_text', 'text', 'muted', 'surface', 'border'].forEach(function (k) {
      var hex = $('[data-color-hex="' + k + '"]'); if (hex && hex.value.trim()) colors[k] = hex.value.trim();
    });

    return {
      id: d.id || '', site_id: v('f-site') || 'default', site_name: v('f-sitename'),
      name: v('f-name') || 'Neue Kampagne', enabled: chk('f-enabled'),
      trigger: trigger, trigger_config: tc, action_type: action, action_config: ac,
      page_pattern: v('f-pattern') || '*', page_exclude: v('f-exclude'), headline: v('f-headline'), body: v('f-body'), cta_label: cta,
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
    $('#mobileInterstitialHint').classList.toggle('hidden', !(v('f-position') === 'center' && trigger !== 'exit_intent'));
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
    if (a.downloadUrl && (a.downloadUrl.indexOf('\\') !== -1 || a.downloadUrl.length > 500)) return { msg: 'Der Freebie-Link darf keinen Backslash enthalten und höchstens 500 Zeichen lang sein.', field: 'a-news-download' };
    if (a.privacyUrl && (a.privacyUrl.indexOf('\\') !== -1 || a.privacyUrl.length > 500)) return { msg: 'Der Datenschutz-Link darf keinen Backslash enthalten und höchstens 500 Zeichen lang sein.', field: 'a-privacy' };
    if (a.downloadUrl && !(/^https:\/\//i.test(a.downloadUrl) || /^\/(?!\/)/.test(a.downloadUrl))) return { msg: 'Bitte für den Freebie-Download einen https-Link oder wurzelrelativen Pfad angeben.', field: 'a-news-download' };
    if (a.privacyUrl && !(/^https:\/\//i.test(a.privacyUrl) || /^\/(?!\/)/.test(a.privacyUrl))) return { msg: 'Bitte für den Datenschutz einen https-Link oder wurzelrelativen Pfad angeben.', field: 'a-privacy' };
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
    updateSiteCooldownField();
  }

  function updateSiteCooldownField() {
    var field = $('#siteCooldownField');
    var input = $('#siteCooldownHours');
    var mailField = $('#siteLeadMailField');
    var mailInput = $('#siteLeadMailTo');
    var site = state.sites.find(function (item) { return (item.id || item.site_id || item) === state.site; });
    field.classList.toggle('hidden', !state.site);
    mailField.classList.toggle('hidden', !state.site);
    input.disabled = !state.site;
    mailInput.disabled = !state.site;
    input.value = site && Number.isInteger(Number(site.cooldown_hours)) ? Number(site.cooldown_hours) : 0;
    mailInput.value = site && site.lead_mail_to || '';
  }

  function saveSiteCooldown() {
    if (!state.site) return;
    var input = $('#siteCooldownHours');
    var hours = Number(input.value);
    return apiCall('/api/site-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: state.site, cooldownHours: hours })
    }).then(function (result) {
      var site = state.sites.find(function (item) { return (item.id || item.site_id || item) === state.site; });
      if (site && typeof site === 'object') site.cooldown_hours = result.cooldownHours;
      input.value = result.cooldownHours;
      toast('Anzeige-Pause gespeichert');
    }).catch(function (e) { updateSiteCooldownField(); toast(e.message, true); });
  }

  function saveSiteLeadMailTo() {
    if (!state.site) return;
    var input = $('#siteLeadMailTo');
    return apiCall('/api/site-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: state.site, leadMailTo: input.value.trim() })
    }).then(function (result) {
      var site = state.sites.find(function (item) { return (item.id || item.site_id || item) === state.site; });
      if (site && typeof site === 'object') site.lead_mail_to = result.leadMailTo;
      input.value = result.leadMailTo;
      toast('Lead-Mail-Empfänger gespeichert');
    }).catch(function (e) { updateSiteCooldownField(); toast(e.message, true); });
  }

  // ---- embed snippet ----
  function showEmbed() {
    var site = state.site || (state.draft && state.draft.site_id) || 'meine-seite';
    var snippet = '<script async src="' + APP_BASE + '/cre.js" data-cre-site="' + site + '" data-cre-api="' + APP_BASE + '"><\/script>';
    window.prompt('Diesen Code einmal ins <head> oder vor </body> Ihrer Seite einfügen:', snippet);
  }

  function checkInstall() {
    var button = $('#btnInstallCheck'); var panel = $('#installCheckResult');
    var site = state.site || (state.draft && state.draft.site_id) || '';
    if (!site) { panel.textContent = 'Bitte zuerst eine Seite auswählen.'; return; }
    button.disabled = true; button.textContent = 'Prüfe …'; panel.textContent = 'Einbau wird geprüft …';
    apiCall('/api/install-check?siteId=' + encodeURIComponent(site)).then(function (data) {
      if (!data.geprueft || !data.geprueft.length) { panel.textContent = 'Für diese Seiten-Kennung ist noch keine Domain hinterlegt (SITE_ORIGINS).'; return; }
      panel.innerHTML = data.geprueft.map(function (item) {
        var ok = item.gefunden;
        return '<div>' + (ok ? '✓ Gefunden auf ' : '✕ Nicht gefunden auf ') + esc(item.origin) + (item.fehler ? ' — ' + esc(item.fehler) : '') + '</div>';
      }).join('');
    }).catch(function (e) { panel.textContent = 'Einbauprüfung nicht möglich: ' + e.message; })
      .finally(function () { button.disabled = false; button.textContent = 'Einbau prüfen'; });
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
      '<button class="chip" type="button" data-win="last7Days" aria-pressed="' + (state.window === 'last7Days') + '">Letzte 7 Tage</button>' +
      '<button class="chip" type="button" data-win="last30Days" aria-pressed="' + (state.window === 'last30Days') + '">Letzter Monat</button>' +
      '<button class="chip" type="button" data-win="last90Days" aria-pressed="' + (state.window === 'last90Days') + '">3 Monate</button>' +
      '<button class="chip" type="button" data-win="last180Days" aria-pressed="' + (state.window === 'last180Days') + '">6 Monate</button>' +
      '<button class="chip" type="button" data-win="last365Days" aria-pressed="' + (state.window === 'last365Days') + '">Jahr</button>' +
      '<button class="chip" type="button" data-win="allTime" aria-pressed="' + (state.window === 'allTime') + '">Gesamt</button></div>';

    var kpis = '<div class="kpis">' +
      kpi(shown, 'Popups gezeigt', 'Seite: ' + esc(wrap.site), 'Wie oft dieses Popup einem Besucher angezeigt wurde.') +
      kpi(pct(inter, shown) + '%', 'Klickrate', inter + ' Klicks', 'Anteil der gezeigten Popups, bei denen jemand auf den Button geklickt hat.') +
      kpi(conv, 'Abschlüsse', '', 'Wie oft daraus eine Anfrage, Anmeldung oder ein Klick zum Ziel wurde.') +
      kpi(pct(conv, shown) + '%', 'Abschlussquote', shown ? '' : 'noch keine Daten', 'Anteil der gezeigten Popups, die zu einem Abschluss geführt haben.') +
      kpi(pct(dismiss, shown) + '%', 'Weggeklickt', dismiss + ' Mal', 'Wie oft das Popup geschlossen wurde, ohne dass zuvor ein Abschluss stattfand.') +
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

  function kpi(n, l, sub, tip) { return '<div class="panel kpi"><div class="n">' + esc(n) + '</div><div class="l"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + esc(l) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>'; }
  function funnelCard(c) {
    var shown = c.shown || 0, inter = c.interacted || 0, conv = c.converted || 0, dismiss = sumReasons(c.reasons);
    var max = Math.max(shown, 1);
    var reasons = c.reasons && Object.keys(c.reasons).length
      ? '<div class="reasons">Weggeklickt via: ' + Object.keys(c.reasons).map(function (r) { return '<span>' + esc(REASON_LABELS[r] || r) + ' · ' + c.reasons[r] + '</span>'; }).join('') + '</div>'
      : '';
    return '<div class="panel funnel"><h3>' + esc(c.name || c.campaignId) + '</h3>' +
      '<div class="meta"><span class="badge">' + esc(ACTION_LABELS[c.actionType] || c.actionType || '') + '</span>' +
      '<span class="badge">' + esc(TRIGGER_LABELS[c.trigger] || c.trigger || '') + '</span></div>' +
      step('shown', 'Gezeigt', shown, max, 'Wie oft dieses Popup einem Besucher angezeigt wurde.') +
      step('interacted', 'Interagiert (' + pct(inter, shown) + '%)', inter, max, 'Wie oft jemand auf den Button in diesem Popup geklickt hat — unabhängig davon, ob daraus ein Abschluss wurde.') +
      step('converted', 'Abgeschlossen', conv, max, 'Wie oft daraus eine Anfrage, Anmeldung oder ein Klick zum Ziel wurde.') +
      '<span class="rate" title="Anteil der gezeigten Popups, die zu einem Abschluss geführt haben.">' + (c.conversionRate != null ? c.conversionRate : pct(conv, shown)) + '% Abschlussquote</span>' +
      (dismiss ? '<span class="rate dim" title="Wie oft das Popup geschlossen wurde, ohne dass zuvor ein Abschluss stattfand.">· ' + dismiss + '× weggeklickt</span>' : '') +
      reasons + '</div>';
  }
  function step(cls, label, val, max, tip) {
    var pct = Math.round((val / max) * 100);
    return '<div class="step ' + cls + '"><div class="top"><span' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + label + '</span><b>' + val + '</b></div>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div></div>';
  }

  // ---- leads (all foreign input is written via textContent) ----
  function renderLeads() {
    var view = $('#view-leads');
    var gen = ++state.leadsGen;
    var site = state.site || (visibleCampaigns()[0] && visibleCampaigns()[0].site_id) || (state.campaigns[0] && state.campaigns[0].site_id) || (state.sites[0] && (state.sites[0].id || state.sites[0].site_id || state.sites[0]));
    if (!site) {
      renderLeadRows([], '');
      return;
    }
    var loading = document.createElement('div');
    loading.className = 'panel empty';
    var loadingText = document.createElement('p');
    loadingText.textContent = 'Lädt …';
    loading.appendChild(loadingText);
    view.replaceChildren(loading);

    apiCall('/api/submissions?site=' + encodeURIComponent(site)).then(function (d) {
      if (gen !== state.leadsGen) return;
      renderLeadRows(d.submissions || [], site);
    }).catch(function () {
      if (gen !== state.leadsGen) return;
      var error = document.createElement('div');
      error.className = 'panel empty err';
      error.textContent = 'Leads konnten nicht geladen werden. Bitte später erneut versuchen.';
      view.replaceChildren(error);
    });
  }

  function renderLeadRows(leads, site) {
    var view = $('#view-leads');
    var panel = document.createElement('div');
    panel.className = 'panel leads-panel';

    var head = document.createElement('div');
    head.className = 'leads-head';
    var title = document.createElement('h2');
    title.textContent = 'Leads';
    var download = document.createElement('a');
    download.className = 'btn';
    download.textContent = 'CSV herunterladen';
    if (site) {
      download.href = APP_BASE + '/api/submissions?site=' + encodeURIComponent(site) + '&format=csv';
    } else {
      download.setAttribute('aria-disabled', 'true');
      download.removeAttribute('href');
    }
    head.appendChild(title);
    head.appendChild(download);
    panel.appendChild(head);

    if (!leads.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Noch keine Leads — sobald ein Besucher im Popup seine E-Mail lässt, erscheint sie hier.';
      panel.appendChild(empty);
      view.replaceChildren(panel);
      return;
    }

    leads.sort(function (a, b) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    var campaignNames = {};
    state.campaigns.forEach(function (campaign) { campaignNames[campaign.id] = campaign.name; });

    var scroll = document.createElement('div');
    scroll.className = 'leads-table-scroll';
    var table = document.createElement('table');
    table.className = 'leads-table';
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    ['Datum', 'Typ', 'E-Mail', 'Name', 'Nachricht', 'Kampagne', 'Seite', 'Datei', 'Aktion'].forEach(function (label) {
      var th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    leads.forEach(function (lead) {
      var message = String(lead.message || '');
      if (message.length > 120) message = message.slice(0, 117) + '…';
      var date = lead.createdAt ? new Date(lead.createdAt).toLocaleString('de-DE') : '—';
      var type = lead.type === 'newsletter' ? 'Newsletter' : (lead.type === 'contact' ? 'Kontakt' : lead.type);
      var values = [date, type || '—', lead.email || '—', lead.name || '—', message || '—', campaignNames[lead.campaignId] || lead.campaignId || '—', lead.page || '—'];
      var row = document.createElement('tr');
      values.forEach(function (value) {
        var cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      // Angehängte Datei: als Link zum Öffnen. Ist sie nach Ablauf der
      // Aufbewahrung nicht mehr da, sagen wir das, statt einen toten Link
      // anzubieten — der Lead selbst bleibt ja bestehen.
      var fileCell = document.createElement('td');
      var att = lead.attachment;
      if (!att) {
        fileCell.textContent = '—';
      } else if (att.abgelaufen) {
        fileCell.textContent = 'nicht mehr verfügbar';
        fileCell.className = 'muted';
      } else {
        var link = document.createElement('a');
        link.href = APP_BASE + att.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = att.filename + (att.size ? ' (' + Math.max(1, Math.round(att.size / 1024)) + ' KB)' : '');
        fileCell.appendChild(link);
      }
      row.appendChild(fileCell);

      var actionCell = document.createElement('td');
      var resend = document.createElement('button');
      resend.type = 'button';
      resend.className = 'btn btn-sm';
      resend.textContent = 'Erneut senden';
      resend.addEventListener('click', function () {
        resend.disabled = true;
        resend.textContent = 'Sendet …';
        apiCall('/api/leads/resend', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ site: site, id: lead.id })
        }).then(function () {
          toast('Lead wurde erneut ans CRM gesendet');
        }).catch(function (error) {
          toast(error.message, true);
        }).finally(function () {
          resend.disabled = false;
          resend.textContent = 'Erneut senden';
        });
      });
      actionCell.appendChild(resend);
      row.appendChild(actionCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    scroll.appendChild(table);
    panel.appendChild(scroll);
    view.replaceChildren(panel);
  }

  // ---- views ----
  function switchView(view) {
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === view); });
    $('#view-campaigns').classList.toggle('hidden', view !== 'campaigns');
    $('#view-analytics').classList.toggle('hidden', view !== 'analytics');
    $('#view-leads').classList.toggle('hidden', view !== 'leads');
    if (view === 'analytics') renderAnalytics();
    if (view === 'leads') renderLeads();
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
    $('#btnInstallCheck').addEventListener('click', checkInstall);
    $('#siteSelect').addEventListener('change', function () {
      if (!confirmDiscard()) { this.value = state.site; return; } // revert on cancel
      $('#installCheckResult').textContent = '';
      state.site = this.value; renderList();
      updateSiteCooldownField();
      var first = visibleCampaigns()[0]; if (first) editCampaign(first.id); else newCampaign();
      if ($('#view-leads') && !$('#view-leads').classList.contains('hidden')) renderLeads();
    });
    $('#siteCooldownHours').addEventListener('change', saveSiteCooldown);
    $('#siteLeadMailTo').addEventListener('change', saveSiteLeadMailTo);
    $('#a-con-extra-add').addEventListener('click', function () {
      var fields = readExtraFields();
      if (fields.length >= 5) return;
      fields.push({ label: '', type: 'text' });
      renderExtraFields(fields);
      scheduleForm(); setDirty(true);
      var labels = $$('[data-extra-label]', $('#a-con-extra-fields'));
      if (labels.length) labels[labels.length - 1].focus();
    });
    $('#a-con-extra-fields').addEventListener('click', function (event) {
      var button = event.target.closest('[data-extra-remove]');
      if (!button) return;
      var fields = $$('[data-extra-field]', this).map(function (row) {
        return { label: $('[data-extra-label]', row).value.trim(), type: $('[data-extra-type]', row).value };
      });
      fields.splice(Number(button.getAttribute('data-extra-remove')), 1);
      renderExtraFields(fields);
      scheduleForm(); setDirty(true);
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
  initWhatsNew();
  loadData().then(function () {
    renderPresets(); buildSiteSelect();
    var first = state.campaigns[0];
    if (first) editCampaign(first.id); else newCampaign();
  }).catch(function (e) { toast('Laden fehlgeschlagen: ' + e.message, true); newCampaign(); });
})();
