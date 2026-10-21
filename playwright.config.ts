import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use a preinstalled Chromium when one is provided (CI / cloud sandboxes).
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/dev/cities`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
