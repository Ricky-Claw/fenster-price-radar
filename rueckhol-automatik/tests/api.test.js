const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/index');

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
