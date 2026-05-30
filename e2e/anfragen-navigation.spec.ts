import { test, expect, Page } from "@playwright/test";

/**
 * E2E-Regression: Navigation innerhalb von /anfragen muss im echten Browser
 * den jeweiligen Outlet-Inhalt anzeigen (Kunden ↔ Mitarbeiter).
 *
 * Benötigt Login-Credentials via E2E_EMAIL / E2E_PASSWORD.
 */

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

async function login(page: Page) {
  if (!EMAIL || !PASSWORD) {
    test.skip(true, "E2E_EMAIL / E2E_PASSWORD nicht gesetzt – Login-Test übersprungen.");
  }
  await page.goto("/login");
  await page.getByLabel("E-Mail").first().fill(EMAIL!);
  await page.getByLabel("Passwort").first().fill(PASSWORD!);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

test.describe("/anfragen Outlet-Navigation", () => {
  test("Kunden ↔ Mitarbeiter zeigt jeweils den richtigen Inhalt", async ({ page }) => {
    await login(page);

    // Direkt zu /anfragen/kunden
    await page.goto("/anfragen/kunden");
    await expect(page).toHaveURL(/\/anfragen\/kunden$/);
    await expect(page.getByRole("heading", { name: "Anfragen von Kunden" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verfügbarkeiten der Mitarbeiter" })).toHaveCount(0);

    // Wechsel zu /anfragen/mitarbeiter
    await page.goto("/anfragen/mitarbeiter");
    await expect(page).toHaveURL(/\/anfragen\/mitarbeiter$/);
    await expect(page.getByRole("heading", { name: "Verfügbarkeiten der Mitarbeiter" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anfragen von Kunden" })).toHaveCount(0);

    // Zurück zu Kunden – Outlet darf nicht leer bleiben
    await page.goto("/anfragen/kunden");
    await expect(page.getByRole("heading", { name: "Anfragen von Kunden" })).toBeVisible();

    // Root-Pfad /anfragen muss auf /anfragen/kunden redirecten
    await page.goto("/anfragen");
    await expect(page).toHaveURL(/\/anfragen\/kunden$/);
    await expect(page.getByRole("heading", { name: "Anfragen von Kunden" })).toBeVisible();
  });
});
