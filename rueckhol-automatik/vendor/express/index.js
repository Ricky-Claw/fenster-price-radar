const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PassThrough } = require('node:stream');
const { URL } = require('node:url');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function normalizePrefix(prefix) {
  if (!prefix || prefix === '/') return '/';
  return prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
}

function matchPrefix(pathname, prefix) {
  if (prefix === '/') return true;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function relativePathFor(pathname, prefix) {
  if (prefix === '/') return pathname;
  const value = pathname.slice(prefix.length);
  return value || '/';
}

function setHeader(res, name, value) {
  res.setHeader(name, value);
  return res;
}

function createResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.set = (name, value) => setHeader(res, name, value);
  res.header = res.set;
  res.type = (value) => {
    if (value.startsWith('.')) return setHeader(res, 'content-type', MIME_TYPES[value] || value);
    return setHeader(res, 'content-type', value);
  };
  res.json = (body) => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body) => {
    if (Buffer.isBuffer(body)) {
      if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/octet-stream');
      res.end(body);
      return res;
    }
    if (typeof body === 'object' && body !== null) return res.json(body);
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(String(body));
    return res;
  };
  res.redirect = (location) => {
    res.statusCode = 302;
    res.setHeader('location', location);
    res.end();
    return res;
  };
  return res;
}

function createRequest(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  req.originalUrl = req.url;
  req.path = requestUrl.pathname;
  req.query = {};
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (req.query[key] === undefined) req.query[key] = value;
    else if (Array.isArray(req.query[key])) req.query[key].push(value);
    else req.query[key] = [req.query[key], value];
  }
  req.get = (name) => req.headers[String(name || '').toLowerCase()];
  req.body = undefined;
  req.baseUrl = '';
  req.relativePath = req.path;
  return req;
}

function runHandler(handler, req, res, next) {
  try {
    const maybePromise = handler(req, res, next);
    if (maybePromise && typeof maybePromise.then === 'function') maybePromise.catch(next);
  } catch (error) {
    next(error);
  }
}

function express() {
  const middlewares = [];
  const routes = [];

  const app = (req, res) => {
    createRequest(req);
    createResponse(res);

    const stack = [];
    for (const middleware of middlewares) {
      if (matchPrefix(req.path, middleware.prefix)) {
        stack.push((innerReq, innerRes, next) => {
          innerReq.baseUrl = middleware.prefix === '/' ? '' : middleware.prefix;
          innerReq.relativePath = relativePathFor(innerReq.path, middleware.prefix);
          return middleware.handler(innerReq, innerRes, next);
        });
      }
    }

    const route = routes.find((entry) => entry.method === req.method && entry.path === req.path);
    if (route) stack.push(...route.handlers);

    let index = 0;
    const next = (error) => {
      if (error) {
        if (!res.writableEnded) {
          res.statusCode = error.statusCode || 500;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
        }
        return;
      }

      const handler = stack[index];
      index += 1;
      if (!handler) {
        if (!res.writableEnded) {
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
          } else {
            res.statusCode = 404;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        }
        return;
      }

      runHandler(handler, req, res, next);
    };

    next();
  };

  app.use = (prefixOrHandler, maybeHandler) => {
    const prefix = typeof prefixOrHandler === 'string' ? normalizePrefix(prefixOrHandler) : '/';
    const handler = typeof prefixOrHandler === 'string' ? maybeHandler : prefixOrHandler;
    middlewares.push({ prefix, handler });
    return app;
  };

  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    app[method.toLowerCase()] = (routePath, ...handlers) => {
      routes.push({
        method,
        path: routePath,
        handlers: handlers.flat(),
      });
      return app;
    };
  }

  app.listen = (port, host, callback) => {
    let listenHost = host;
    let listenCallback = callback;
    if (typeof host === 'function') {
      listenCallback = host;
      listenHost = '127.0.0.1';
    }
    if (!listenHost) listenHost = '127.0.0.1';
    return http.createServer(app).listen(port, listenHost, listenCallback);
  };
  app.inject = ({ method = 'GET', url = '/', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = new PassThrough();
    req.method = method.toUpperCase();
    req.url = url;
    req.headers = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]),
    );
    req.socket = { remoteAddress: '127.0.0.1' };

    const res = new PassThrough();
    const responseHeaders = {};
    const chunks = [];
    res.statusCode = 200;
    res.setHeader = (name, value) => {
      responseHeaders[String(name).toLowerCase()] = value;
    };
    res.getHeader = (name) => responseHeaders[String(name).toLowerCase()];
    res.removeHeader = (name) => {
      delete responseHeaders[String(name).toLowerCase()];
    };
    res.writeHead = (statusCode, headersObject = {}) => {
      res.statusCode = statusCode;
      for (const [key, value] of Object.entries(headersObject)) {
        res.setHeader(key, value);
      }
    };
    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    res.on('finish', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      resolve({
        status: res.statusCode,
        headers: responseHeaders,
        body: rawBody,
        json() {
          return JSON.parse(rawBody || '{}');
        },
      });
    });
    res.on('error', reject);

    app(req, res);
    if (body !== undefined) {
      const payload = Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
      req.end(payload);
    } else {
      req.end();
    }
  });
  return app;
}

express.json = function json() {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      req.body = {};
      next();
      return;
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      req.body = {};
      next();
      return;
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        req.body = {};
        next();
        return;
      }
      try {
        req.body = JSON.parse(raw);
        next();
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    req.on('error', next);
  };
};

express.static = function staticMiddleware(rootDir) {
  const absoluteRoot = path.resolve(rootDir);

  return (req, res, next) => {
    let relative = req.relativePath || req.path || '/';
    try {
      relative = decodeURIComponent(relative);
    } catch (_) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    const normalized = path.posix.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
    const requested = normalized === '/' ? '/index.html' : normalized;
    const filePath = path.join(absoluteRoot, requested.replace(/^\/+/, ''));

    if (!filePath.startsWith(absoluteRoot)) {
      next();
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) {
        next();
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader('content-type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
  };
};

module.exports = express;
