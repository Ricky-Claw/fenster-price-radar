const crypto = require('node:crypto');

const ENV_NAME = 'RUECKHOL_DATA_KEY';
const PREFIX = 'enc:v1:';

function loadKey() {
  const encoded = process.env[ENV_NAME];
  if (!encoded) {
    throw new Error(
      `${ENV_NAME} is required. Set it to a base64-encoded 32-byte key (generate with: openssl rand -base64 32).`,
    );
  }

  let key;
  try {
    key = Buffer.from(encoded, 'base64');
  } catch (_) {
    key = null;
  }
  if (!key || key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error(`${ENV_NAME} must be canonical base64 encoding of exactly 32 bytes.`);
  }
  return key;
}

function createDataEncryption() {
  const key = loadKey();

  function encryptJson(value, context, siteId) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${context}:${siteId}`, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value ?? {}), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
  }

  function decryptJson(value, context, siteId, fallback = {}) {
    if (!value) return fallback;
    if (!value.startsWith(PREFIX)) {
      try {
        return JSON.parse(value);
      } catch (_) {
        return fallback;
      }
    }

    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid encrypted ${context}: malformed envelope.`);
    }

    const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, 'base64'));
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error(`Cannot decrypt ${context}; check ${ENV_NAME} and database integrity.`);
    }

    function decryptWithAad(aad) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }

    let plaintext;
    try {
      plaintext = decryptWithAad(`${context}:${siteId}`);
    } catch (siteError) {
      try {
        plaintext = decryptWithAad(context);
      } catch (legacyError) {
        throw new Error(`Cannot decrypt ${context}; check ${ENV_NAME} and database integrity.`, { cause: legacyError });
      }
    }
    try {
      return JSON.parse(plaintext);
    } catch (error) {
      throw new Error(`Cannot decrypt ${context}; check ${ENV_NAME} and database integrity.`, { cause: error });
    }
  }

  return {
    decryptJson,
    encryptJson,
    isEncrypted(value) {
      return typeof value === 'string' && value.startsWith(PREFIX);
    },
  };
}

module.exports = {
  ENV_NAME,
  PREFIX,
  createDataEncryption,
};
