const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, createRateLimiter, csvCell } = require('../server/index');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('CSV cells guard leading tabs independently', () => {
  assert.equal(csvCell('\t=SUM(1,2)'), '"\'\t=SUM(1,2)"');
});

test('leads list exposes the attached file so the dashboard can show it', async () => {
  // Ohne das steckt die hochgeladene Fensterliste zwar in der Datenbank,
  // ist im Leads-Bereich aber unsichtbar — man saehe den Lead und wuesste
  // nicht, dass eine Liste dabei ist.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckhol-lead-attachment-'));
  const appContext = createApp({
    dbPath: ':memory:',
    uploadsDir: path.join(tempDir, 'uploads'),
    adminToken: 'test-token',
    warnOnOpenAdmin: false,
  });
  const auth = { authorization: 'Bearer test-token' };
  try {
    const uploaded = await appContext.app.inject({
      method: 'POST',
      url: '/api/upload?site=demo&name=Fensterliste.pdf',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('%PDF-1.7\n'),
    });
    assert.equal(uploaded.status, 200);
    const uploadId = uploaded.json().uploadId;

    await appContext.app.inject({
      method: 'POST', url: '/api/submit',
      headers: { 'content-type': 'application/json' },
      body: { siteId: 'demo', kind: 'contact', payload: { email: 'a@b.de', consent: true, uploadId } },
    });

    const mitDatei = (await appContext.app.inject({ method: 'GET', url: '/api/submissions?site=demo', headers: auth })).json().submissions[0];
    assert.equal(mitDatei.attachment.filename, 'Fensterliste.pdf');
    assert.equal(mitDatei.attachment.abgelaufen, false);
    assert.match(mitDatei.attachment.url, new RegExp(`/api/uploads\\?id=${uploadId}`));

    // Lead ohne Datei traegt kein attachment-Feld.
    await appContext.app.inject({
      method: 'POST', url: '/api/submit',
      headers: { 'content-type': 'application/json' },
      body: { siteId: 'demo', kind: 'contact', payload: { email: 'c@d.de', consent: true } },
    });
    const ohneDatei = (await appContext.app.inject({ method: 'GET', url: '/api/submissions?site=demo', headers: auth })).json().submissions[0];
    assert.equal(ohneDatei.attachment, undefined);
  } finally {
    appContext.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('submit resolves only same-site upload metadata into forwarded attachments', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckhol-submit-upload-'));
  const bodies = [];
  const appContext = createApp({
    dbPath: ':memory:',
    uploadsDir: path.join(tempDir, 'uploads'),
    schwarzwaldBaseUrl: 'https://schwarzwald-agent.de',
    schwarzwaldArchipelToken: 'secret',
    publicBaseUrl: 'https://rueckhol.example',
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; },
    warnOnOpenAdmin: false,
  });
  try {
    const uploadFor = async (site) => appContext.app.inject({
      method: 'POST',
      url: `/api/upload?site=${site}&name=Fensterliste.pdf`,
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('%PDF-1.7\n'),
    });
    const ownUpload = await uploadFor('demo');
    const foreignUpload = await uploadFor('other');
    assert.equal(ownUpload.status, 200);
    assert.equal(foreignUpload.status, 200);

    const submit = (uploadId) => appContext.app.inject({
      method: 'POST',
      url: '/api/submit',
      headers: { 'content-type': 'application/json' },
      body: { siteId: 'demo', kind: 'contact', payload: { email: 'test@example.com', consent: true, uploadId } },
    });
    assert.equal((await submit(ownUpload.json().uploadId)).status, 200);
    assert.equal((await submit(foreignUpload.json().uploadId)).status, 200);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(bodies[0].attachments.length, 1);
    assert.equal(bodies[0].attachments[0].filename, 'Fensterliste.pdf');
    assert.equal(bodies[0].attachments[0].url, `https://rueckhol.example/api/uploads?id=${ownUpload.json().uploadId}`);
    assert.equal(bodies[1].attachments, undefined);
  } finally {
    appContext.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ignores an insecure configured public upload base URL', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckhol-insecure-base-'));
  const bodies = [];
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  const appContext = createApp({
    dbPath: ':memory:',
    uploadsDir: path.join(tempDir, 'uploads'),
    schwarzwaldBaseUrl: 'https://schwarzwald-agent.de',
    schwarzwaldArchipelToken: 'secret',
    publicBaseUrl: 'http://example.test',
    siteOrigins: { demo: ['https://shop.example'] },
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; },
    warnOnOpenAdmin: false,
  });
  console.warn = originalWarn;
  try {
    const uploaded = await appContext.app.inject({
      method: 'POST',
      url: '/api/upload?site=demo&name=Fensterliste.pdf',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('%PDF-1.7\n'),
    });
    const submitted = await appContext.app.inject({
      method: 'POST',
      url: '/api/submit',
      headers: { 'content-type': 'application/json', host: 'local.test' },
      body: { siteId: 'demo', kind: 'contact', payload: { email: 'test@example.com', consent: true, uploadId: uploaded.json().uploadId } },
    });
    assert.equal(submitted.status, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(bodies[0].attachments[0].url, `http://local.test/api/uploads?id=${uploaded.json().uploadId}`);
    assert.equal(warnings.filter((warning) => warning.includes('PUBLIC_BASE_URL')).length, 1);
  } finally {
    console.warn = originalWarn;
    appContext.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dashboard auth rate limit only affects failed credentials', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const responses = [];
    for (let i = 0; i < 21; i++) {
      responses.push(await appContext.app.inject({ method: 'GET', url: '/api/campaigns', headers: { authorization: 'Bearer wrong-token' } }));
    }
    assert.equal(responses.slice(0, 20).every((response) => response.status === 401), true);
    assert.equal(responses[20].status, 429);
    assert.equal((await appContext.app.inject({ method: 'GET', url: '/api/campaigns', headers: { authorization: 'Bearer test-token' } })).status, 200);
  } finally {
    appContext.close();
  }
});

test('site cooldown defaults to zero in public config', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const response = await appContext.app.inject({ method: 'GET', url: '/api/config?siteId=fresh-site' });
    assert.equal(response.status, 200);
    assert.equal(response.json().siteCooldownHours, 0);
  } finally {
    appContext.close();
  }
});

test('authenticated site settings update is reflected in public config', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const update = await appContext.app.inject({
      method: 'PUT', url: '/api/site-settings',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: { siteId: 'demo', cooldownHours: 12 },
    });
    assert.equal(update.status, 200);
    assert.deepEqual(update.json(), { ok: true, siteId: 'demo', cooldownHours: 12 });

    const config = await appContext.app.inject({ method: 'GET', url: '/api/config?siteId=demo' });
    assert.equal(config.json().siteCooldownHours, 12);
  } finally {
    appContext.close();
  }
});

test('invalid site cooldown values are rejected and keep the stored value', async () => {
  // 0 bedeutet "gar keine Pause". Ein Tippfehler (999, 2.5) darf deshalb NICHT
  // still auf 0 fallen und als Erfolg gemeldet werden — das hätte die genau
  // gegenteilige Wirkung von dem, was der Kunde eingestellt hat.
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  const auth = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const gesetzt = await appContext.app.inject({ method: 'PUT', url: '/api/site-settings', headers: auth, body: { siteId: 'demo', cooldownHours: 6 } });
    assert.equal(gesetzt.status, 200);

    for (const cooldownHours of [-1, 999, 'abc', 2.5, null]) {
      const update = await appContext.app.inject({ method: 'PUT', url: '/api/site-settings', headers: auth, body: { siteId: 'demo', cooldownHours } });
      assert.equal(update.status, 400, `Wert ${JSON.stringify(cooldownHours)} muss abgelehnt werden`);
      const config = await appContext.app.inject({ method: 'GET', url: '/api/config?siteId=demo' });
      assert.equal(config.json().siteCooldownHours, 6, 'der zuvor gespeicherte Wert bleibt erhalten');
    }

    // Die Grenzen selbst sind gültig.
    for (const gueltig of [0, 168]) {
      const ok = await appContext.app.inject({ method: 'PUT', url: '/api/site-settings', headers: auth, body: { siteId: 'demo', cooldownHours: gueltig } });
      assert.equal(ok.status, 200);
      assert.equal(ok.json().cooldownHours, gueltig);
    }
  } finally {
    appContext.close();
  }
});

test('saving the display pause keeps the site display name', async () => {
  // Regression: setSiteCooldownHours rief ensureSite(siteId, siteId) auf und
  // überschrieb damit den gepflegten Anzeigenamen mit der blanken Kennung.
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  const auth = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    await appContext.app.inject({
      method: 'POST', url: '/api/campaigns', headers: auth,
      body: { siteId: 'demo', siteName: 'Deutscher Fenstershop', name: 'Test', headline: 'Hallo' },
    });
    await appContext.app.inject({ method: 'PUT', url: '/api/site-settings', headers: auth, body: { siteId: 'demo', cooldownHours: 6 } });

    const sites = (await appContext.app.inject({ method: 'GET', url: '/api/campaigns', headers: auth })).json().sites;
    const demo = sites.find((s) => s.id === 'demo');
    assert.equal(demo.name, 'Deutscher Fenstershop');
    assert.equal(demo.cooldown_hours, 6);
  } finally {
    appContext.close();
  }
});

test('site settings require dashboard authentication', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const response = await appContext.app.inject({ method: 'PUT', url: '/api/site-settings', body: { siteId: 'demo', cooldownHours: 6 } });
    assert.equal(response.status, 401);
  } finally {
    appContext.close();
  }
});

test('campaign CRUD, config, events, and analytics work together', async () => {
  const appContext = createApp({
    dbPath: ':memory:',
    adminToken: 'test-token',
    webhookUrl: '',
    eventLimit: 50,
    warnOnOpenAdmin: false,
  });

  try {
    const createResponse = await appContext.app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      url: '/api/campaigns',
      body: {
        siteId: 'demo',
        name: 'Exit rescue',
        enabled: true,
        trigger: 'exit_intent',
        actionType: 'coupon',
        actionConfig: {
          code: 'SAVE10',
          label: 'Reveal code',
          reasonOptions: ['Too expensive'],
        },
        headline: 'Wait before you go',
        body: 'Take a code with you.',
        ctaLabel: 'Reveal code',
      },
    });
    assert.equal(createResponse.status, 200);
    const created = createResponse.json();
    assert.equal(created.campaign.site_id, 'demo');

    const configResponse = await appContext.app.inject({
      method: 'GET',
      url: '/api/config?siteId=demo',
      headers: { origin: 'http://localhost:8080' },
    });
    assert.equal(configResponse.status, 200);
    assert.equal(configResponse.headers['access-control-allow-origin'], '*');
    const config = configResponse.json();
    assert.equal(config.campaigns.length, 1);

    const eventResponse = await appContext.app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json' },
      body: {
        siteId: 'demo',
        campaignId: created.campaign.id,
        type: 'popup_shown',
        metadata: { trigger: 'exit_intent' },
      },
    });
    assert.equal(eventResponse.status, 200);

    const analyticsResponse = await appContext.app.inject({
      method: 'GET',
      url: '/api/analytics?siteId=demo',
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(analyticsResponse.status, 200);
    const analytics = analyticsResponse.json();
    assert.equal(analytics.allTime.byCampaign[created.campaign.id].shown, 1);
  } finally {
    appContext.close();
  }
});

test('submissions API requires auth and returns JSON and injection-safe CSV', async () => {
  const appContext = createApp({
    dbPath: ':memory:',
    adminToken: 'test-token',
    webhookUrl: '',
    warnOnOpenAdmin: false,
  });
  try {
    const submit = await appContext.app.inject({
      method: 'POST',
      url: '/api/submit',
      headers: { 'content-type': 'application/json' },
      body: {
        siteId: 'demo',
        campaignId: 'lead-campaign',
        kind: 'contact',
        page: 'https://shop.example/konfigurator?utm_source=google#schritt-2',
        payload: {
          email: '"buyer,one"@example.com',
          name: '=SUM(1+1)',
          message: 'Bitte, Angebot senden',
          extras: [{ label: 'Rufnummer', value: '+49 123 456' }],
          consent: true,
        },
      },
    });
    assert.equal(submit.status, 200);

    for (const [index, formula] of ['+SUM', '-2', '@cmd', '=HYPERLINK('].entries()) {
      const formulaSubmit = await appContext.app.inject({
        method: 'POST',
        url: '/api/submit',
        headers: { 'content-type': 'application/json' },
        body: {
          siteId: 'demo',
          campaignId: `formula-${index}`,
          kind: 'contact',
          payload: {
            email: `formula-${index}@example.com`,
            name: formula,
            message: 'Formeltest',
            consent: true,
          },
        },
      });
      assert.equal(formulaSubmit.status, 200);
    }

    const unauthenticated = await appContext.app.inject({
      method: 'GET',
      url: '/api/submissions?site=demo',
    });
    assert.equal(unauthenticated.status, 401);

    const jsonResponse = await appContext.app.inject({
      method: 'GET',
      url: '/api/submissions?site=demo',
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(jsonResponse.status, 200);
    const json = jsonResponse.json();
    assert.equal(json.ok, true);
    assert.equal(json.submissions.length, 5);
    const originalLead = json.submissions.find((submission) => submission.campaignId === 'lead-campaign');
    assert.ok(originalLead);
    assert.deepEqual(
      {
        campaignId: originalLead.campaignId,
        type: originalLead.type,
        email: originalLead.email,
        name: originalLead.name,
        message: originalLead.message,
        extras: originalLead.extras,
        page: originalLead.page,
      },
      {
        campaignId: 'lead-campaign',
        type: 'contact',
        email: '"buyer,one"@example.com',
        name: '=SUM(1+1)',
        message: 'Bitte, Angebot senden',
        extras: [{ label: 'Rufnummer', value: '+49 123 456' }],
        page: 'https://shop.example/konfigurator',
      },
    );
    assert.equal(json.submissions.find((submission) => submission.campaignId === 'formula-0').page, '');

    const csvResponse = await appContext.app.inject({
      method: 'GET',
      url: '/api/submissions?site=demo&format=csv',
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers['content-type'], /^text\/csv; charset=utf-8/);
    assert.match(csvResponse.headers['content-disposition'], /^attachment; filename="leads-demo-\d{4}-\d{2}-\d{2}\.csv"$/);
    const csv = csvResponse.body;
    assert.deepEqual([...Buffer.from(csv).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.match(csv, /^\uFEFFid;campaignId;campaign;type;email;name;message;page;createdAt\r\n/);
    assert.match(csv, /"""buyer,one""@example\.com"/);
    assert.match(csv, /;'=SUM\(1\+1\);/);
    assert.match(csv, /;'\+SUM;/);
    assert.match(csv, /;'-2;/);
    assert.match(csv, /;'@cmd;/);
    assert.match(csv, /;'=HYPERLINK\(/);
    assert.match(csv, /;"Bitte, Angebot senden";/);
  } finally {
    appContext.close();
  }
});

test('lead mail recipient is independently configurable, validated, listed, and may be cleared', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    assert.equal((await appContext.app.inject({
      method: 'PUT', url: '/api/site-settings', headers,
      body: { siteId: 'demo', cooldownHours: 168 },
    })).json().cooldownHours, 168);

    const saved = await appContext.app.inject({
      method: 'PUT', url: '/api/site-settings', headers,
      body: { siteId: 'demo', leadMailTo: 'Leads@Example.com' },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json().leadMailTo, 'leads@example.com');
    let site = (await appContext.app.inject({ method: 'GET', url: '/api/campaigns', headers })).json().sites.find((item) => item.id === 'demo');
    assert.equal(site.lead_mail_to, 'leads@example.com');
    assert.equal(site.cooldown_hours, 168, 'setting only leadMailTo keeps the pause unchanged');

    const invalid = await appContext.app.inject({
      method: 'PUT', url: '/api/site-settings', headers,
      body: { siteId: 'demo', leadMailTo: 'keine-adresse' },
    });
    assert.equal(invalid.status, 400);
    site = (await appContext.app.inject({ method: 'GET', url: '/api/campaigns', headers })).json().sites.find((item) => item.id === 'demo');
    assert.equal(site.lead_mail_to, 'leads@example.com');

    const cleared = await appContext.app.inject({
      method: 'PUT', url: '/api/site-settings', headers,
      body: { siteId: 'demo', leadMailTo: '' },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json().leadMailTo, '');
  } finally { appContext.close(); }
});

test('widget config includes sanitized newsletter download and privacy URLs', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    const createResponse = await appContext.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: {
        siteId: 'demo',
        name: 'Freebie',
        enabled: true,
        actionType: 'newsletter',
        actionConfig: {
          downloadUrl: 'https://example.com/freebie.pdf',
          privacyUrl: '/datenschutz',
        },
      },
    });
    assert.equal(createResponse.status, 200);

    const configResponse = await appContext.app.inject({
      method: 'GET',
      url: '/api/config?siteId=demo',
    });
    assert.equal(configResponse.status, 200);
    const actionConfig = configResponse.json().campaigns[0].action_config;
    assert.equal(actionConfig.downloadUrl, 'https://example.com/freebie.pdf');
    assert.equal(actionConfig.privacyUrl, '/datenschutz');
  } finally {
    appContext.close();
  }
});

test('health endpoint reports ok with version', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    const res = await appContext.app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.status, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.name, 'rueckhol-automatik');
    assert.equal(body.version, require('../package.json').version);
  } finally {
    appContext.close();
  }
});

test('preflight allows known origins even without siteId in the URL', async () => {
  // Regression: the widget sends siteId in the JSON body, so the browser
  // preflight hits the bare URL. The old handler looked at req.query.siteId,
  // fell back to 'default', and blocked every event/lead once SITE_ORIGINS was set.
  const appContext = createApp({
    dbPath: ':memory:',
    adminToken: 'test-token',
    webhookUrl: '',
    warnOnOpenAdmin: false,
    siteOrigins: { demo: ['https://kunde.example'] },
  });
  try {
    const preflight = await appContext.app.inject({
      method: 'OPTIONS',
      url: '/api/events',
      headers: { origin: 'https://kunde.example', 'access-control-request-method': 'POST' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'https://kunde.example');
    assert.equal(preflight.headers['access-control-allow-credentials'], 'true');

    const event = await appContext.app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { origin: 'https://kunde.example', 'content-type': 'application/json' },
      body: { siteId: 'demo', campaignId: 'demo-popup', type: 'popup_shown' },
    });
    assert.equal(event.status, 200);
    assert.equal(event.headers['access-control-allow-credentials'], 'true');

    const foreign = await appContext.app.inject({
      method: 'OPTIONS',
      url: '/api/events',
      headers: { origin: 'https://boese.example', 'access-control-request-method': 'POST' },
    });
    assert.equal(foreign.headers['access-control-allow-origin'], undefined);
  } finally {
    appContext.close();
  }
});

test('password login flow: reject wrong, accept right, cookie grants API access', async () => {
  process.env.FENSTER_RADAR_PASSWORD = 'geheim123';
  const appContext = createApp({ dbPath: ':memory:', adminToken: '', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    const wrong = await appContext.app.inject({
      method: 'POST', url: '/api/login',
      headers: { 'content-type': 'application/json' }, body: { password: 'falsch' },
    });
    assert.equal(wrong.status, 401);

    const noCookie = await appContext.app.inject({ method: 'GET', url: '/api/campaigns' });
    assert.equal(noCookie.status, 401);

    const right = await appContext.app.inject({
      method: 'POST', url: '/api/login',
      headers: { 'content-type': 'application/json' }, body: { password: 'geheim123' },
    });
    assert.equal(right.status, 200);
    const setCookie = right.headers['set-cookie'];
    assert.ok(setCookie && setCookie.includes('rueckhol_session='));
    const cookie = setCookie.split(';')[0];

    const withCookie = await appContext.app.inject({ method: 'GET', url: '/api/campaigns', headers: { cookie } });
    assert.equal(withCookie.status, 200);

    const otherSiteSubmissions = await appContext.app.inject({
      method: 'GET', url: '/api/submissions?site=andere-site', headers: { cookie },
    });
    assert.equal(otherSiteSubmissions.status, 200);
    assert.deepEqual(otherSiteSubmissions.json().submissions, []);
  } finally {
    delete process.env.FENSTER_RADAR_PASSWORD;
    appContext.close();
  }
});

test('shared proxy key cannot lock out a valid login and success resets its failure counter', async () => {
  process.env.FENSTER_RADAR_PASSWORD = 'geheim123';
  const appContext = createApp({ dbPath: ':memory:', adminToken: '', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    const wrongBody = { password: 'falsch' };
    const headersFor = (client) => ({ 'content-type': 'application/json', 'x-forwarded-for': `visitor.invalid, ${client}` });

    for (let i = 0; i < 10; i += 1) {
      const response = await appContext.app.inject({
        method: 'POST', url: '/api/login',
        headers: headersFor('shared-proxy.invalid'), body: wrongBody,
      });
      assert.equal(response.status, 401);
    }
    const blockedFailure = await appContext.app.inject({
      method: 'POST', url: '/api/login',
      headers: headersFor('shared-proxy.invalid'), body: wrongBody,
    });
    assert.equal(blockedFailure.status, 429);
    assert.equal(blockedFailure.headers['retry-after'], '900');

    const validThroughSharedProxy = await appContext.app.inject({
      method: 'POST', url: '/api/login',
      headers: headersFor('shared-proxy.invalid'), body: { password: 'geheim123' },
    });
    assert.equal(validThroughSharedProxy.status, 200);

    const wrongAfterReset = await appContext.app.inject({
      method: 'POST', url: '/api/login',
      headers: headersFor('shared-proxy.invalid'), body: wrongBody,
    });
    assert.equal(wrongAfterReset.status, 401);
  } finally {
    delete process.env.FENSTER_RADAR_PASSWORD;
    appContext.close();
  }
});

test('login rate limit uses the last X-Forwarded-For hop despite spoofed prefixes', async () => {
  process.env.FENSTER_RADAR_PASSWORD = 'geheim123';
  const appContext = createApp({ dbPath: ':memory:', adminToken: '', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    for (let i = 0; i < 10; i += 1) {
      const response = await appContext.app.inject({
        method: 'POST',
        url: '/api/login',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `${i % 2 ? 'proxy-b.invalid' : 'proxy-a.invalid'}, client-1.invalid`,
          'x-real-ip': `spoof-${i}.invalid`,
          'x-vercel-forwarded-for': `vercel-spoof-${i}.invalid`,
        },
        body: { password: 'falsch' },
      });
      assert.equal(response.status, 401);
    }

    const blockedFailure = await appContext.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': 'another-spoof.invalid, client-1.invalid',
      },
      body: { password: 'falsch' },
    });
    assert.equal(blockedFailure.status, 429);

    const validLogin = await appContext.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': 'another-spoof.invalid, client-1.invalid',
      },
      body: { password: 'geheim123' },
    });
    assert.equal(validLogin.status, 200);
  } finally {
    delete process.env.FENSTER_RADAR_PASSWORD;
    appContext.close();
  }
});

test('fallback proxy headers require explicit trust', async () => {
  process.env.FENSTER_RADAR_PASSWORD = 'geheim123';
  const originalTrust = process.env.TRUST_PROXY_HEADERS;
  delete process.env.TRUST_PROXY_HEADERS;
  const untrustedContext = createApp({ dbPath: ':memory:', adminToken: '', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    for (let i = 0; i < 10; i += 1) {
      const response = await untrustedContext.app.inject({
        method: 'POST',
        url: '/api/login',
        headers: {
          'content-type': 'application/json',
          'x-real-ip': `real-${i}.invalid`,
          'x-vercel-forwarded-for': `vercel-${i}.invalid`,
        },
        body: { password: 'falsch' },
      });
      assert.equal(response.status, 401);
    }
    const sharedSocketBlocked = await untrustedContext.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': 'real-new.invalid',
        'x-vercel-forwarded-for': 'vercel-new.invalid',
      },
      body: { password: 'falsch' },
    });
    assert.equal(sharedSocketBlocked.status, 429);
  } finally {
    untrustedContext.close();
  }

  process.env.TRUST_PROXY_HEADERS = '1';
  const trustedContext = createApp({ dbPath: ':memory:', adminToken: '', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    for (let i = 0; i < 11; i += 1) {
      const realIpResponse = await trustedContext.app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { 'content-type': 'application/json', 'x-real-ip': `trusted-real-${i}.invalid` },
        body: { password: 'falsch' },
      });
      assert.equal(realIpResponse.status, 401);

      const vercelResponse = await trustedContext.app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': `trusted-vercel-${i}.invalid` },
        body: { password: 'falsch' },
      });
      assert.equal(vercelResponse.status, 401);
    }
  } finally {
    if (originalTrust === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = originalTrust;
    delete process.env.FENSTER_RADAR_PASSWORD;
    trustedContext.close();
  }
});

test('rate limiter store remains below its hard key cap', () => {
  const limiter = createRateLimiter(80, 60_000, 25);
  for (let i = 0; i < 500; i += 1) limiter(`client-${i}.invalid`);
  assert.equal(limiter.size(), 25);
});

test('valid password succeeds from a fresh client after global failed-login budget is exhausted', async () => {
  process.env.FENSTER_RADAR_PASSWORD = 'geheim123';
  const appContext = createApp({ dbPath: ':memory:', adminToken: '', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    for (let i = 0; i < 101; i += 1) {
      const response = await appContext.app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `attacker-${i}.invalid` },
        body: { password: 'falsch' },
      });
      assert.equal(response.status, i < 100 ? 401 : 429);
    }

    const validLogin = await appContext.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': 'fresh-client.invalid' },
      body: { password: 'geheim123' },
    });
    assert.equal(validLogin.status, 200);
  } finally {
    delete process.env.FENSTER_RADAR_PASSWORD;
    appContext.close();
  }
});

test('same campaign name on two sites must not overwrite each other', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  const auth = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
  try {
    const first = await appContext.app.inject({
      method: 'POST', url: '/api/campaigns', headers: auth,
      body: { siteId: 'site-a', name: 'Sommer Aktion', enabled: true, trigger: 'exit_intent', actionType: 'coupon', actionConfig: { code: 'A' }, ctaLabel: 'Los' },
    });
    const second = await appContext.app.inject({
      method: 'POST', url: '/api/campaigns', headers: auth,
      body: { siteId: 'site-b', name: 'Sommer Aktion', enabled: true, trigger: 'exit_intent', actionType: 'coupon', actionConfig: { code: 'B' }, ctaLabel: 'Los' },
    });
    const a = first.json().campaign;
    const b = second.json().campaign;
    assert.notEqual(a.id, b.id);
    assert.equal(a.site_id, 'site-a');
    assert.equal(b.site_id, 'site-b');

    const siteA = await appContext.app.inject({ method: 'GET', url: '/api/config?siteId=site-a' });
    assert.equal(siteA.json().campaigns[0].action_config.code, 'A');
  } finally {
    appContext.close();
  }
});

test('explicit campaign id cannot overwrite another site via POST', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  const auth = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
  try {
    const original = (await appContext.app.inject({
      method: 'POST', url: '/api/campaigns', headers: auth,
      body: { id: 'fixed-id', siteId: 'site-a', name: 'Original', enabled: true, trigger: 'exit_intent', actionType: 'coupon', actionConfig: { code: 'A' } },
    })).json().campaign;
    const rejected = await appContext.app.inject({
      method: 'POST', url: '/api/campaigns', headers: auth,
      body: { id: 'fixed-id', siteId: 'site-b', name: 'Hijacked', enabled: false, trigger: 'scroll', actionType: 'url', actionConfig: { url: 'https://evil.example' } },
    });
    assert.equal(rejected.status, 409);
    const unchanged = (await appContext.app.inject({ method: 'GET', url: '/api/campaigns', headers: auth })).json().campaigns.find(c => c.id === original.id);
    assert.equal(unchanged.site_id, 'site-a');
    assert.equal(unchanged.name, 'Original');
    const sameSite = await appContext.app.inject({
      method: 'POST', url: '/api/campaigns', headers: auth,
      body: { id: 'fixed-id', siteId: 'site-a', name: 'Updated', enabled: true, trigger: 'exit_intent', actionType: 'coupon', actionConfig: { code: 'B' } },
    });
    assert.equal(sameSite.status, 200);
    assert.equal(sameSite.json().campaign.name, 'Updated');
  } finally { appContext.close(); }
});

test('editing an existing campaign via PUT must not 500 (created_at param regression)', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  const auth = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
  try {
    const created = (await appContext.app.inject({
      method: 'POST', url: '/api/campaigns', headers: auth,
      body: { siteId: 'demo', name: 'Edit Me', enabled: true, trigger: 'exit_intent', actionType: 'coupon', actionConfig: { code: 'ALT' }, ctaLabel: 'Los' },
    })).json().campaign;

    const put = await appContext.app.inject({
      method: 'PUT', url: '/api/campaigns', headers: auth,
      body: { id: created.id, siteId: 'demo', name: 'Edit Me Neu', enabled: true, trigger: 'exit_intent', actionType: 'coupon', actionConfig: { code: 'NEU' }, ctaLabel: 'Neu' },
    });
    assert.equal(put.status, 200);
    const updated = put.json().campaign;
    assert.equal(updated.name, 'Edit Me Neu');
    assert.equal(updated.action_config.code, 'NEU');
    assert.equal(updated.created_at, created.created_at); // creation time immutable
  } finally {
    appContext.close();
  }
});

test('submit endpoint is rate limited like events', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    let limited = false;
    for (let i = 0; i < 90; i += 1) {
      const res = await appContext.app.inject({
        method: 'POST', url: '/api/submit', headers: { 'content-type': 'application/json' },
        body: { siteId: 'demo', kind: 'newsletter', payload: { email: `x${i}@test.de`, consent: true } },
      });
      if (res.status === 429) { limited = true; break; }
    }
    assert.ok(limited, 'expected a 429 before 90 unthrottled submissions');
  } finally {
    appContext.close();
  }
});

test('events endpoint rejects a body over the JSON limit with 413', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    const body = {
      siteId: 'demo',
      type: 'popup_shown',
      metadata: { padding: 'x'.repeat(262144) },
    };
    const response = await appContext.app.inject({
      method: 'POST',
      url: '/api/events',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(JSON.stringify(body))),
      },
      body,
    });

    assert.equal(response.status, 413);
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(response.body, '{"error":"payload_too_large"}');
  } finally {
    appContext.close();
  }
});

test('events endpoint rejects an oversized streamed body without content-length', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    const response = await appContext.app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
      body: {
        siteId: 'demo',
        type: 'popup_shown',
        metadata: { padding: 'x'.repeat(262144) },
      },
    });

    assert.equal(response.status, 413);
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(response.body, '{"error":"payload_too_large"}');
  } finally {
    appContext.close();
  }
});

test('events endpoint still accepts a normal small JSON body', async () => {
  const appContext = createApp({ dbPath: ':memory:', adminToken: 'test-token', webhookUrl: '', warnOnOpenAdmin: false });
  try {
    const response = await appContext.app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json' },
      body: { siteId: 'demo', type: 'popup_shown', metadata: { source: 'limit-regression' } },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json(), { ok: true });
  } finally {
    appContext.close();
  }
});
