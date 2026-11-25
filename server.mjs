import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Small development server. CSV data never passes through this server.
const root = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.argv[2] || process.env.PORT || 3020);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Choose a port between 1 and 65535: node server.mjs 3021');
  process.exit(1);
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg'
};
const server = createServer(async (req, res) => {
  const respond = (status, message) => {
    res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8'});
    res.end(req.method === 'HEAD' ? undefined : message);
  };
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD'); respond(405, 'Method not allowed'); return;
  }
  let requested;
  try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { respond(400, 'Invalid URL'); return; }
  const candidate = resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  if (!candidate.startsWith(root + sep)) { respond(403, 'Forbidden'); return; }
  try {
    const path = await realpath(candidate);
    if (!path.startsWith(root + sep)) { respond(403, 'Forbidden'); return; }
    if (!(await stat(path)).isFile()) { respond(404, 'File not found'); return; }
    const bytes = await readFile(path);
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { respond(404, 'File not found'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is busy. Try: node server.mjs ${port + 1}`
    : `Could not start Cella: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Cella is ready at http://127.0.0.1:${port}`);
  console.log('Open this address in your browser. Press Ctrl+C to stop.');
});
