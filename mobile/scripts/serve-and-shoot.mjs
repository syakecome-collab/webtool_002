// dist-web を一時的に配信して、スクリーンショットを撮る。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8321;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const path = join('dist-web', decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, async () => {
  const child = spawn(process.execPath, ['scripts/screenshots.mjs'], { stdio: 'inherit', env: { ...process.env, BASE_URL: `http://localhost:${PORT}` } });
  child.on('exit', (code) => {
    server.close();
    process.exit(code ?? 0);
  });
});
