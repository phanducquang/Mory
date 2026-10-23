import { defineConfig } from "prisma/config";
// Do not require database credentials for client generation or the browser demo.
// Existing process env takes precedence over local files; no values are logged.
for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
