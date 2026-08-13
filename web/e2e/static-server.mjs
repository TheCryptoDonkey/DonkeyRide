import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.STATIC_PWA_PORT || 4180);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const requested = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  let file = join(root, requested);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    file = join(root, pathname.startsWith('/provide') || pathname.startsWith('/drive')
      ? 'driver.html'
      : 'index.html');
  }
  response.statusCode = 200;
  response.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
  response.setHeader('cache-control', 'no-store');
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1');
