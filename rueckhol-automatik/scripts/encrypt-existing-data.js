#!/usr/bin/env node

const path = require('node:path');
const Database = require('better-sqlite3');
const { createDataEncryption } = require('../server/lib/data-encryption');

const dbPath = path.resolve(process.argv[2] || path.join(process.cwd(), 'data', 'conversion-rescue.sqlite'));
let dataEncryption;
let db;

function migrateTable(table, column, context) {
  const select = db.prepare(`SELECT id, site_id, ${column} AS value FROM ${table}`);
  const update = db.prepare(`UPDATE ${table} SET ${column} = @value WHERE id = @id`);
  let migrated = 0;

  for (const row of select.all()) {
    if (row.value === null || row.value === '') continue;
    if (dataEncryption.isEncrypted(row.value)) continue;
    let parsed;
    try {
      parsed = JSON.parse(row.value);
    } catch (error) {
      throw new Error(
        `Cannot migrate ${table}.${column} row ${row.id} after ${migrated} migrated row(s): invalid JSON.`,
        { cause: error },
      );
    }
    update.run({
      id: row.id,
      value: dataEncryption.encryptJson(parsed, context, row.site_id),
    });
    migrated += 1;
  }
  return migrated;
}

try {
  dataEncryption = createDataEncryption();
  db = new Database(dbPath);
  const migrate = db.transaction(() => ({
    events: migrateTable('events', 'metadata', 'events.metadata'),
    submissions: migrateTable('submissions', 'payload', 'submissions.payload'),
  }));
  const result = migrate();
  console.log(`Encrypted ${result.submissions} submission payload(s) and ${result.events} event metadata row(s) in ${dbPath}.`);
} catch (error) {
  console.error(`Rueckhol encryption migration failed: ${error?.message || 'unknown error'}`);
  process.exitCode = 1;
} finally {
  db?.close();
}
