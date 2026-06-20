const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TOKEN = process.env.FPR_TRIGGER_TOKEN || '';
const PORT = Number.parseInt(process.env.FPR_TRIGGER_PORT || '8790', 10);
const REPO_DIR = process.env.FPR_REPO_DIR || '/opt/fenster-price-radar';
const FPR_LOCK = process.env.FPR_LOCK || '/tmp/fpr-weekly.lock';
const LOG_DIR = process.env.FPR_LOG_DIR || '/var/log/fenster-price-radar';
const HOST = '127.0.0.1';

if (!TOKEN) {
  console.error('FPR_TRIGGER_TOKEN is required');
  process.exit(1);
}

const expectedToken = Buffer.from(TOKEN, 'utf8');

let current = null;
let startedAt = null;
let finishedAt = null;
let lastExit = null;
let lastSignal = null;

function requestPath(req) {
  return (req.url || '').split('?')[0] || '/';
}

function isRunning() {
  return Boolean(current && !current.exited);
}

function sendJson(req, res, status, body, headers = {}) {
  const pathname = requestPath(req);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(`${JSON.stringify(body)}\n`);
  console.log(`${new Date().toISOString()} ${req.method} ${pathname} ${status}`);
}

function authorized(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return false;
  }

  const providedToken = Buffer.from(header.slice('Bearer '.length), 'utf8');
  if (providedToken.length !== expectedToken.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedToken, expectedToken);
}

function readDataGeneratedAt() {
  const dataPath = path.join(REPO_DIR, 'public', 'data', 'price-radar.json');
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return typeof data.generatedAt === 'string' ? data.generatedAt : null;
  } catch {
    return null;
  }
}

function openLogFile(date) {
  const stamp = date.toISOString().slice(0, 19).replace(/:/g, '-');
  const logPath = path.join(LOG_DIR, `trigger-${stamp}.log`);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    return fs.openSync(logPath, 'a');
  } catch (error) {
    console.error(`log_open_failed ${error.code || error.message}`);
    return null;
  }
}

function closeLogFile(logFd) {
  if (logFd === null) {
    return;
  }

  try {
    fs.closeSync(logFd);
  } catch {
    // The child has its own inherited fd; parent close failures are non-fatal.
  }
}

function scrapeEnv() {
  return Object.fromEntries(Object.entries({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    FPR_PUSH_ENABLED: '1',
    FPR_REPO_DIR: process.env.FPR_REPO_DIR || '/opt/fenster-price-radar',
  }).filter(([, value]) => value !== undefined));
}

function triggerRun(req, res) {
  if (isRunning()) {
    sendJson(req, res, 200, {
      started: false,
      running: true,
      reason: 'already_running',
    });
    return;
  }

  const lockProbe = spawnSync('flock', ['-n', FPR_LOCK, '-c', 'true']);
  if (lockProbe.status !== 0) {
    sendJson(req, res, 200, {
      started: false,
      running: true,
      reason: 'already_running',
    });
    return;
  }

  const now = new Date();
  const logFd = openLogFile(now);
  const stdio = logFd === null ? 'ignore' : ['ignore', logFd, logFd];
  const script = path.join(REPO_DIR, 'scripts', 'weekly-price-radar-update.sh');
  let child;

  try {
    child = spawn('flock', ['-n', FPR_LOCK, 'bash', script], {
      cwd: REPO_DIR,
      env: scrapeEnv(),
      detached: true,
      stdio,
    });
  } catch (error) {
    closeLogFile(logFd);
    console.error(`spawn_failed ${error.code || error.message}`);
    sendJson(req, res, 500, { error: 'spawn_failed' });
    return;
  }

  const run = {
    child,
    exited: false,
  };
  current = run;
  startedAt = now.toISOString();
  finishedAt = null;
  lastExit = null;
  lastSignal = null;

  let responded = false;

  child.once('spawn', () => {
    closeLogFile(logFd);
    child.unref();
    if (!responded) {
      responded = true;
      sendJson(req, res, 200, { started: true, running: true });
    }
  });

  child.once('error', (error) => {
    closeLogFile(logFd);
    run.exited = true;
    if (current === run) {
      current = null;
      finishedAt = new Date().toISOString();
      lastExit = null;
      lastSignal = null;
    }
    console.error(`spawn_failed ${error.code || error.message}`);
    if (!responded) {
      responded = true;
      sendJson(req, res, 500, { error: 'spawn_failed' });
    }
  });

  child.once('exit', (code, signal) => {
    run.exited = true;
    if (current === run) {
      current = null;
    }
    finishedAt = new Date().toISOString();
    lastExit = typeof code === 'number' ? code : (signal ? -1 : null);
    lastSignal = signal || null;
  });
}

function status(req, res) {
  const body = {
    running: isRunning(),
    startedAt,
    finishedAt,
    lastExit,
    dataGeneratedAt: readDataGeneratedAt(),
  };
  if (lastSignal) {
    body.lastSignal = lastSignal;
  }
  sendJson(req, res, 200, body);
}

const server = http.createServer((req, res) => {
  req.resume();

  const pathname = requestPath(req);
  const knownPath = pathname === '/fpr/trigger' || pathname === '/fpr/status';
  if (!knownPath) {
    sendJson(req, res, 404, { error: 'not_found' });
    return;
  }

  if (!authorized(req)) {
    sendJson(req, res, 401, { error: 'unauthorized' });
    return;
  }

  if (pathname === '/fpr/trigger') {
    if (req.method !== 'POST') {
      sendJson(req, res, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
      return;
    }
    triggerRun(req, res);
    return;
  }

  if (req.method !== 'GET') {
    sendJson(req, res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
    return;
  }
  status(req, res);
});

server.on('error', (error) => {
  console.error(`server_error ${error.code || error.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`fpr trigger server listening on ${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, closing server`);
  server.close((error) => {
    if (error) {
      console.error(`server_close_failed ${error.code || error.message}`);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
