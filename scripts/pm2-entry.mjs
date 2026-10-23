import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deploymentConfig, runtimeEnvironment, requireRelease } from './deploy-config.mjs';

const release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const role = process.argv[2];
let phase = 'configuration';
async function main() {
  const config = deploymentConfig(release);
  const allowed = ['web', ...config.kinds];
  if (!allowed.includes(role)) throw new Error('Process disabled or unknown.');
  const env = runtimeEnvironment(config, role);
  // Delete removed/role-restricted keys as well; load the file afresh on every restart.
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
  process.chdir(release);
  if (role === 'web') {
    phase = 'web-release';
    requireRelease(release);
    phase = 'web-start';
    await import(pathToFileURL(path.join(release, '.next/standalone/server.js')).href);
    return;
  }
  const jobs = {
    'auth-mail': ['auth-mail.ts', '--watch'], reminders: ['reminders.ts', '--watch'],
    media: ['media-maintenance.ts'], privacy: ['privacy-maintenance.ts'],
  };
  phase = 'worker-start';
  let child; let stopped = false; const stop = new AbortController();
  const shutdown = () => { stopped = true; stop.abort(); child?.kill('SIGTERM'); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  do {
    const code = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx', path.join(release, 'scripts', jobs[role][0]), ...jobs[role].slice(1)], { env, stdio: 'inherit', cwd: release });
      child.once('error', reject); child.once('exit', (status) => resolve(status ?? 1));
    });
    child = undefined;
    if (stopped) break;
    if (['auth-mail', 'reminders'].includes(role)) throw new Error('Persistent worker exited.');
    if (code !== 0) console.error(`${role} pass failed/blocked; retry at the next interval.`);
    await delay(role === 'media' ? 60_000 : 3_600_000, undefined, { signal: stop.signal }).catch(() => {});
  } while (!stopped);
}
void main().catch((error) => {
  const code = /^[A-Z_]+$/.test(error.code || '') ? error.code : 'START_FAILED';
  console.error(`PM2 entry failed (${phase}, ${code}). Check configuration, release and service availability.`);
  process.exitCode = 1;
}).finally(() => {
  // PM2's IPC connection otherwise keeps a drained worker supervisor alive after SIGINT.
  if (role !== 'web' || process.exitCode) {
    if (process.connected) process.disconnect();
  }
});
