import { spawn } from 'node:child_process';
import { readFile, cp, mkdir, symlink, rename, readlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploymentConfig, runtimeEnvironment, requireRelease } from './deploy-config.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, ...args] = process.argv.slice(2);
async function main() {
  const config = deploymentConfig(root);
  if (mode === 'check') { console.log('Cấu hình hợp lệ.'); return; }
  if (mode === 'name') { console.log(config.name); return; }
  if (mode === 'workers') { console.log(config.kinds.join(' ')); return; }
  if (mode === 'runtime-check') {
    Object.assign(process.env, runtimeEnvironment(config, 'operator'));
    if (config.values.MORY_DATA_MODE === 'server') {
      (await import(path.join(root, 'src/server/auth/config.ts'))).readAuthConfig();
      if (config.values.MORY_MEDIA_ENABLED === 'true') (await import(path.join(root, 'src/server/storage/config.ts'))).readStorageConfiguration();
      if (config.values.AUTH_EMAIL_ENABLED === 'true') {
        const mail = await import(path.join(root, 'src/server/mail/config.ts'));
        mail.readMailQueueConfig(); if (config.kinds.includes('auth-mail')) mail.readSmtpConfig();
      }
    }
    console.log('Runtime configuration passed.'); return;
  }
  if (mode === 'exec') {
    if (args.shift() !== '--' || !args.length) throw new Error('exec -- COMMAND [ARGS]');
    const child = spawn(args[0], args.slice(1), { env: runtimeEnvironment(config, 'operator'), stdio: 'inherit' });
    process.once('SIGTERM', () => child.kill('SIGTERM')); process.once('SIGINT', () => child.kill('SIGINT'));
    process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1)); });
    return;
  }
  if (mode === 'build-exec') {
    if (args.shift() !== '--' || !args.length) throw new Error('build-exec -- COMMAND [ARGS]');
    const child = spawn(args[0], args.slice(1), { env: runtimeEnvironment(config, 'build'), stdio: 'inherit' });
    process.once('SIGTERM', () => child.kill('SIGTERM')); process.once('SIGINT', () => child.kill('SIGINT'));
    process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1)); });
    return;
  }
  if (mode === 'prepare') {
    const release = path.resolve(args[0]);
    await cp(path.join(release, 'public'), path.join(release, '.next/standalone/public'), { recursive: true });
    await cp(path.join(release, '.next/static'), path.join(release, '.next/standalone/.next/static'), { recursive: true });
    const marker = JSON.stringify({ release: path.basename(release) });
    await writeFile(path.join(release, 'public/_mory-release.json'), marker);
    await writeFile(path.join(release, '.next/standalone/public/_mory-release.json'), marker);
    requireRelease(release); return;
  }
  if (mode === 'activate') {
    const release = path.resolve(args[0]);
    if (!release.startsWith(path.join(root, '.deploy/releases/'))) throw new Error('Release must be inside .deploy/releases.');
    requireRelease(release);
    const base = path.join(root, '.deploy'); await mkdir(base, { recursive: true });
    let previous;
    try { previous = await readlink(path.join(base, 'current')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (previous && path.resolve(base, previous) !== release) {
      await symlink(previous, path.join(base, `previous-${process.pid}`));
      await rename(path.join(base, `previous-${process.pid}`), path.join(base, 'previous'));
    }
    await symlink(release, path.join(base, `current-${process.pid}`));
    await rename(path.join(base, `current-${process.pid}`), path.join(base, 'current')); return;
  }
  if (mode === 'health') {
    const expected = JSON.parse(await readFile(path.join(config.current, 'public/_mory-release.json'), 'utf8')).release;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${config.port}/_mory-release.json`, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
        if (response.ok && (await response.json()).release === expected) { console.log('HTTP release check passed.'); return; }
      } catch { /* PM2 is still starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('HTTP health check không thấy release mới; kiểm tra pm2 logs, PORT và symlink current.');
  }
  throw new Error('Unknown deployment command.');
}
void main().catch((error) => { console.error(error.message); process.exitCode = 1; });
