const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizeAnalytics } = require('../server/lib/analytics');

test('summarizeAnalytics builds funnel, action, trigger, and reason stats', () => {
  const now = new Date('2026-06-30T12:00:00.000Z');
  const campaigns = [
    {
      id: 'camp-a',
      name: 'Newsletter saver',
      site_id: 'demo',
      trigger: 'idle',
      action_type: 'newsletter',
      created_at: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'camp-b',
      name: 'Coupon saver',
      site_id: 'demo',
      trigger: 'exit_intent',
      action_type: 'coupon',
      created_at: '2026-06-02T00:00:00.000Z',
    },
  ];

  const events = [
    { site_id: 'demo', campaign_id: 'camp-a', type: 'popup_shown', metadata: { trigger: 'idle' }, created_at: '2026-06-29T00:00:00.000Z' },
    { site_id: 'demo', campaign_id: 'camp-a', type: 'cta_click', metadata: { trigger: 'idle' }, created_at: '2026-06-29T00:01:00.000Z' },
    { site_id: 'demo', campaign_id: 'camp-a', type: 'newsletter_opt_in', metadata: { trigger: 'idle' }, created_at: '2026-06-29T00:02:00.000Z' },
    { site_id: 'demo', campaign_id: 'camp-a', type: 'abandon_reason', metadata: { reason: 'Too expensive', trigger: 'idle' }, created_at: '2026-06-29T00:03:00.000Z' },
    { site_id: 'demo', campaign_id: 'camp-b', type: 'popup_shown', metadata: { trigger: 'exit_intent' }, created_at: '2026-06-20T00:00:00.000Z' },
    { site_id: 'demo', campaign_id: 'camp-b', type: 'cta_click', metadata: { trigger: 'exit_intent' }, created_at: '2026-06-20T00:01:00.000Z' },
    { site_id: 'demo', campaign_id: 'camp-b', type: 'coupon_reveal', metadata: { trigger: 'exit_intent' }, created_at: '2026-06-20T00:02:00.000Z' },
  ];

  const summary = summarizeAnalytics({ campaigns, events }, { siteId: 'demo', now });

  assert.equal(summary.allTime.totalEvents, 7);
  assert.equal(summary.allTime.byCampaign['camp-a'].shown, 1);
  assert.equal(summary.allTime.byCampaign['camp-a'].interacted, 1);
  assert.equal(summary.allTime.byCampaign['camp-a'].converted, 1);
  assert.equal(summary.allTime.byCampaign['camp-a'].conversionRate, 100);
  assert.equal(summary.allTime.byAction.newsletter.converted, 1);
  assert.equal(summary.allTime.byAction.coupon.converted, 1);
  assert.equal(summary.allTime.byTrigger.idle.shown, 1);
  assert.equal(summary.allTime.byTrigger.exit_intent.converted, 1);
  assert.equal(summary.allTime.topReasons[0].reason, 'Too expensive');
  assert.equal(summary.last7Days.totalEvents, 4);
  assert.equal(summary.last7Days.byAction.coupon.converted, 0);
});
