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
