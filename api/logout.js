export default async function handler(req, res) {
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'set-cookie': 'fenster_radar_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
  });
  res.end(JSON.stringify({ ok: true }));
}
