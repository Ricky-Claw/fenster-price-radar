import assert from 'node:assert/strict';
import middleware from '../middleware.js';

process.env.FENSTER_RADAR_PASSWORD = 'test-passwort';
process.env.FENSTER_RADAR_AUTH_SECRET = 'test-secret';
process.env.RADAR_AGENT_TOKEN = 'agent-token-123';

function req(path, headers = {}) {
  return new Request(`https://radar.example${path}`, { headers });
}

// Ohne Auth: /data/* -> 401, App-Seiten -> Redirect auf /login
const noAuthData = await middleware(req('/data/price-radar.json'));
assert.equal(noAuthData.status, 401);
const noAuthPage = await middleware(req('/'));
assert.equal(noAuthPage.status, 302);

// Falscher/kaputter Bearer -> weiterhin 401
assert.equal((await middleware(req('/data/price-radar.json', { authorization: 'Bearer falsch' }))).status, 401);
assert.equal((await middleware(req('/data/price-radar.json', { authorization: 'agent-token-123' }))).status, 401);

// Richtiger Bearer -> durchgelassen (undefined = kein Response)
assert.equal(await middleware(req('/data/price-radar.json', { authorization: 'Bearer agent-token-123' })), undefined);
assert.equal(await middleware(req('/data/history/price-radar-2026-07-07.json', { authorization: 'Bearer agent-token-123' })), undefined);
// Pfad-Normalisierung (Groß-/Kleinschreibung, doppelte Slashes) bleibt wirksam
assert.equal(await middleware(req('/DATA//price-radar.json', { authorization: 'Bearer agent-token-123' })), undefined);

// Token gilt NUR für /data/* — App-Seiten bleiben Login-pflichtig
assert.equal((await middleware(req('/', { authorization: 'Bearer agent-token-123' }))).status, 302);

// Kein Token konfiguriert -> Bearer wirkungslos
delete process.env.RADAR_AGENT_TOKEN;
assert.equal((await middleware(req('/data/price-radar.json', { authorization: 'Bearer agent-token-123' }))).status, 401);

console.log('agent-token ok');
