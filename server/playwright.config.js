import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:8790",
    trace: "on-first-retry",
    headless: true,
  },
  webServer: {
    command: "node server.js",
    cwd: ".",
    url: "http://127.0.0.1:8790/api/process/ping",
    env: { PORT: "8790", PUBLIC_BASE_URL: "http://127.0.0.1:8790" },
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
