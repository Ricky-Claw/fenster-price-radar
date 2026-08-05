const fs = require('node:fs/promises');
const path = require('node:path');

async function backupDatabase({ dbPath, backupDir, keep = 30 }) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `conversion-rescue-${date}.sqlite`;
  try {
    await fs.mkdir(backupDir, { recursive: true });
    await fs.copyFile(dbPath, path.join(backupDir, filename));
    const names = (await fs.readdir(backupDir))
      .filter((name) => /^conversion-rescue-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
      .sort();
    const excess = Math.max(0, names.length - Math.max(0, Number(keep) || 0));
    for (const name of names.slice(0, excess)) {
      try { await fs.unlink(path.join(backupDir, name)); } catch (error) { console.warn('[Conversion Rescue] Backup rotation failed:', error.message); }
    }
    return { ok: true, path: path.join(backupDir, filename) };
  } catch (error) {
    console.warn('[Conversion Rescue] Database backup failed:', error.message);
    return { ok: false, error };
  }
}

module.exports = { backupDatabase };
