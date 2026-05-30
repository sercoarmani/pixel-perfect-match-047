import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright-Konfiguration für E2E-Tests gegen das Preview-Deployment.
 *
 * Konfigurierbar via Umgebungsvariablen:
 *   E2E_BASE_URL       – Basis-URL (Default: Preview-URL des Projekts)
 *   E2E_EMAIL          – Login-E-Mail
 *   E2E_PASSWORD       – Login-Passwort
 *
 * Lauf:
 *   E2E_EMAIL=... E2E_PASSWORD=... bunx playwright test
 *   bunx playwright install chromium   (einmalig)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://id-preview--0ceef16a-44ab-4863-91ea-da069df2e318.lovable.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
