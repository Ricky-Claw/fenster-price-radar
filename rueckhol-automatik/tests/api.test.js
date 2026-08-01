const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.RUECKHOL_DATA_KEY = crypto.randomBytes(32).toString('base64');

const { createApp, createRateLimiter, csvCell } = require('../server/index');

test('CSV cells guard leading tabs independently', () => {
  assert.equal(csvCell('\t=SUM(1,2)'), '"\'\t=SUM(1,2)"');
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
        payload: {
          email: '"buyer,one"@example.com',
          name: '=SUM(1+1)',
          message: 'Bitte, Angebot senden',
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
      },
      {
        campaignId: 'lead-campaign',
        type: 'contact',
        email: '"buyer,one"@example.com',
        name: '=SUM(1+1)',
        message: 'Bitte, Angebot senden',
      },
    );

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
    assert.match(csv, /^\uFEFFid;campaignId;type;email;name;message;createdAt\r\n/);
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
