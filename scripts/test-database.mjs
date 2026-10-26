import { randomBytes, randomUUID, randomInt } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import net from "node:net";
import os from "node:os";
import path from "node:path";

// Always creates its own disposable database. Never reads an external DATABASE_URL.
const name = `mory-test-${randomUUID()}`;
const password = randomBytes(32).toString("hex");
const mediaAccess = randomBytes(16).toString("hex");
const mediaSecret = randomBytes(32).toString("hex");
const mediaName = `mory-media-test-${randomUUID()}`;
const appImage = process.argv[process.argv.indexOf("--app-image") + 1];
const useImage = process.argv.includes("--app-image");
const networkName = `mory-network-${randomUUID()}`;
const appName = `mory-app-test-${randomUUID()}`;
const withReminders = process.argv.includes("--reminders");
const withEmail = process.argv.includes("--email");
const mailName = `mory-mail-test-${randomUUID()}`;
const mailKey = randomBytes(32).toString("base64");
const withMedia = process.argv.includes("--media");
const authSecret = randomBytes(32).toString("hex");
const scrub = (value) => String(value).replaceAll(password, "[redacted]").replaceAll(authSecret, "[redacted]").replaceAll(mediaAccess, "[redacted]").replaceAll(mediaSecret, "[redacted]").replaceAll(mailKey, "[redacted]");
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], ...options });
    let output = "";
    child.stdout.on("data", (data) => { output += data; if (options.stream) process.stdout.write(scrub(data)); });
    child.stderr.on("data", (data) => { output += data; if (options.stream) process.stderr.write(scrub(data)); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(options.stream ? `${command} exited ${code}` : scrub(output) || `${command} exited ${code}`)));
    child.stdin.end(options.input);
  });
}
let created = false;
let mediaCreated = false;
let networkCreated = false;
let appCreated = false;
let server;
let mailCreated = false;
let mailWorker;
let reminderWorker;
try {
  if (withReminders && !withEmail) throw new Error("--reminders requires --email.");
  if (useImage) {
    if (!appImage || appImage.startsWith("--")) throw new Error("--app-image requires a local image name.");
    await run("docker", ["network", "create", networkName]); networkCreated = true;
  }
  console.log("Starting disposable PostgreSQL 17 on a random localhost port…");
  await run("docker", ["run", "--detach", "--rm", "--name", name,
    "--label", "app=mory-integration-test", ...(useImage ? ["--network", networkName, "--network-alias", "postgres"] : []), "--env-file", "/dev/stdin",
    "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,size=256m", "postgres:17-alpine"],
    { input: `POSTGRES_USER=mory_test\nPOSTGRES_DB=mory_test\nPOSTGRES_PASSWORD=${password}\n` });
  created = true;
  const binding = await run("docker", ["port", name, "5432/tcp"]);
  const port = Number(binding.match(/127\.0\.0\.1:(\d+)/)?.[1]);
  if (!port) throw new Error("Test database did not bind to localhost.");
  const connectionString = `postgresql://mory_test:${password}@127.0.0.1:${port}/mory_test`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 500 });
    try { await client.connect(); await client.query("SELECT 1"); ready = true; }
    catch { /* PostgreSQL is still initializing. */ }
    finally { await client.end(); }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error("Test PostgreSQL did not become ready.");
  const env = { ...process.env, DATABASE_URL: connectionString, MORY_INTEGRATION_DATABASE: "disposable-docker", MORY_BACKUP_TEST_CONTAINER: name, MORY_MEDIA_ENABLED: "false", AUTH_EMAIL_ENABLED: "false", MORY_REMINDERS_ENABLED: withReminders ? "true" : "false" };
  if (withMedia) {
    console.log("Starting disposable private MinIO on a random localhost port…");
    await run("docker", ["run", "--detach", "--rm", "--name", mediaName, "--label", "app=mory-integration-test",
      ...(useImage ? ["--network", networkName, "--network-alias", "minio"] : []), "--env-file", "/dev/stdin", "--publish", "127.0.0.1::9000", "--tmpfs", "/data:rw,nosuid,nodev,size=512m",
      "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z", "server", "/data"],
      { input: `MINIO_ROOT_USER=${mediaAccess}\nMINIO_ROOT_PASSWORD=${mediaSecret}\n` });
    mediaCreated = true;
    const binding = await run("docker", ["port", mediaName, "9000/tcp"]);
    const mediaPort = Number(binding.match(/127\.0\.0\.1:(\d+)/)?.[1]);
    if (!mediaPort) throw new Error("Test MinIO did not bind to localhost.");
    const endpoint = `http://127.0.0.1:${mediaPort}`;
    let mediaReady = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch(`${endpoint}/minio/health/ready`)).ok) { mediaReady = true; break; } } catch {}
      await delay(250);
    }
    if (!mediaReady) throw new Error("Test MinIO did not become ready.");
    const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: mediaAccess, secretAccessKey: mediaSecret } });
    try { await s3.send(new CreateBucketCommand({ Bucket: "mory-private-test" })); } finally { s3.destroy(); }
    Object.assign(env, { MORY_MEDIA_ENABLED: "true", S3_ENDPOINT: endpoint, S3_REGION: "us-east-1", S3_BUCKET: "mory-private-test",
      S3_ACCESS_KEY_ID: mediaAccess, S3_SECRET_ACCESS_KEY: mediaSecret, S3_FORCE_PATH_STYLE: "true" });
  }
  if (withEmail) {
    console.log("Starting disposable SMTP mailbox on random localhost ports…");
    await run("docker", ["run", "--detach", "--rm", "--name", mailName, "--label", "app=mory-integration-test",
      ...(useImage ? ["--network", networkName, "--network-alias", "mailcatcher"] : []),
      "--publish", "127.0.0.1::1025", "--publish", "127.0.0.1::1080", "dockage/mailcatcher:0.9.0"]);
    mailCreated = true;
    const smtpPort = Number((await run("docker", ["port", mailName, "1025/tcp"])).match(/127\.0\.0\.1:(\d+)/)?.[1]);
    const httpPort = Number((await run("docker", ["port", mailName, "1080/tcp"])).match(/127\.0\.0\.1:(\d+)/)?.[1]);
    if (!smtpPort || !httpPort) throw new Error("Mail test container did not bind to localhost.");
    const inbox = `http://127.0.0.1:${httpPort}`;
    let ready = false;
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${inbox}/messages`)).ok) { ready = true; break; } } catch {} await delay(250); }
    if (!ready) throw new Error("SMTP mailbox did not become ready.");
    Object.assign(env, { AUTH_EMAIL_ENABLED: "true", AUTH_MAIL_KEY: mailKey, AUTH_MAIL_FROM: "mory@example.test",
      SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_SECURE: "false", SMTP_ALLOW_INSECURE_LOCAL: "true", MORY_TEST_INBOX: inbox });
  }
  // Deploy the reviewed SQL, then verify deploy is repeatable before running tests.
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma.config.ts"], { env, stream: true });
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma.config.ts"], { env, stream: true });
  await run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.mts", ...(process.env.MORY_INTEGRATION_TEST_FILTER ? [process.env.MORY_INTEGRATION_TEST_FILTER] : [])], { env, stream: true });
  if (withMedia) await run(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/media-maintenance.ts"], { env, stream: true });
  await run(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/privacy-maintenance.ts"], { env, stream: true });
  if (withEmail) {
    await run(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/auth-mail.ts"], { env, stream: true });
    mailWorker = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/auth-mail.ts", "--watch"], { env, stdio: ["ignore", "pipe", "pipe"] });
    // Counts/errors contain no addresses, bearer tokens or SMTP credentials.
    mailWorker.stdout.on("data", () => {}); mailWorker.stderr.on("data", () => {});
  }
  if (process.argv.includes("--e2e")) {
    let appPort;
    if (useImage) appPort = randomInt(20000, 60000);
    else {
      const socket = net.createServer();
      await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
      appPort = socket.address().port;
      await new Promise((resolve) => socket.close(resolve));
    }
    const baseURL = `http://127.0.0.1:${appPort}`;
    const accountEnv = { ...env, MORY_DATA_MODE: "server", AUTH_ALLOW_SIGNUP: "true", BETTER_AUTH_SECRET: authSecret, BETTER_AUTH_URL: baseURL, PLAYWRIGHT_BASE_URL: baseURL };
    if (withReminders) {
      reminderWorker = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/reminders.ts", "--watch"], { env: accountEnv, stdio: ["ignore", "pipe", "pipe"] });
      reminderWorker.stdout.on("data", () => {}); reminderWorker.stderr.on("data", () => {});
    }
    const reset = new pg.Client({ connectionString });
    try { await reset.connect(); await reset.query('DELETE FROM "AuthRateLimit"'); } finally { await reset.end(); }
    let serverOutput = "";
    if (useImage) {
      const containerEnv = { ...accountEnv, DATABASE_URL: `postgresql://mory_test:${password}@postgres:5432/mory_test`, S3_ENDPOINT: "http://minio:9000", HOSTNAME: "0.0.0.0", PORT: "3000" };
      const keys = ["DATABASE_URL", "MORY_DATA_MODE", "AUTH_ALLOW_SIGNUP", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "MORY_MEDIA_ENABLED", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE", "HOSTNAME", "PORT", "AUTH_EMAIL_ENABLED", "AUTH_MAIL_KEY", "AUTH_MAIL_FROM", "MORY_REMINDERS_ENABLED"];
      await run("docker", ["run", "--detach", "--rm", "--name", appName, "--network", networkName, "--publish", `127.0.0.1:${appPort}:3000`, "--env-file", "/dev/stdin", appImage], { input: keys.filter((key) => containerEnv[key] !== undefined).map((key) => `${key}=${containerEnv[key]}`).join("\n") + "\n" });
      appCreated = true;
    } else {
    const appRoot = path.resolve(process.env.MORY_TEST_APP_ROOT || process.cwd());
    const appCommand = process.env.MORY_TEST_DEV === "true" ? [path.join(appRoot, "node_modules/next/dist/bin/next"), "dev"] : [path.join(appRoot, "scripts/start.mjs")];
    server = spawn(process.execPath, [...appCommand, "--hostname", "127.0.0.1", "--port", String(appPort)], { env: accountEnv, stdio: ["ignore", "pipe", "pipe"], cwd: appRoot });
    const record = (data) => { serverOutput = (serverOutput + scrub(data)).slice(-8000); };
    server.stdout.on("data", record); server.stderr.on("data", record);
    }
    let appReady = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(`${baseURL}/login`)).ok) { appReady = true; break; } } catch {}
      await delay(250);
    }
    if (!appReady) throw new Error(`Account test server did not start. ${serverOutput}`);
    await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.account.config.ts", ...(process.env.MORY_ACCOUNT_TEST_FILE ? [process.env.MORY_ACCOUNT_TEST_FILE] : []), "--output", path.join(os.tmpdir(), `mory-account-${randomUUID()}`)], { env: accountEnv, stream: true });
  }
} catch (error) {
  console.error(scrub(error.message));
  process.exitCode = 1;
} finally {
  if (reminderWorker) {
    reminderWorker.kill("SIGTERM");
    await new Promise((resolve) => { const timer = setTimeout(() => { reminderWorker.kill("SIGKILL"); resolve(); }, 5000); reminderWorker.once("exit", () => { clearTimeout(timer); resolve(); }); });
    console.log("Owned reminder worker stopped.");
  }
  if (mailWorker) {
    mailWorker.kill("SIGTERM");
    await new Promise((resolve) => { const timer = setTimeout(() => { mailWorker.kill("SIGKILL"); resolve(); }, 5000); mailWorker.once("exit", () => { clearTimeout(timer); resolve(); }); });
    console.log("Owned mail worker stopped.");
  }
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 5000);
      server.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    console.log("Owned account test server stopped.");
  }
  if (appCreated) { await run("docker", ["rm", "--force", appName]); console.log("Owned Docker account test server removed."); }
  if (mailCreated) { await run("docker", ["rm", "--force", mailName]); console.log("Disposable SMTP mailbox removed."); }
  if (mediaCreated) {
    await run("docker", ["rm", "--force", mediaName]);
    console.log("Disposable MinIO container removed.");
  }
  if (created) {
    await run("docker", ["rm", "--force", name]);
    console.log("Disposable PostgreSQL container removed.");
  }
  if (networkCreated) await run("docker", ["network", "rm", networkName]);
}
