/* eslint-disable @typescript-eslint/no-require-imports -- PM2 loads ecosystem.config.js as CommonJS. */
const path = require('node:path');
const fs = require('node:fs');
const { parseEnv } = require('node:util');

const root = __dirname;
const name = process.env.MORY_APP_NAME || 'mory';
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/.test(name)) throw new Error('Invalid MORY_APP_NAME');
const envFile = path.resolve(process.env.MORY_ENV_FILE || path.join(root, '.env.production'));
const values = parseEnv(fs.readFileSync(envFile, 'utf8'));
const current = path.join(root, '.deploy/current');
const base = {
  // Keep script relative: PM2 interprets a space in a script string as a shell command.
  cwd: current, script: 'scripts/pm2-entry.mjs', interpreter: process.execPath,
  exec_mode: 'fork', instances: 1, watch: false, autorestart: true,
  restart_delay: 5000, min_uptime: '10s', max_restarts: 10, kill_timeout: 150000,
  time: true, merge_logs: true,
  env: { NODE_ENV: 'production', MORY_ENV_FILE: envFile, MORY_APP_NAME: name },
};
const apps = [{ ...base, name, args: ['web'] }];
if (values.MORY_DATA_MODE === 'server' && values.MORY_PM2_WORKERS !== 'false') {
  const kinds = ['privacy'];
  if (values.AUTH_EMAIL_ENABLED === 'true') kinds.push('auth-mail');
  if (values.MORY_MEDIA_ENABLED === 'true') kinds.push('media');
  if (values.MORY_REMINDERS_ENABLED === 'true' && values.AUTH_EMAIL_ENABLED === 'true') kinds.push('reminders');
  for (const kind of kinds) apps.push({ ...base, name: `${name}-${kind}`, args: [kind] });
}
module.exports = { apps };
