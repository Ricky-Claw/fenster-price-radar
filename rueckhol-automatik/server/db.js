const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { cleanEmail } = require('./lib/sanitize');

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
  const retentionInput = Number(options.eventRetentionDays);
  const eventRetentionDays = Number.isFinite(retentionInput) && retentionInput >= 1 ? retentionInput : 400;
  const limitInput = Number(options.eventLimit);
  const eventLimit = Number.isFinite(limitInput) && limitInput >= 1 ? Math.round(limitInput) : 50000;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cooldown_hours INTEGER NOT NULL DEFAULT 0,
      lead_mail_to TEXT NOT NULL DEFAULT ''
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
      page_exclude TEXT NOT NULL DEFAULT '',
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
      page TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      site_id TEXT,
      mime TEXT,
      size INTEGER,
      sha256 TEXT,
      original_name TEXT,
      created_at TEXT,
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_site_created ON events(site_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_site_created ON submissions(site_id, created_at);
  `);

  const campaignColumns = db.prepare('PRAGMA table_info(campaigns)').all();
  if (!campaignColumns.some((column) => column.name === 'page_exclude')) {
    db.exec("ALTER TABLE campaigns ADD COLUMN page_exclude TEXT NOT NULL DEFAULT ''");
  }

  const siteColumns = db.prepare('PRAGMA table_info(sites)').all();
  if (!siteColumns.some((column) => column.name === 'cooldown_hours')) {
    db.exec('ALTER TABLE sites ADD COLUMN cooldown_hours INTEGER NOT NULL DEFAULT 0');
  }
  if (!siteColumns.some((column) => column.name === 'lead_mail_to')) {
    db.exec("ALTER TABLE sites ADD COLUMN lead_mail_to TEXT NOT NULL DEFAULT ''");
  }

  const submissionColumns = db.prepare('PRAGMA table_info(submissions)').all();
  if (!submissionColumns.some((column) => column.name === 'page')) {
    db.exec("ALTER TABLE submissions ADD COLUMN page TEXT NOT NULL DEFAULT ''");
  }

  const statements = {
    upsertSite: db.prepare(`
      INSERT INTO sites (id, name)
      VALUES (@id, @name)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name
    `),
    // Legt die Site nur an, wenn sie fehlt. Nötig für Pfade, die keinen echten
    // Anzeigenamen kennen (z. B. Seiten-Einstellungen): upsertSite würde dort
    // den gepflegten Namen mit der blanken Kennung überschreiben.
    insertSiteIfMissing: db.prepare(`
      INSERT INTO sites (id, name)
      VALUES (@id, @name)
      ON CONFLICT(id) DO NOTHING
    `),
    listSites: db.prepare('SELECT * FROM sites ORDER BY id ASC'),
    getSiteCooldownHours: db.prepare('SELECT cooldown_hours FROM sites WHERE id = @id LIMIT 1'),
    setSiteCooldownHours: db.prepare('UPDATE sites SET cooldown_hours = @hours WHERE id = @id'),
    getSiteLeadMailTo: db.prepare('SELECT lead_mail_to FROM sites WHERE id = @id LIMIT 1'),
    setSiteLeadMailTo: db.prepare('UPDATE sites SET lead_mail_to = @lead_mail_to WHERE id = @id'),
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
        page_pattern, page_exclude, headline, body, cta_label, theme, custom_css, created_at
      ) VALUES (
        @id, @site_id, @name, @enabled, @trigger, @trigger_config, @action_type, @action_config,
        @page_pattern, @page_exclude, @headline, @body, @cta_label, @theme, @custom_css, @created_at
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
          page_exclude = @page_exclude,
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
      DELETE FROM events WHERE created_at < @cutoff
    `),
    purgeEventsByLimit: db.prepare(`
      DELETE FROM events
      WHERE site_id = @site_id
        AND id NOT IN (SELECT id FROM events WHERE site_id = @site_id ORDER BY created_at DESC, id DESC LIMIT @limit)
    `),
    listEvents: db.prepare(`
      SELECT * FROM events
      WHERE (@site_id = '' OR site_id = @site_id)
      ORDER BY created_at DESC, id DESC
      LIMIT @limit
    `),
    insertSubmission: db.prepare(`
      INSERT INTO submissions (site_id, campaign_id, kind, payload, page, created_at)
      VALUES (@site_id, @campaign_id, @kind, @payload, @page, @created_at)
    `),
    listSubmissions: db.prepare(`
      SELECT * FROM submissions
      WHERE (@site_id = '' OR site_id = @site_id)
      ORDER BY created_at DESC, id DESC
    `),
    purgeSubmissions: db.prepare(`
      DELETE FROM submissions WHERE created_at < @cutoff
    `),
    purgeSubmissionsByLimit: db.prepare(`
      DELETE FROM submissions
      WHERE site_id = @site_id
        AND id NOT IN (SELECT id FROM submissions WHERE site_id = @site_id ORDER BY created_at DESC, id DESC LIMIT @limit)
    `),
    insertUpload: db.prepare(`
      INSERT INTO uploads (id, site_id, mime, size, sha256, original_name, created_at, expires_at)
      VALUES (@id, @site_id, @mime, @size, @sha256, @original_name, @created_at, @expires_at)
    `),
    getUpload: db.prepare('SELECT * FROM uploads WHERE id = @id LIMIT 1'),
    listExpiredUploads: db.prepare('SELECT id FROM uploads WHERE expires_at < @now'),
    purgeExpiredUploads: db.prepare('DELETE FROM uploads WHERE expires_at < @now'),
  };

  function ensureSite(siteId, name) {
    statements.upsertSite.run({ id: siteId, name: name || siteId });
  }

  function normalizeCooldownHours(hours) {
    const value = Number(hours);
    return Number.isInteger(value) && value >= 0 && value <= 168 ? value : 0;
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
      page_exclude: campaign.page_exclude || '',
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
    const cutoff = new Date(Date.now() - eventRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    statements.purgeEvents.run({ cutoff });
    statements.purgeEventsByLimit.run({ site_id: event.site_id, limit: eventLimit });
  }

  function insertSubmission(submission) {
    ensureSite(submission.site_id, submission.site_id);
    const info = statements.insertSubmission.run({
      site_id: submission.site_id,
      campaign_id: submission.campaign_id || '',
      kind: submission.kind,
      payload: JSON.stringify(submission.payload || {}),
      page: submission.page || '',
      created_at: submission.created_at,
    });
    const cutoff = new Date(Date.now() - eventRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    statements.purgeSubmissions.run({ cutoff });
    statements.purgeSubmissionsByLimit.run({ site_id: submission.site_id, limit: eventLimit });
    return info.lastInsertRowid;
  }

  function purgeExpiredUploads() {
    const now = new Date().toISOString();
    const expired = statements.listExpiredUploads.all({ now });
    for (const { id } of expired) options.deleteUpload?.(id);
    statements.purgeExpiredUploads.run({ now });
    return expired.map(({ id }) => id);
  }

  function insertUpload(upload) {
    purgeExpiredUploads();
    statements.insertUpload.run(upload);
    return statements.getUpload.get({ id: upload.id });
  }

  return {
    close() {
      db.close();
    },
    checkpoint() {
      db.pragma('wal_checkpoint(TRUNCATE)');
    },
    deleteCampaign(id) {
      return statements.deleteCampaign.run({ id }).changes > 0;
    },
    ensureSite,
    getSiteCooldownHours(siteId) {
      const row = statements.getSiteCooldownHours.get({ id: siteId });
      return row ? normalizeCooldownHours(row.cooldown_hours) : 0;
    },
    getSiteLeadMailTo(siteId) {
      const row = statements.getSiteLeadMailTo.get({ id: siteId });
      return row ? row.lead_mail_to : '';
    },
    getCampaign(id) {
      return hydrateCampaign(statements.getCampaign.get({ id }));
    },
    getUpload(id) {
      return statements.getUpload.get({ id });
    },
    insertEvent,
    insertSubmission,
    insertUpload,
    listCampaigns,
    listEvents(siteId = '') {
      return statements.listEvents.all({ site_id: siteId, limit: 20000 }).map(hydrateEvent);
    },
    listSites() {
      return statements.listSites.all();
    },
    listSubmissions(siteId = '') {
      return statements.listSubmissions.all({ site_id: siteId }).map(hydrateSubmission);
    },
    purgeExpiredUploads,
    saveCampaign,
    setSiteCooldownHours(siteId, hours) {
      const value = normalizeCooldownHours(hours);
      // Nicht ensureSite: das würde einen gepflegten Anzeigenamen mit der
      // blanken Kennung überschreiben, nur weil die Pause gespeichert wird.
      statements.insertSiteIfMissing.run({ id: siteId, name: siteId });
      statements.setSiteCooldownHours.run({ id: siteId, hours: value });
      return value;
    },
    setSiteLeadMailTo(siteId, value) {
      const raw = String(value ?? '').trim();
      const leadMailTo = raw ? cleanEmail(raw) : '';
      if (raw && !leadMailTo) throw new Error('Lead-Mail an muss eine gültige E-Mail-Adresse sein.');
      statements.insertSiteIfMissing.run({ id: siteId, name: siteId });
      statements.setSiteLeadMailTo.run({ id: siteId, lead_mail_to: leadMailTo });
      return leadMailTo;
    },
  };
}

module.exports = {
  createDatabase,
};
