import { test, expect, Page } from "@playwright/test";

/**
 * E2E: Auf /nachrichten (Mitarbeiterkontakt) muss jeder Anrufen-Button
 * einen gültigen tel:+…-Link enthalten, dessen Nummer mit der in den
 * Stammdaten angezeigten Telefonnummer übereinstimmt.
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

function normalize(p: string) {
  return p.replace(/[^\d+]/g, "");
}

test.describe("/nachrichten Anrufen-Button", () => {
  test("tel:-Link entspricht der Telefonnummer aus den Stammdaten", async ({ page }) => {
    await login(page);

    await page.goto("/nachrichten");
    await expect(page.getByRole("heading", { name: "Mitarbeiterkontakt" })).toBeVisible();

    // Warten bis die Liste gerendert ist
    const rows = page.locator('[class*="rounded-lg"][class*="border"][class*="bg-card"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    const count = await rows.count();
    let checked = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const anruf = row.getByRole("link", { name: /anrufen/i });
      if ((await anruf.count()) === 0) continue;

      const href = await anruf.first().getAttribute("href");
      expect(href, `Zeile ${i}: Anrufen-Link muss tel: verwenden`).toMatch(/^tel:\+?\d+/);

      // Im Listeneintrag wird die Telefonnummer als Text angezeigt
      const phoneText = await row.locator("text=/\\+?\\d[\\d\\s\\-()]+/").first().textContent();
      if (phoneText) {
        const expected = normalize(phoneText);
        const actual = href!.replace(/^tel:/, "");
        expect(
          actual,
          `Zeile ${i}: tel:-Nummer (${actual}) muss Stammdaten-Nummer (${expected}) entsprechen`,
        ).toBe(expected);
        checked++;
      }
    }

    // Mindestens ein Mitarbeiter mit Telefonnummer sollte verifiziert worden sein
    test.skip(checked === 0, "Kein Mitarbeiter mit Telefonnummer vorhanden – nichts zu prüfen.");
  });

  test("Anrufen-Button ohne Telefonnummer ist deaktiviert", async ({ page }) => {
    await login(page);

    await page.goto("/nachrichten");
    await expect(page.getByRole("heading", { name: "Mitarbeiterkontakt" })).toBeVisible();

    const rows = page.locator('[class*="rounded-lg"][class*="border"][class*="bg-card"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const link = row.getByRole("link", { name: /anrufen/i });
      if ((await link.count()) === 0) {
        // Fallback-Span (disabled state) – muss "Anrufen" als Text enthalten
        await expect(row.getByText(/anrufen/i)).toBeVisible();
      }
    }
  });

  test("Klick auf Anrufen löst Navigation zum tel:-Ziel aus", async ({ page }) => {
    await login(page);

    // Vor dem Laden der Seite: tel:-Navigation abfangen, damit der Browser
    // nicht versucht, einen externen Protokoll-Handler zu öffnen (Chromium
    // blockt das in Headless ohnehin). Wir merken uns das href stattdessen
    // auf window.__lastTelHref.
    await page.addInitScript(() => {
      (window as any).__lastTelHref = null;
      document.addEventListener(
        "click",
        (e) => {
          const a = (e.target as HTMLElement | null)?.closest?.("a");
          const href = a?.getAttribute("href") ?? "";
          if (href.startsWith("tel:")) {
            (window as any).__lastTelHref = href;
            e.preventDefault();
          }
        },
        true,
      );
    });

    await page.goto("/nachrichten");
    await expect(page.getByRole("heading", { name: "Mitarbeiterkontakt" })).toBeVisible();

    const rows = page.locator('[class*="rounded-lg"][class*="border"][class*="bg-card"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // Ersten Mitarbeiter mit aktivem Anrufen-Link finden
    const count = await rows.count();
    let targetHref: string | null = null;
    for (let i = 0; i < count; i++) {
      const link = rows.nth(i).getByRole("link", { name: /anrufen/i });
      if ((await link.count()) === 0) continue;

      targetHref = await link.first().getAttribute("href");
      await link.first().click();
      break;
    }

    test.skip(!targetHref, "Kein Mitarbeiter mit Telefonnummer – Klick-Test übersprungen.");

    // Pfad innerhalb der App darf sich nicht geändert haben (tel: ist external)
    await expect(page).toHaveURL(/\/nachrichten$/);

    // Capture-Handler muss das tel:-Ziel registriert haben
    const captured = await page.evaluate(() => (window as any).__lastTelHref as string | null);
    expect(captured).toBe(targetHref);
    expect(captured).toMatch(/^tel:\+?\d+/);
  });
});
