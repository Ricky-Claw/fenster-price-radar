export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      allow: 'POST',
    });
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'set-cookie': 'fenster_radar_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
  });
  res.end(JSON.stringify({ ok: true }));
}
