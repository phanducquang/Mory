import { cp, access } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Next standalone output excludes public/static files; prepare them for local use.
// Docker copies the same assets in its runner stage.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');
const { values } = parseArgs({ options: {
  hostname: { type: 'string', short: 'H' },
  port: { type: 'string', short: 'p' },
} });
try { await access(path.join(standalone, 'server.js')); }
catch { console.error('Chưa có bản production. Hãy chạy npm run build trước.'); process.exit(1); }
await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
process.env.HOSTNAME = values.hostname ?? '127.0.0.1';
process.env.PORT = values.port ?? process.env.PORT ?? '3000';
await import(pathToFileURL(path.join(standalone, 'server.js')).href);
