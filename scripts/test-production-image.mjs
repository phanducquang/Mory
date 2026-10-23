import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
const image = process.argv[2] ?? "mory:check";
const name = `mory-production-test-${randomUUID()}`;
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
  let output = "";
  child.stdout.on("data", (data) => { output += data; if (options.stream) process.stdout.write(data); });
  child.stderr.on("data", (data) => { output += data; if (options.stream) process.stderr.write(data); });
  child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(options.stream ? `${command} exited ${code}` : output)));
});
let created = false;
try {
  await run("docker", ["run", "--detach", "--rm", "--name", name, "--label", "app=mory-integration-test", "--publish", "127.0.0.1::3000", "--env", "MORY_DATA_MODE=demo", "--env", "MORY_MEDIA_ENABLED=false", image]); created = true;
  const binding = await run("docker", ["port", name, "3000/tcp"]);
  const port = Number(binding.match(/127\.0\.0\.1:(\d+)/)?.[1]); if (!port) throw new Error("No localhost binding.");
  const baseURL = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`${baseURL}/home`)).ok) { ready = true; break; } } catch {}
    await delay(250);
  }
  if (!ready) throw new Error("Demo production image did not start.");
  if (await run("docker", ["exec", name, "id", "-u"]) !== "1001") throw new Error("Expected UID 1001.");
  for (const url of ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/sw.js", "/offline.html"]) {
    if (!(await fetch(`${baseURL}${url}`)).ok) throw new Error(`Missing public asset ${url}`);
  }
  if ((await fetch(`${baseURL}/api/auth/get-session`)).status !== 503) throw new Error("Auth must be off in demo.");
  if ((await fetch(`${baseURL}/api/media/${randomUUID()}`)).status !== 404) throw new Error("Media must be off in demo.");
  console.log("Docker standalone smoke passed (public assets, disabled auth/media, UID 1001).");
  await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3), "--output", path.join(os.tmpdir(), `mory-demo-${randomUUID()}`)], {
    stream: true, env: { ...process.env, PLAYWRIGHT_BASE_URL: baseURL, PLAYWRIGHT_PRODUCTION: "1" } });
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (created) { await run("docker", ["rm", "--force", name]); console.log("Owned demo production container removed."); } }
