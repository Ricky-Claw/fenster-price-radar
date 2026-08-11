const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const allowedMime = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
});

const UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_ENTRY_LIMIT = 2 * 1024 * 1024;
const AGGREGAT_LIMIT = 4 * 1024 * 1024;

function readZipEntries(buffer) {
  const entries = new Map();
  let entryCount = 0;
  let totalDecoded = 0;
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50 || offset + 30 > buffer.length) throw new Error('Invalid ZIP local header');

    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    if ((flags & 0x09) !== 0 || (method !== 0 && method !== 8)) throw new Error('Unsupported ZIP entry');

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > buffer.length || dataEnd > buffer.length) throw new Error('Truncated ZIP entry');
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    entryCount += 1;
    if (entryCount > 64) throw new Error('Too many ZIP entries');
    let content = null;
    if (name === '[Content_Types].xml' || name === 'xl/workbook.xml' || name.toLowerCase().endsWith('.rels')) {
      const compressed = buffer.subarray(dataStart, dataEnd);
      const remainingBudget = AGGREGAT_LIMIT - totalDecoded;
      if (remainingBudget <= 0) throw new Error('ZIP content too large');
      const maxOutputLength = Math.min(ZIP_ENTRY_LIMIT, remainingBudget);
      if (method === 0 && compressed.length > maxOutputLength) throw new Error('ZIP content too large');
      content = method === 0
        ? Buffer.from(compressed)
        : zlib.inflateRawSync(compressed, { maxOutputLength });
      totalDecoded += content.length;
      if (totalDecoded >= AGGREGAT_LIMIT) throw new Error('ZIP content too large');
    }
    entries.set(name, content);
    offset = dataEnd;
  }
  return entries;
}

function looksLikeCsvText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.includes(0)) return false;
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (_) {
    return false;
  }
  if (/^\s*</.test(text)) return false;
  let printable = 0;
  let total = 0;
  for (const char of text) {
    total += 1;
    const code = char.codePointAt(0);
    if (char === '\r' || char === '\n' || char === '\t' || code >= 0x20) printable += 1;
  }
  return total > 0 && printable / total >= 0.9;
}

function sniffMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return 'application/pdf';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    try {
      const entries = readZipEntries(buffer);
      const contentTypes = entries.get('[Content_Types].xml')?.toString('utf8');
      const workbook = entries.get('xl/workbook.xml');
      if (!contentTypes || !workbook) return null;
      if ([...entries.keys()].some((name) => name.split('/').at(-1)?.toLowerCase() === 'vbaproject.bin')) return null;
      if (/spreadsheetml\.template|macroEnabled|ms-excel\.sheet\.binary\.macroEnabled|vnd\.ms-office\.vbaProject/i.test(contentTypes)) return null;
      for (const [name, content] of entries) {
        if (name.endsWith('.rels') && /relationships\/vbaProject/i.test(content.toString('utf8'))) return null;
      }
      return /spreadsheetml\.sheet\.main\+xml/i.test(contentTypes) ? XLSX_MIME : null;
    } catch (_) {
      return null;
    }
  }
  return looksLikeCsvText(buffer) ? 'text/csv' : null;
}

function newUploadId() {
  return crypto.randomBytes(24).toString('base64url');
}

function sanitizeFilename(name) {
  const cleaned = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
  return cleaned || 'datei';
}

function safeStoredName(originalName, mime) {
  const extension = allowedMime[mime];
  if (!extension) throw new Error('Unsupported upload MIME');
  const basename = path.posix.basename(sanitizeFilename(originalName).replace(/\\/g, '/'));
  const currentExtension = path.extname(basename);
  const stem = basename.slice(0, basename.length - currentExtension.length) || 'datei';
  return `${stem.slice(0, 200 - extension.length)}${extension}`;
}

function contentDispositionValue(name) {
  const cleaned = sanitizeFilename(name);
  const fallback = cleaned
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '_') || 'datei';
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function assertUploadId(id) {
  if (!UPLOAD_ID_PATTERN.test(String(id || ''))) throw new Error('Invalid upload id');
}

function createUploadStore(options = {}) {
  const uploadsDir = options.uploadsDir || path.resolve(__dirname, '..', '..', 'data', 'uploads');
  const uploadPath = (id) => {
    assertUploadId(id);
    return path.join(uploadsDir, id);
  };
  return {
    uploadsDir,
    writeUpload(id, buffer) {
      const filePath = uploadPath(id);
      fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, buffer, { flag: 'wx', mode: 0o600 });
    },
    readUpload(id) {
      return fs.readFileSync(uploadPath(id));
    },
    deleteUpload(id) {
      try {
        fs.unlinkSync(uploadPath(id));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
  };
}

const defaultStore = createUploadStore();

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  allowedMime,
  contentDispositionValue,
  createUploadStore,
  deleteUpload: defaultStore.deleteUpload,
  looksLikeCsvText,
  newUploadId,
  readUpload: defaultStore.readUpload,
  safeStoredName,
  sanitizeFilename,
  sha256,
  sniffMime,
  writeUpload: defaultStore.writeUpload,
};
