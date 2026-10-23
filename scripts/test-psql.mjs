#!/usr/bin/env node
import { spawn } from "node:child_process";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker" || !/^mory-test-[a-f0-9-]{36}$/.test(process.env.MORY_BACKUP_TEST_CONTAINER ?? "") || !/^mory_[a-z0-9_]+$/.test(process.env.PGDATABASE ?? "")) process.exit(2);
const tool = process.argv[1].endsWith("test-psql.mjs") ? "psql" : "pg_dump";
const child = spawn("docker", ["exec", "-i", process.env.MORY_BACKUP_TEST_CONTAINER, tool, "-U", "mory_test", "-d", process.env.PGDATABASE, ...process.argv.slice(2)], { stdio: "inherit" });
process.on("SIGTERM", () => child.kill("SIGTERM")); child.on("error", () => process.exit(1)); child.on("close", (code) => process.exit(code ?? 1));
