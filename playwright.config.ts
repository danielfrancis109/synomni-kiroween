import { defineConfig, devices } from "@playwright/test";
import os from "os";
import path from "path";

// Allow overriding the port via env so CI can pick a free one.
const PORT = process.env.TEST_PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

// When E2E_BASE_URL is provided, we target an already-running server.
const externalBaseUrl = process.env.E2E_BASE_URL;

// Hosted-demo project runs on a separate port.
const HOSTED_PORT = process.env.TEST_HOSTED_PORT ?? "3002";
const HOSTED_BASE_URL = `http://localhost:${HOSTED_PORT}`;

// Shared temp dir for hosted-demo session files.
const HOSTED_MEMORY_DIR = path.join(os.tmpdir(), "synomni-hosted-e2e-sessions");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  projects: [
    {
      name: "chromium",
      testMatch: "**/smoke.test.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: externalBaseUrl ?? BASE_URL,
      },
    },
    {
      name: "hosted-demo",
      testMatch: "**/hosted-demo.test.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: HOSTED_BASE_URL,
      },
    },
  ],
  webServer: externalBaseUrl
    ? [] // Skip launching a server when targeting a live URL.
    : [
        {
          command: `next dev -p ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          // Use next start (production build) for the hosted-demo instance so
          // two dev servers don't conflict (Next.js 16 locks the dev server
          // to one instance per project directory).
          // Run `npm run build` before `npm run test:e2e` when using hosted tests.
          command: `next start -p ${HOSTED_PORT}`,
          url: HOSTED_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            HOSTED_DEMO: "true",
            MEMORY_DIR: HOSTED_MEMORY_DIR,
          },
        },
      ],
});
