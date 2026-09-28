import { createServer } from 'node:http';
import { handle } from './app.js';

const MAX_BODY = 1024 * 1024;

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  let result;
  try {
    const body = await readJson(req);
    result = await handle({ method: req.method, path: req.url, headers: req.headers, body });
  } catch (err) {
    result = { status: err.status ?? 400, body: { error: err.message } };
  }
  res.writeHead(result.status, { 'content-type': 'application/json' });
  res.end(result.body === null ? '' : JSON.stringify(result.body));
}).listen(process.env.PORT ?? 3000);
