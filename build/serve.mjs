// npm run dev: build once, serve dist/ on every interface, rebuild when content changes.
// Set PORT and HOST to override.
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { ROOT, build } from './build.mjs';

const DIST = join(ROOT, 'dist');
const HOST = process.env.HOST || '0.0.0.0';
const FIRST_PORT = Number(process.env.PORT || 4380);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/rss+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function resolve(base, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const target = join(base, clean);
  if (!target.startsWith(base)) return null;
  try {
    const info = await stat(target);
    const found = info.isDirectory() ? join(target, 'index.html') : target;
    await stat(found);
    return found;
  } catch {
    return null;
  }
}

async function handle(request, response) {
  const file = await resolve(DIST, request.url);
  try {
    if (!file) throw new Error('missing');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': TYPES['.html'] });
    response.end(await readFile(join(DIST, '404.html')).catch(() => 'not found'));
  }
}

function listen(server, port) {
  return new Promise((done, fail) => {
    server.once('error', (error) => (error.code === 'EADDRINUSE' ? done(listen(server, port + 1)) : fail(error)));
    server.listen(port, HOST, () => done(port));
  });
}

await build();
const port = await listen(createServer(handle), FIRST_PORT);
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a.family === 'IPv4' && !a.internal)
  .map((a) => `http://${a.address}:${port}/`);
process.stderr.write(`serving dist/ on ${HOST}:${port}\n${addresses.join('\n')}\n`);

let timer = null;
for (const dir of ['content', 'posts', 'assets', 'site.json']) {
  try {
    watch(join(ROOT, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        build().catch((error) => process.stderr.write(`rebuild failed: ${error.message}\n`));
      }, 100);
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
