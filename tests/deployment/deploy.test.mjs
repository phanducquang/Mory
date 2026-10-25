import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, readlink, rm, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { deploymentConfig, runtimeEnvironment } from '../../scripts/deploy-config.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const pm2Bin = process.env.MORY_TEST_PM2_BIN;
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', (c) => { output += c; }); child.stderr.on('data', (c) => { output += c; });
    child.once('error', reject); child.once('close', (code) => resolve({ code, output }));
  });
}
test('dotenv is literal, feature validation fails closed, and web credentials are restricted', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mory-deploy-env-'));
  try {
    const file = path.join(directory, '.env.production');
    await writeFile(file, 'MORY_DATA_MODE=demo\nPORT=3456\nSMTP_PASSWORD="$(never_execute)"\nMORY_BACKUP_KEY=private\n', { mode: 0o600 });
    const config = deploymentConfig(directory, {});
    assert.equal(config.port, 3456); assert.equal(config.values.SMTP_PASSWORD, '$(never_execute)');
    assert.equal(runtimeEnvironment(config, 'web', {}).SMTP_PASSWORD, undefined);
    assert.equal(runtimeEnvironment(config, 'web', {}).MORY_BACKUP_KEY, undefined);
    assert.equal(runtimeEnvironment(config, 'operator', {}).SMTP_PASSWORD, '$(never_execute)');
    const serverEnv = `MORY_DATA_MODE=server\nDATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture\nBETTER_AUTH_URL=https://mory.example.test\nBETTER_AUTH_SECRET=${'s'.repeat(40)}\nAUTH_EMAIL_ENABLED=true\nAUTH_MAIL_FROM=mory@example.test\nAUTH_MAIL_KEY=${Buffer.alloc(32).toString('base64')}\nSMTP_HOST=smtp.example.test\nMORY_REMINDERS_ENABLED=true\nMORY_MEDIA_ENABLED=true\nS3_ENDPOINT=https://s3.example.test\nS3_REGION=test\nS3_BUCKET=test\nS3_ACCESS_KEY_ID=fixture\nS3_SECRET_ACCESS_KEY=fixture\n`;
    await writeFile(file, serverEnv);
    const all = deploymentConfig(directory, {});
    assert.deepEqual(all.kinds, ['privacy', 'auth-mail', 'media', 'reminders']);
    assert.equal(runtimeEnvironment(all, 'privacy', {}).BETTER_AUTH_SECRET, undefined);
    await writeFile(file, serverEnv + 'MORY_PM2_WORKERS=false\n');
    assert.deepEqual(deploymentConfig(directory, {}).kinds, []);
    await writeFile(file, 'MORY_DATA_MODE=server\n');
    assert.throws(() => deploymentConfig(directory, {}), /DATABASE_URL/);
    await writeFile(file, 'MORY_DATA_MODE=demo\nPORT=not-a-port\n');
    assert.throws(() => deploymentConfig(directory, {}), /PORT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('deployment and runtime agree on HTTP/HTTPS origins before connecting to any service', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mory-deploy-storage-'));
  const file = path.join(directory, '.env.production');
  const base = `MORY_DATA_MODE=server\nDATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture\nBETTER_AUTH_URL=https://mory.example.test\nBETTER_AUTH_SECRET=${'s'.repeat(40)}\nMORY_MEDIA_ENABLED=true\nS3_REGION=us-east-1\nS3_BUCKET=private-test\nS3_ACCESS_KEY_ID=fixture\nS3_SECRET_ACCESS_KEY=fixture\nS3_FORCE_PATH_STYLE=true\n`;
  try {
    for (const endpoint of ['http://localhost:9000', 'http://127.0.0.1:9000/', 'http://[::1]:9000', 'http://10.0.0.5:9000', 'http://rustfs:9000', 'http://s3.example.test:9000', 'https://s3.example.test']) {
      await writeFile(file, `${base}S3_ENDPOINT="${endpoint}"\n`, { mode: 0o600 });
      const config = deploymentConfig(directory, {});
      assert.equal(config.values.S3_ENDPOINT, endpoint);
      assert.ok(config.kinds.includes('media'));
      const envFile = path.join(directory, '.env.production');
      const result = await run(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/deploy-tools.mjs', 'runtime-check'], { cwd: repo, env: { ...process.env, MORY_ENV_FILE: envFile } });
      assert.equal(result.code, 0, result.output);
    }
    for (const endpoint of ['http://127.0.0.1:9000/bucket', 'http://127.0.0.1:9000?token=fixture', 'http://127.0.0.1:9000#fragment', 'http://fixture:fixture@127.0.0.1:9000', 'ftp://127.0.0.1:9000', 'https://s3.example.test/bucket', 'not-a-url']) {
      await writeFile(file, `${base}S3_ENDPOINT="${endpoint}"\n`);
      assert.throws(() => deploymentConfig(directory, {}), /S3_ENDPOINT/, endpoint);
    }
    for (const origin of ['http://mory.example.test', 'http://10.0.0.5:3000', 'https://mory.example.test']) {
      await writeFile(file, `${base.replace('BETTER_AUTH_URL=https://mory.example.test', `BETTER_AUTH_URL=${origin}`)}S3_ENDPOINT=http://rustfs:9000\n`);
      deploymentConfig(directory, {});
      const result = await run(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/deploy-tools.mjs', 'runtime-check'], { cwd: repo, env: { ...process.env, MORY_ENV_FILE: file } });
      assert.equal(result.code, 0, result.output);
    }
    for (const origin of ['ftp://mory.example.test', 'http://mory.example.test/path', 'http://fixture:fixture@mory.example.test', 'http://mory.example.test?token=fixture', 'http://mory.example.test#fragment']) {
      await writeFile(file, `${base.replace('BETTER_AUTH_URL=https://mory.example.test', `BETTER_AUTH_URL="${origin}"`)}S3_ENDPOINT=http://rustfs:9000\n`);
      assert.throws(() => deploymentConfig(directory, {}), /BETTER_AUTH_URL/, origin);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// A real, isolated PM2 daemon + tiny HTTP fixture exercise orchestration; no Next build/real DB here.
test('build failure preserves the active release; real PM2 starts, reloads, updates env and restores a release', { skip: !pm2Bin, timeout: 90_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mory-deploy-flow-'));
  const root = path.join(directory, 'project with spaces'); const bin = path.join(directory, 'bin');
  await mkdir(root); await mkdir(bin); await mkdir(path.join(root, 'scripts'));
  for (const file of ['deploy.sh', 'ecosystem.config.js', 'scripts/deploy-tools.mjs', 'scripts/deploy-config.mjs', 'scripts/config-origin.mjs', 'scripts/pm2-entry.mjs']) await cp(path.join(repo, file), path.join(root, file));
  for (const folder of ['src', 'public', 'prisma']) await mkdir(path.join(root, folder));
  await mkdir(path.join(root, 'src/server/auth'), { recursive: true });
  await cp(path.join(repo, 'src/server/auth/config.ts'), path.join(root, 'src/server/auth/config.ts'));
  await writeFile(path.join(root, 'scripts/privacy-maintenance.ts'), `import {appendFileSync} from 'node:fs'; appendFileSync(process.env.MORY_TEST_TRACE!, process.env.BETTER_AUTH_SECRET ? 'leaked-auth\\n' : 'privacy-pass\\n');`);
  for (const file of ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'prisma.config.ts', 'eslint.config.mjs']) await writeFile(path.join(root, file), '{}');
  await writeFile(path.join(root, 'tokens.css'), ':root { --color-accent: rebeccapurple; }');
  const socket = net.createServer(); await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise((resolve) => socket.close(resolve));
  const envFile = path.join(root, '.env.production');
  await writeFile(envFile, `MORY_DATA_MODE=demo\nPORT=${port}\nFIXTURE_VALUE=first\n`, { mode: 0o600 });
  const trace = path.join(directory, 'commands');
  // Only npm build/install are fixtures. PM2, bash, tar, runtime wrapper and HTTP checks are real.
  await writeFile(path.join(bin, 'npm'), `#!/usr/bin/env node
const fs=require('node:fs');const p=require('node:path');
fs.appendFileSync(process.env.MORY_TEST_TRACE,process.argv.slice(2).join(' ')+'\\n');
if(process.argv[2]==='ci'){fs.symlinkSync(process.env.MORY_TEST_NODE_MODULES,p.join(process.cwd(),'node_modules'),'dir');process.exit(0);}
if(process.env.MORY_TEST_FAIL_BUILD==='true')process.exit(23);
if(process.argv[2]==='run'&&process.argv[3]==='build'){
 fs.mkdirSync('.next/standalone',{recursive:true});fs.mkdirSync('.next/static',{recursive:true});
 fs.writeFileSync('.next/standalone/server.js',${JSON.stringify(`const http=require('node:http'),fs=require('node:fs'),p=require('node:path');
http.createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/fixture'){res.end(JSON.stringify({value:process.env.FIXTURE_VALUE}));return;}try{res.end(fs.readFileSync(p.join(__dirname,'public/_mory-release.json')))}catch{res.statusCode=503;res.end('{}')}}).listen(Number(process.env.PORT),'127.0.0.1');`)});
}
`, { mode: 0o700 });
  await writeFile(path.join(bin, 'pm2'), `#!/usr/bin/env bash\nexec ${JSON.stringify(pm2Bin)} "$@"\n`, { mode: 0o700 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PM2_HOME: path.join(directory, 'pm2-home'), MORY_ENV_FILE: envFile, MORY_APP_NAME: 'mory-deploy-test', MORY_TEST_TRACE: trace, MORY_TEST_NODE_MODULES: path.join(repo, 'node_modules') };
  delete env.MORY_TEST_FAIL_BUILD;
  try {
    let result = await run('bash', ['./deploy.sh'], { cwd: root, env });
    let diagnostic = '';
    if (result.code) {
      const state = await run(pm2Bin, ['jlist'], { cwd: root, env });
      try { diagnostic += JSON.stringify(JSON.parse(state.output).map(({ pm2_env: e }) => ({ status: e.status, restarts: e.restart_time, script: e.pm_exec_path, args: e.args, cwd: e.pm_cwd, exitCode: e.exit_code }))); } catch {}
      const logDirectory = path.join(env.PM2_HOME, 'logs');
      for (const file of await readdir(logDirectory)) diagnostic += await readFile(path.join(logDirectory, file), 'utf8');
    }
    assert.equal(result.code, 0, result.output + diagnostic);
    const first = await readlink(path.join(root, '.deploy/current'));
    assert.equal(await readFile(path.join(first, 'tokens.css'), 'utf8'), ':root { --color-accent: rebeccapurple; }');
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/fixture`)).json(), { value: 'first' });
    assert.equal((await readFile(trace, 'utf8')).includes('db:migrate'), false);
    result = await run('bash', ['./deploy.sh'], { cwd: root, env: { ...env, MORY_TEST_FAIL_BUILD: 'true' } });
    assert.notEqual(result.code, 0);
    assert.equal(await readlink(path.join(root, '.deploy/current')), first);
    assert.equal((await fetch(`http://127.0.0.1:${port}/fixture`)).status, 200);
    await writeFile(envFile, `MORY_DATA_MODE=demo\nPORT=${port}\nFIXTURE_VALUE=second\n`, { mode: 0o600 });
    result = await run('bash', ['./deploy.sh'], { cwd: root, env });
    assert.equal(result.code, 0, result.output);
    assert.notEqual(await readlink(path.join(root, '.deploy/current')), first);
    assert.equal(await readlink(path.join(root, '.deploy/previous')), first);
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/fixture`)).json(), { value: 'second' });
    assert.equal((await run(process.execPath, ['scripts/deploy-tools.mjs', 'activate', first], { cwd: root, env })).code, 0);
    result = await run(pm2Bin, ['reload', path.join(root, 'ecosystem.config.js'), '--only', 'mory-deploy-test', '--update-env'], { cwd: root, env });
    assert.equal(result.code, 0, result.output);
    result = await run(process.execPath, ['scripts/deploy-tools.mjs', 'health'], { cwd: root, env });
    assert.equal(result.code, 0, result.output);
    // A rollback changes code only: the shared environment remains current.
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/fixture`)).json(), { value: 'second' });
    const serverEnv = `MORY_DATA_MODE=server\nPORT=${port}\nDATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture\nBETTER_AUTH_URL=http://mory.example.test\nBETTER_AUTH_SECRET=${'s'.repeat(40)}\n`;
    await writeFile(envFile, serverEnv);
    result = await run('bash', ['./deploy.sh', '--migrate'], { cwd: root, env });
    assert.equal(result.code, 0, result.output);
    assert.match(await readFile(trace, 'utf8'), /run db:migrate/);
    for (let i = 0; i < 30 && !(await readFile(trace, 'utf8')).includes('privacy-pass'); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.match(await readFile(trace, 'utf8'), /privacy-pass/);
    assert.doesNotMatch(await readFile(trace, 'utf8'), /leaked-auth/);
    const states = JSON.parse((await run(pm2Bin, ['jlist'], { cwd: root, env })).output);
    assert.equal(states.find((p) => p.name === 'mory-deploy-test-privacy')?.pm2_env.status, 'online');
    await writeFile(envFile, serverEnv + 'MORY_PM2_WORKERS=false\n');
    result = await run('bash', ['./deploy.sh'], { cwd: root, env }); assert.equal(result.code, 0, result.output);
    assert.notEqual((await run(pm2Bin, ['describe', 'mory-deploy-test-privacy'], { cwd: root, env })).code, 0);
    await mkdir(path.join(root, '.deploy/deploy.lock'));
    result = await run('bash', ['./deploy.sh'], { cwd: root, env }); assert.notEqual(result.code, 0);
  } finally {
    await run(pm2Bin, ['kill'], { cwd: root, env });
    await rm(directory, { recursive: true, force: true });
  }
});
