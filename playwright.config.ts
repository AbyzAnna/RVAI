import { defineConfig, devices } from "@playwright/test";

// Browser end-to-end tests for the web app at /ui/. Two local servers: one with the AI key from .env
// (port 3101) and one with no key at all (port 3102), so the no-key path is tested too.
// E2E_BASE_URL points the keyed tests at a deployed site instead (e.g. a Vercel URL).
const KEY_PORT = 3101;
const NOKEY_PORT = 3102;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 150_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${KEY_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: "npm run web", env: { PORT: String(KEY_PORT) }, url: `http://localhost:${KEY_PORT}/api/health`, reuseExistingServer: true },
        {
          command: "npm run web",
          env: { PORT: String(NOKEY_PORT), OPENROUTER_API_KEY: "", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "" },
          url: `http://localhost:${NOKEY_PORT}/api/health`,
          reuseExistingServer: true,
        },
      ],
});

export const NOKEY_URL = `http://localhost:${NOKEY_PORT}`;
