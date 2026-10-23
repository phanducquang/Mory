import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", fileParallelism: false, testTimeout: 20_000, hookTimeout: 30_000 },
});
