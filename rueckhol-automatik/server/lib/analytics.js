const CONVERSION_EVENT_TYPES = new Set([
  'contact_submit',
  'coupon_reveal',
  'lead_submit',
  'newsletter_opt_in',
  'pdf_open',
  'url_open',
]);

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createBucket(extra = {}) {
  return {
    shown: 0,
    interacted: 0,
    converted: 0,
    conversionRate: 0,
    reasons: {},
    ...extra,
  };
}

function sortCounts(input, keyName) {
  return Object.entries(input)
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((left, right) => right.count - left.count || String(left[keyName]).localeCompare(String(right[keyName])));
}

function finalizeBuckets(collection) {
  for (const bucket of Object.values(collection)) {
    bucket.conversionRate = bucket.shown ? Math.round((bucket.converted / bucket.shown) * 10000) / 100 : 0;
  }
}

function buildWindowSummary(campaigns, events, siteId) {
  const relevantCampaigns = campaigns.filter((campaign) => !siteId || campaign.site_id === siteId);
  const campaignMap = new Map(
    relevantCampaigns.map((campaign) => [
      campaign.id,
      createBucket({
        campaignId: campaign.id,
        name: campaign.name,
        actionType: campaign.action_type,
        trigger: campaign.trigger,
      }),
    ]),
  );
  const byAction = {};
  const byTrigger = {};
  const byReason = {};
  const recentEvents = [];

  for (const campaign of relevantCampaigns) {
    if (!byAction[campaign.action_type]) {
      byAction[campaign.action_type] = createBucket({ actionType: campaign.action_type });
    }
    if (!byTrigger[campaign.trigger]) {
      byTrigger[campaign.trigger] = createBucket({ trigger: campaign.trigger });
    }
  }

  for (const event of events) {
    if (siteId && event.site_id !== siteId) continue;
    const campaign = campaignMap.get(event.campaign_id);
    const actionKey = campaign ? campaign.actionType : event.metadata?.actionType || 'unknown';
    const triggerKey = event.metadata?.trigger || (campaign ? campaign.trigger : 'unknown');
    if (!byAction[actionKey]) byAction[actionKey] = createBucket({ actionType: actionKey });
    if (!byTrigger[triggerKey]) byTrigger[triggerKey] = createBucket({ trigger: triggerKey });

    if (event.type === 'popup_shown') {
      if (campaign) campaign.shown += 1;
      byAction[actionKey].shown += 1;
      byTrigger[triggerKey].shown += 1;
    }
    if (event.type === 'cta_click') {
      if (campaign) campaign.interacted += 1;
      byAction[actionKey].interacted += 1;
      byTrigger[triggerKey].interacted += 1;
    }
    if (CONVERSION_EVENT_TYPES.has(event.type)) {
      if (campaign) campaign.converted += 1;
      byAction[actionKey].converted += 1;
      byTrigger[triggerKey].converted += 1;
    }
    if (event.metadata && event.metadata.reason) {
      const reason = event.metadata.reason;
      byReason[reason] = (byReason[reason] || 0) + 1;
      if (campaign) campaign.reasons[reason] = (campaign.reasons[reason] || 0) + 1;
    }

    recentEvents.push(event);
  }

  finalizeBuckets(Object.fromEntries(campaignMap));
  finalizeBuckets(byAction);
  finalizeBuckets(byTrigger);

  return {
    totalEvents: recentEvents.length,
    byCampaign: Object.fromEntries(campaignMap),
    byAction,
    byTrigger,
    byReason,
    topReasons: sortCounts(byReason, 'reason').slice(0, 10),
    recentEvents: recentEvents.slice().sort((left, right) => String(right.created_at).localeCompare(String(left.created_at))).slice(0, 25),
  };
}

function summarizeAnalytics(input = {}, options = {}) {
  const campaigns = Array.isArray(input.campaigns) ? input.campaigns : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const siteId = options.siteId || '';
  const now = options.now ? new Date(options.now) : new Date();
  const last7DaysStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

  const allTime = buildWindowSummary(campaigns, events, siteId);
  const last7Days = buildWindowSummary(
    campaigns,
    events.filter((event) => {
      const createdAt = toDate(event.created_at);
      return createdAt ? createdAt >= last7DaysStart : false;
    }),
    siteId,
  );

  return {
    allTime,
    last7Days,
  };
}

module.exports = {
  CONVERSION_EVENT_TYPES,
  summarizeAnalytics,
};
