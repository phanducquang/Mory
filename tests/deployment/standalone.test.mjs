import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, link, symlink, readlink, readdir, access, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

const repo = path.resolve(import.meta.dirname, '../..');
async function linkTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) await linkTree(from, to);
    else if (entry.isSymbolicLink()) await symlink(await readlink(from), to);
    else await link(from, to);
  }
}
function run(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject); child.once('exit', code => resolve({ code, output }));
  });
}

test('a nested release builds a flat standalone server and serves assets through the real PM2 entrypoint', { timeout: 240_000 }, async () => {
  await mkdir(path.join(repo, '.next'), { recursive: true });
  const directory = await mkdtemp(path.join(repo, '.next/deploy-build-'));
  const release = path.join(directory, '.deploy/releases/fixture');
  const envFile = path.join(directory, '.env.production');
  let server;
  try {
    await mkdir(release, { recursive: true });
    // Reproduce a parent lockfile plus a release lockfile, as on the Ubuntu VPS.
    await cp(path.join(repo, 'package-lock.json'), path.join(directory, 'package-lock.json'));
    for (const item of ['src', 'public', 'scripts', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'tokens.css']) {
      await cp(path.join(repo, item), path.join(release, item), { recursive: true });
    }
    // Real dependencies inside this release, without network installation or an external symlink.
    await linkTree(path.join(repo, 'node_modules'), path.join(release, 'node_modules'));
    const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    await writeFile(envFile, `MORY_DATA_MODE=demo\nPORT=${port}\n`, { mode: 0o600 });
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', MORY_DATA_MODE: 'demo', MORY_ENV_FILE: envFile };
    const build = await run(['node_modules/next/dist/bin/next', 'build'], release, env);
    assert.equal(build.code, 0, build.output);
    assert.doesNotMatch(build.output, /inferred your workspace root|Detected additional lockfiles/);
    await access(path.join(release, '.next/standalone/server.js'));
    const prepared = await run(['scripts/deploy-tools.mjs', 'prepare', release], release, env);
    assert.equal(prepared.code, 0, prepared.output);
    let serverOutput = '';
    server = spawn(process.execPath, ['scripts/pm2-entry.mjs', 'web'], { cwd: release, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', chunk => { serverOutput += chunk; }); server.stderr.on('data', chunk => { serverOutput += chunk; });
    const origin = `http://127.0.0.1:${port}`;
    let response;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { response = await fetch(`${origin}/_mory-release.json`, { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch {}
      if (server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(response?.ok, serverOutput);
    assert.equal((await response.json()).release, 'fixture');
    const page = await fetch(`${origin}/home`); assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Mory/); assert.match(page.headers.get('content-security-policy'), /script-src/);
    const css = html.match(/href="([^\"]*\/_next\/static\/[^\"]+\.css[^\"]*)"/);
    assert.ok(css, 'Expected CSS emitted by the real production build.');
    const asset = await fetch(new URL(css[1].replaceAll('&amp;', '&'), origin));
    assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /text\/css/);
    assert.equal((await fetch(`${origin}/icons/icon-192.png`)).status, 200);
    assert.equal(JSON.parse(await readFile(path.join(release, 'public/_mory-release.json'), 'utf8')).release, 'fixture');
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
    await rm(directory, { recursive: true, force: true });
  }
});
