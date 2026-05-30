import { test, expect, Page } from "@playwright/test";

/**
 * E2E: Sidebar-Umbenennung "Einrichtungen" → "Kunden" (Stammdaten)
 * und "Kundenbestätigungen" → "Kundenkontakt" (Kontakt).
 *
 * Prüft, dass die neuen Labels existieren, die alten weg sind,
 * und dass Klicks die jeweiligen Routen ansteuern.
 */

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

async function login(page: Page) {
  if (!EMAIL || !PASSWORD) {
    test.skip(true, "E2E_EMAIL / E2E_PASSWORD nicht gesetzt – Test übersprungen.");
  }
  await page.goto("/login");
  await page.getByLabel("E-Mail").first().fill(EMAIL!);
  await page.getByLabel("Passwort").first().fill(PASSWORD!);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

test.describe("Sidebar: Kunden / Kundenkontakt", () => {
  test("Sidebar-Link 'Kunden' navigiert zu /einrichtungen", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");

    const sidebar = page.locator("nav, aside").first();
    const kundenLink = sidebar.getByRole("link", { name: /^Kunden$/ });
    await expect(kundenLink).toBeVisible();

    // Altes Label darf nicht mehr im Stammdaten-Bereich auftauchen
    await expect(sidebar.getByRole("link", { name: /^Einrichtungen$/ })).toHaveCount(0);

    await kundenLink.click();
    await expect(page).toHaveURL(/\/einrichtungen(\?|$)/);
  });

  test("Sidebar-Link 'Kundenkontakt' navigiert zu /bestaetigungen", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");

    const sidebar = page.locator("nav, aside").first();
    const link = sidebar.getByRole("link", { name: /^Kundenkontakt$/ });
    await expect(link).toBeVisible();

    // Alte Bezeichnung im Sidebar-Eintrag entfernt
    await expect(sidebar.getByRole("link", { name: /^Kundenbestätigungen$/ })).toHaveCount(0);

    await link.click();
    await expect(page).toHaveURL(/\/bestaetigungen(\?|$)/);
  });

  test("Gruppen-Label 'Kontakt' ersetzt 'Kommunikation'", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");

    const sidebar = page.locator("nav, aside").first();
    await expect(sidebar.getByText(/^Kontakt$/)).toBeVisible();
    await expect(sidebar.getByText(/^Kommunikation$/)).toHaveCount(0);
  });
});
