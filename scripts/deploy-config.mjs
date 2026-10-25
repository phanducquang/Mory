import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { readHttpOrigin } from './config-origin.mjs';

// Pure Node: usable before npm ci. Never source dotenv as shell code or print its values.
export function deploymentConfig(root, source = process.env) {
  const envFile = path.resolve(source.MORY_ENV_FILE || path.join(root, '.env.production'));
  let values;
  try { values = parseEnv(readFileSync(envFile, 'utf8')); }
  catch { throw new Error('Không đọc được MORY_ENV_FILE (.env.production mặc định).'); }
  const name = source.MORY_APP_NAME || 'mory';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/.test(name)) throw new Error('MORY_APP_NAME không hợp lệ.');
  const port = Number(values.PORT || '3000');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT phải từ 1024 đến 65535.');
  for (const field of ['AUTH_ALLOW_SIGNUP', 'AUTH_EMAIL_ENABLED', 'MORY_MEDIA_ENABLED', 'MORY_REMINDERS_ENABLED', 'MORY_PM2_WORKERS', 'SMTP_SECURE', 'SMTP_ALLOW_INSECURE_LOCAL', 'S3_FORCE_PATH_STYLE']) {
    if (values[field] && !['true', 'false'].includes(values[field])) throw new Error(`${field} phải là true/false.`);
  }
  const mode = values.MORY_DATA_MODE || 'demo';
  if (!['demo', 'server'].includes(mode)) throw new Error('MORY_DATA_MODE phải là demo/server.');
  const server = mode === 'server';
  const email = server && values.AUTH_EMAIL_ENABLED === 'true';
  const media = server && values.MORY_MEDIA_ENABLED === 'true';
  const reminders = server && values.MORY_REMINDERS_ENABLED === 'true';
  const workers = server && values.MORY_PM2_WORKERS !== 'false';
  const required = (field) => { if (!values[field]) throw new Error(`Thiếu cấu hình ${field}.`); };
  const key = (field) => {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(values[field] || '')) throw new Error(`${field} cần 32 byte base64.`);
  };
  if (server) {
    required('DATABASE_URL'); required('BETTER_AUTH_URL'); required('BETTER_AUTH_SECRET');
    let database;
    try { database = new URL(values.DATABASE_URL); }
    catch { throw new Error('DATABASE_URL không hợp lệ.'); }
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || database.pathname.length < 2) throw new Error('DATABASE_URL phải trỏ tới PostgreSQL.');
    readHttpOrigin(values.BETTER_AUTH_URL, 'BETTER_AUTH_URL');
    if (values.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET cần ít nhất 32 ký tự ngẫu nhiên.');
  }
  if (email) {
    key('AUTH_MAIL_KEY'); required('AUTH_MAIL_FROM');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.AUTH_MAIL_FROM)) throw new Error('AUTH_MAIL_FROM không hợp lệ.');
    if (workers) {
      required('SMTP_HOST');
      const smtpPort = Number(values.SMTP_PORT || '587');
      if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT không hợp lệ.');
      if (values.SMTP_ALLOW_INSECURE_LOCAL === 'true') throw new Error('Production không cho phép SMTP_ALLOW_INSECURE_LOCAL=true.');
      if (!!values.SMTP_USER !== !!values.SMTP_PASSWORD) throw new Error('Cần cả SMTP_USER và SMTP_PASSWORD.');
    }
  }
  if (reminders && !email) throw new Error('Nhắc lịch cần AUTH_EMAIL_ENABLED=true.');
  if (media) {
    for (const field of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) required(field);
    readHttpOrigin(values.S3_ENDPOINT, 'S3_ENDPOINT');
  }
  if (values.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY) key('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY');
  if (values.AUTH_TRUSTED_EDGE_SECRET && values.AUTH_TRUSTED_EDGE_SECRET.length < 32) throw new Error('AUTH_TRUSTED_EDGE_SECRET cần ít nhất 32 ký tự.');
  const kinds = workers ? ['privacy', ...(email ? ['auth-mail'] : []), ...(media ? ['media'] : []), ...(reminders ? ['reminders'] : [])] : [];
  return { root, envFile, values, name, port, kinds, current: path.join(root, '.deploy/current') };
}

export function runtimeEnvironment(config, role, parent = process.env) {
  const env = { ...parent, ...config.values, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' };
  // No SMTP or backup credentials in the web/build process. File contents never enter PM2's config/dump.
  if (!['auth-mail', 'operator'].includes(role)) for (const k of Object.keys(env)) if (k.startsWith('SMTP_')) delete env[k];
  if (role !== 'operator') for (const k of ['MORY_BACKUP_KEY', 'PG_DUMP_BIN', 'PSQL_BIN']) delete env[k];
  if (['privacy', 'media', 'reminders'].includes(role)) delete env.BETTER_AUTH_SECRET;
  env.HOSTNAME = '127.0.0.1'; env.PORT = String(config.port);
  return env;
}

export function requireRelease(current) {
  if (!existsSync(path.join(current, '.next/standalone/server.js'))) throw new Error('Thiếu .next/standalone/server.js. Kiểm tra turbopack.root và outputFileTracingRoot trỏ tới thư mục release, rồi chạy lại ./deploy.sh.');
  if (!existsSync(path.join(current, 'public/_mory-release.json'))) throw new Error('Thiếu release marker; chạy ./deploy.sh để chuẩn bị release.');
}
