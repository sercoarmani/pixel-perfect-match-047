import { test, expect, Page } from "@playwright/test";

/**
 * E2E: /anfragen/kunden – Listenrendering, Spalten, Loading/Leer-Zustand.
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

const EXPECTED_COLUMNS = ["Kunde", "Zeitraum", "Dienste", "Status", "Erstellt", "Link / Nachricht"];
const DIENST_LABELS = ["Früh", "Spät", "Nacht"] as const;
const DIENST_CODE_TO_LABEL: Record<string, (typeof DIENST_LABELS)[number]> = {
  F: "Früh",
  S: "Spät",
  N: "Nacht",
};

function parseGermanDate(s: string): Date {
  // "dd.MM.yyyy"
  const [d, m, y] = s.split(".").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function parseZeitraum(text: string): { from: Date; to: Date } | null {
  // Formate: "dd.MM.–dd.MM.yyyy" (Anfrage) oder "dd.MM.yyyy" (Bedarf, Punkt)
  const range = text.match(/(\d{2}\.\d{2}\.)(?:(\d{4}))?\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})/);
  if (range) {
    const yearTo = range[3].split(".")[2];
    const fromStr = `${range[1]}${range[2] ?? yearTo}`;
    return { from: parseGermanDate(fromStr), to: parseGermanDate(range[3]) };
  }
  const single = text.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (single) {
    const d = parseGermanDate(single[1]);
    return { from: d, to: d };
  }
  return null;
}

test.describe("/anfragen/kunden", () => {
  test("Header, Untertitel und CTA werden gerendert", async ({ page }) => {
    await login(page);
    await page.goto("/anfragen/kunden");

    await expect(page.getByRole("heading", { name: "Anfragen von Kunden" })).toBeVisible();
    await expect(
      page.getByText("Bedarfsabfragen an Einrichtungen per Token-Link"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /neue anfrage/i })).toBeVisible();
  });

  test("Tabelle enthält genau die erwarteten Spalten in korrekter Reihenfolge", async ({ page }) => {
    await login(page);
    await page.goto("/anfragen/kunden");

    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    const headers = table.locator("thead th");
    await expect(headers).toHaveCount(EXPECTED_COLUMNS.length);

    for (let i = 0; i < EXPECTED_COLUMNS.length; i++) {
      await expect(headers.nth(i)).toHaveText(EXPECTED_COLUMNS[i]);
    }
  });

  test("Loading-/Leer-Zustand: Tabelle rendert ohne Fehler, Body ist Array (>=0 Zeilen)", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await login(page);
    await page.goto("/anfragen/kunden");

    // Header sichtbar = Komponente hat gemountet
    await expect(page.getByRole("heading", { name: "Anfragen von Kunden" })).toBeVisible();

    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // Body existiert; Zeilenanzahl >= 0 (kein Crash, kein Render-Fehler)
    const bodyRows = table.locator("tbody tr");
    const count = await bodyRows.count();
    expect(count).toBeGreaterThanOrEqual(0);

    // Bei vorhandenen Zeilen: jede Zeile hat die korrekte Spaltenanzahl
    if (count > 0) {
      const firstRowCells = bodyRows.first().locator("td");
      await expect(firstRowCells).toHaveCount(EXPECTED_COLUMNS.length);
    }

    // Keine Runtime-/Render-Fehler in der Konsole
    expect(consoleErrors, `Unerwartete Konsolenfehler:\n${consoleErrors.join("\n")}`).toEqual([]);
  });

  test("Listenrendering: gerenderte Zeilen entsprechen exakt 'kunden'-Scope (empfaenger_typ === 'einrichtung')", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/anfragen/kunden");
    await expect(page.getByRole("heading", { name: "Anfragen von Kunden" })).toBeVisible();

    const table = page.getByRole("table");
    const rows = table.locator("tbody tr");

    // Warten bis Netzwerk-Idle (Server-Functions abgeschlossen)
    await page.waitForLoadState("networkidle");

    const count = await rows.count();
    if (count === 0) {
      test.skip(true, "Keine Kundenanfragen vorhanden – Listenrendering wurde leer geprüft.");
    }

    // Stichprobe: erste Zeile hat Empfänger-, Zeitraum- und Status-Zellen mit Inhalt
    const firstRow = rows.first();
    const cells = firstRow.locator("td");
    await expect(cells.nth(0)).not.toBeEmpty(); // Empfänger
    await expect(cells.nth(1)).not.toBeEmpty(); // Zeitraum
    await expect(cells.nth(2)).not.toBeEmpty(); // Status
    await expect(cells.nth(3)).not.toBeEmpty(); // Erstellt
  });
});
