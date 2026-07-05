const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const { createDatabase } = require('./db');
const { summarizeAnalytics } = require('./lib/analytics');
const {
  cleanId,
  cleanText,
  nowIso,
  sanitizeCampaignInput,
  sanitizeEventInput,
  sanitizeSubmission,
} = require('./lib/sanitize');
const { getThemePresets } = require('./lib/theme');
const { checkPassword, sessionCookie, createGuards, isConfigured } = require('./lib/auth');

function parseSiteOrigins(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result = {};
    for (const [siteId, origins] of Object.entries(parsed)) {
      if (Array.isArray(origins)) result[siteId] = origins.map((origin) => String(origin).trim()).filter(Boolean);
    }
    return result;
  } catch (_) {
    return null;
  }
}

function createRateLimiter(limit = 80, windowMs = 60_000) {
  const hits = new Map();

  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

function sendFile(res, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  res.status(200).type(contentType).send(body);
}

function createApp(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const db = createDatabase({
    dbPath: options.dbPath || path.join(rootDir, 'data', 'conversion-rescue.sqlite'),
    eventLimit: options.eventLimit || 5000,
  });
  const app = express();
  const adminToken = options.adminToken === undefined ? process.env.ADMIN_TOKEN || '' : options.adminToken;
  const { requireDashboardAuth, requireDashboardPage } = createGuards(adminToken);
  const webhookUrl = options.webhookUrl === undefined ? process.env.WEBHOOK_URL || '' : options.webhookUrl;
  const siteOrigins = options.siteOrigins || parseSiteOrigins(process.env.SITE_ORIGINS);
  const allowOpenCors = !siteOrigins;
  const checkRateLimit = createRateLimiter(80, 60_000);

  if (!adminToken && !isConfigured() && options.warnOnOpenAdmin !== false) {
    console.warn('[Conversion Rescue] Neither ADMIN_TOKEN nor FENSTER_RADAR_PASSWORD is set. Dashboard/API routes are open for local development.');
  }
  if (allowOpenCors) {
    // In local development the widget is easiest to test if config/events are open to any origin.
    console.warn('[Conversion Rescue] SITE_ORIGINS is not set. Public API CORS falls back to allow-all.');
  }

  function applyCors(req, res, siteId) {
    const origin = req.get('origin') || '';
    if (allowOpenCors) {
      res.set('access-control-allow-origin', '*');
    } else if (siteOrigins[siteId] && siteOrigins[siteId].includes(origin)) {
      res.set('access-control-allow-origin', origin);
      res.set('vary', 'origin');
    }
    res.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.set('access-control-allow-headers', 'content-type,authorization');
  }

  function publicCampaign(campaign) {
    return {
      id: campaign.id,
      site_id: campaign.site_id,
      name: campaign.name,
      enabled: Boolean(campaign.enabled),
      trigger: campaign.trigger,
      trigger_config: campaign.trigger_config,
      action_type: campaign.action_type,
      action_config: campaign.action_config,
      page_pattern: campaign.page_pattern,
      headline: campaign.headline,
      body: campaign.body,
      cta_label: campaign.cta_label,
      theme: campaign.theme,
      custom_css: campaign.custom_css,
      created_at: campaign.created_at,
    };
  }

  function postWebhook(payload) {
    if (!webhookUrl) return;
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  app.use(express.json());

  app.get('/', (req, res) => {
    res.type('text/html; charset=utf-8').send(`
      <!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><title>Conversion Rescue</title></head>
        <body style="font-family: system-ui, sans-serif; padding: 40px">
          <h1>Conversion Rescue</h1>
          <p><a href="dashboard/">Open dashboard</a></p>
          <p><a href="demo/">Open demo page</a></p>
        </body>
      </html>
    `);
  });

  app.get('/login', (req, res) => {
    res.type('text/html; charset=utf-8').send(`
      <!doctype html>
      <html lang="de">
        <head><meta charset="utf-8"><title>Anmelden</title>
        <style>body{font-family:system-ui,sans-serif;background:#f4f2ec;display:grid;place-items:center;height:100vh;margin:0}
        form{background:#fff;border:1px solid #e6e3da;border-radius:14px;padding:28px;width:min(320px,90vw);box-shadow:0 10px 30px rgba(20,40,30,.08)}
        h1{font-size:17px;margin:0 0 16px}input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d8d4c8;border-radius:10px;font-size:14px}
        button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:10px;background:#14532d;color:#f6fbf4;font-weight:700;cursor:pointer}
        p{color:#b3261e;font-size:13px;margin:10px 0 0}</style></head>
        <body><form id="f"><h1>Rückhol-Automatik</h1>
          <input type="password" id="pw" placeholder="Passwort" autofocus>
          <button type="submit">Anmelden</button>
          <p id="err" style="display:none"></p>
        </form>
        <script>
          document.getElementById('f').addEventListener('submit', function (e) {
            e.preventDefault();
            fetch('api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value }) })
              .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
              .then(function (res) {
                if (res.ok) { window.location = 'dashboard/'; return; }
                var err = document.getElementById('err');
                err.textContent = res.d.error === 'login_not_configured' ? 'Login ist noch nicht eingerichtet.' : 'Falsches Passwort.';
                err.style.display = 'block';
              });
          });
        </script></body>
      </html>
    `);
  });

  app.post('/api/login', (req, res) => {
    if (!isConfigured()) { res.status(503).json({ error: 'login_not_configured' }); return; }
    if (!checkPassword(req.body && req.body.password)) { res.status(401).json({ error: 'invalid_password' }); return; }
    res.set('set-cookie', sessionCookie());
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    res.set('set-cookie', 'rueckhol_session=; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.options('/api/config', (req, res) => {
    applyCors(req, res, cleanId(req.query.siteId || 'default', 'default'));
    res.status(204).send('');
  });
  app.options('/api/events', (req, res) => {
    applyCors(req, res, cleanId(req.query.siteId || 'default', 'default'));
    res.status(204).send('');
  });
  app.options('/api/submit', (req, res) => {
    applyCors(req, res, cleanId(req.query.siteId || 'default', 'default'));
    res.status(204).send('');
  });

  app.get('/api/config', (req, res) => {
    const siteId = cleanId(req.query.siteId || 'default', 'default');
    applyCors(req, res, siteId);
    const campaigns = db.listCampaigns(siteId, true).map(publicCampaign);
    res.json({ siteId, campaigns });
  });

  app.post('/api/events', (req, res) => {
    const siteId = cleanId(req.body.siteId || req.body.site_id || 'default', 'default');
    applyCors(req, res, siteId);
    const ip = req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Too many events' });
      return;
    }

    const event = sanitizeEventInput(req.body);
    if (!event.type) {
      res.status(400).json({ error: 'Event type is required' });
      return;
    }
    db.insertEvent(event);
    res.json({ ok: true });
  });

  app.post('/api/submit', (req, res) => {
    const siteId = cleanId(req.body.siteId || req.body.site_id || 'default', 'default');
    applyCors(req, res, siteId);
    let submission;
    try {
      submission = sanitizeSubmission(req.body.kind, req.body.payload);
    } catch (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const createdAt = nowIso();
    db.insertSubmission({
      site_id: siteId,
      campaign_id: cleanId(req.body.campaignId || req.body.campaign_id || '', ''),
      kind: submission.kind,
      payload: submission.payload,
      created_at: createdAt,
    });

    const eventType = submission.kind === 'newsletter'
      ? 'newsletter_opt_in'
      : submission.kind === 'contact'
        ? 'contact_submit'
        : 'lead_submit';
    db.insertEvent({
      site_id: siteId,
      campaign_id: cleanId(req.body.campaignId || req.body.campaign_id || '', ''),
      type: eventType,
      metadata: {
        kind: submission.kind,
      },
      created_at: createdAt,
    });

    postWebhook({
      siteId,
      campaignId: cleanId(req.body.campaignId || req.body.campaign_id || '', ''),
      kind: submission.kind,
      payload: submission.payload,
      createdAt,
    });

    res.json({ ok: true });
  });

  app.get('/api/analytics', requireDashboardAuth, (req, res) => {
    const siteId = cleanId(req.query.siteId || 'default', 'default');
    const campaigns = db.listCampaigns(siteId, false);
    const events = db.listEvents(siteId);
    const submissions = db.listSubmissions(siteId);
    const summary = summarizeAnalytics({ campaigns, events, submissions }, { siteId });
    res.json({ siteId, ...summary });
  });

  app.get('/api/campaigns', requireDashboardAuth, (req, res) => {
    const siteId = cleanText(req.query.siteId || '', 140);
    res.json({
      campaigns: db.listCampaigns(siteId, false),
      sites: db.listSites(),
      themePresets: getThemePresets(),
    });
  });

  app.post('/api/campaigns', requireDashboardAuth, (req, res) => {
    const campaign = sanitizeCampaignInput(req.body);
    const saved = db.saveCampaign(campaign);
    res.json({ campaign: saved });
  });

  app.put('/api/campaigns', requireDashboardAuth, (req, res) => {
    const id = cleanText(req.body.id, 140);
    if (!id) {
      res.status(400).json({ error: 'Campaign id is required' });
      return;
    }
    const existing = db.getCampaign(id);
    if (!existing) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    const saved = db.saveCampaign(sanitizeCampaignInput(req.body, existing));
    res.json({ campaign: saved });
  });

  app.delete('/api/campaigns', requireDashboardAuth, (req, res) => {
    const id = cleanText(req.query.id || req.body.id || '', 140);
    if (!id) {
      res.status(400).json({ error: 'Campaign id is required' });
      return;
    }
    if (!db.deleteCampaign(id)) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/cre.js', (req, res) => {
    sendFile(res, path.join(rootDir, 'widget', 'cre.js'), 'text/javascript; charset=utf-8');
  });

  // Chained manually: this vendor express shim's app.use() only accepts one
  // handler per prefix (unlike app.get/post, which support several via rest args).
  const dashboardStatic = express.static(path.join(rootDir, 'dashboard'));
  app.use('/dashboard', (req, res, next) => requireDashboardPage(req, res, () => dashboardStatic(req, res, next)));
  app.use('/demo', express.static(path.join(rootDir, 'demo')));

  return {
    app,
    close() {
      db.close();
    },
  };
}

function startServer() {
  const port = Number(process.env.PORT || 8080);
  const { app } = createApp();
  app.listen(port, () => {
    console.log(`[Conversion Rescue] Listening on http://localhost:${port}`);
  });
}

if (require.main === module) startServer();

module.exports = {
  createApp,
};
