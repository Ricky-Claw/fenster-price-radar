const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function hydrateCampaign(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    trigger_config: parseJson(row.trigger_config, {}),
    action_config: parseJson(row.action_config, {}),
    theme: parseJson(row.theme, {}),
  };
}

function hydrateEvent(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
  };
}

function hydrateSubmission(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parseJson(row.payload, {}),
  };
}

function createDatabase(options = {}) {
  const dbPath = options.dbPath || path.join(process.cwd(), 'data', 'conversion-rescue.sqlite');
  const eventLimit = Number.isFinite(Number(options.eventLimit)) ? Number(options.eventLimit) : 5000;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger TEXT NOT NULL,
      trigger_config TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_config TEXT NOT NULL,
      page_pattern TEXT NOT NULL,
      headline TEXT NOT NULL,
      body TEXT NOT NULL,
      cta_label TEXT NOT NULL,
      theme TEXT NOT NULL,
      custom_css TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      type TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const statements = {
    upsertSite: db.prepare(`
      INSERT INTO sites (id, name)
      VALUES (@id, @name)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name
    `),
    listSites: db.prepare('SELECT * FROM sites ORDER BY id ASC'),
    getCampaign: db.prepare('SELECT * FROM campaigns WHERE id = @id LIMIT 1'),
    listCampaigns: db.prepare(`
      SELECT * FROM campaigns
      WHERE (@site_id = '' OR site_id = @site_id)
      ORDER BY created_at DESC, id DESC
    `),
    listEnabledCampaigns: db.prepare(`
      SELECT * FROM campaigns
      WHERE site_id = @site_id AND enabled = 1
      ORDER BY created_at DESC, id DESC
    `),
    insertCampaign: db.prepare(`
      INSERT INTO campaigns (
        id, site_id, name, enabled, trigger, trigger_config, action_type, action_config,
        page_pattern, headline, body, cta_label, theme, custom_css, created_at
      ) VALUES (
        @id, @site_id, @name, @enabled, @trigger, @trigger_config, @action_type, @action_config,
        @page_pattern, @headline, @body, @cta_label, @theme, @custom_css, @created_at
      )
    `),
    updateCampaign: db.prepare(`
      UPDATE campaigns
      SET site_id = @site_id,
          name = @name,
          enabled = @enabled,
          trigger = @trigger,
          trigger_config = @trigger_config,
          action_type = @action_type,
          action_config = @action_config,
          page_pattern = @page_pattern,
          headline = @headline,
          body = @body,
          cta_label = @cta_label,
          theme = @theme,
          custom_css = @custom_css
      WHERE id = @id
    `),
    deleteCampaign: db.prepare('DELETE FROM campaigns WHERE id = @id'),
    insertEvent: db.prepare(`
      INSERT INTO events (site_id, campaign_id, type, metadata, created_at)
      VALUES (@site_id, @campaign_id, @type, @metadata, @created_at)
    `),
    purgeEvents: db.prepare(`
      DELETE FROM events
      WHERE id NOT IN (
        SELECT id FROM events ORDER BY id DESC LIMIT @limit
      )
    `),
    listEvents: db.prepare(`
      SELECT * FROM events
      WHERE (@site_id = '' OR site_id = @site_id)
      ORDER BY created_at DESC, id DESC
    `),
    insertSubmission: db.prepare(`
      INSERT INTO submissions (site_id, campaign_id, kind, payload, created_at)
      VALUES (@site_id, @campaign_id, @kind, @payload, @created_at)
    `),
    listSubmissions: db.prepare(`
      SELECT * FROM submissions
      WHERE (@site_id = '' OR site_id = @site_id)
      ORDER BY created_at DESC, id DESC
    `),
  };

  function ensureSite(siteId, name) {
    statements.upsertSite.run({ id: siteId, name: name || siteId });
  }

  function serializeCampaign(campaign) {
    return {
      id: campaign.id,
      site_id: campaign.site_id,
      name: campaign.name,
      enabled: campaign.enabled ? 1 : 0,
      trigger: campaign.trigger,
      trigger_config: JSON.stringify(campaign.trigger_config || {}),
      action_type: campaign.action_type,
      action_config: JSON.stringify(campaign.action_config || {}),
      page_pattern: campaign.page_pattern,
      headline: campaign.headline,
      body: campaign.body,
      cta_label: campaign.cta_label,
      theme: JSON.stringify(campaign.theme || {}),
      custom_css: campaign.custom_css,
      created_at: campaign.created_at,
    };
  }

  function saveCampaign(campaign) {
    ensureSite(campaign.site_id, campaign.site_name || campaign.site_id);
    const serialized = serializeCampaign(campaign);
    const existing = statements.getCampaign.get({ id: campaign.id });
    if (existing) {
      // node:sqlite throws on named params the statement doesn't use — the
      // UPDATE deliberately has no @created_at (creation time is immutable),
      // so it must be stripped here or every edit-save 500s.
      const { created_at, ...updatable } = serialized;
      statements.updateCampaign.run(updatable);
    } else {
      statements.insertCampaign.run(serialized);
    }
    return hydrateCampaign(statements.getCampaign.get({ id: campaign.id }));
  }

  function listCampaigns(siteId = '', enabledOnly = false) {
    const rows = enabledOnly
      ? statements.listEnabledCampaigns.all({ site_id: siteId })
      : statements.listCampaigns.all({ site_id: siteId });
    return rows.map(hydrateCampaign);
  }

  function insertEvent(event) {
    ensureSite(event.site_id, event.site_id);
    statements.insertEvent.run({
      site_id: event.site_id,
      campaign_id: event.campaign_id || '',
      type: event.type,
      metadata: JSON.stringify(event.metadata || {}),
      created_at: event.created_at,
    });
    statements.purgeEvents.run({ limit: eventLimit });
  }

  function insertSubmission(submission) {
    ensureSite(submission.site_id, submission.site_id);
    statements.insertSubmission.run({
      site_id: submission.site_id,
      campaign_id: submission.campaign_id || '',
      kind: submission.kind,
      payload: JSON.stringify(submission.payload || {}),
      created_at: submission.created_at,
    });
  }

  return {
    close() {
      db.close();
    },
    deleteCampaign(id) {
      return statements.deleteCampaign.run({ id }).changes > 0;
    },
    ensureSite,
    getCampaign(id) {
      return hydrateCampaign(statements.getCampaign.get({ id }));
    },
    insertEvent,
    insertSubmission,
    listCampaigns,
    listEvents(siteId = '') {
      return statements.listEvents.all({ site_id: siteId }).map(hydrateEvent);
    },
    listSites() {
      return statements.listSites.all();
    },
    listSubmissions(siteId = '') {
      return statements.listSubmissions.all({ site_id: siteId }).map(hydrateSubmission);
    },
    saveCampaign,
  };
}

module.exports = {
  createDatabase,
};
