/**
 * Szenario-Test: Doppelte MA-Zusage / doppelte Dispo-Zuteilung dürfen nur EINEN
 * Kundenbestätigungs-Entwurf und nur EINE Versandkette (E-Mail + Telegram)
 * erzeugen — auch unter ECHTER Parallelität (Promise.all).
 *
 * Lauf:  bun test scripts/scenario-bestaetigung-dedupe.test.ts
 *
 * Wir mocken supabaseAdmin / Telegram / versand-log per `mock.module` und
 * exerzieren die echten Helper aus src/lib/kunden-bestaetigung.server.ts.
 *
 * Der Fake-Supabase simuliert den partiellen UNIQUE-Index
 * (mitarbeiter_id, einrichtung_id, COALESCE(bedarf_id, NULL_UUID))
 * WHERE status IN ('entwurf','gesendet') und gibt bei Verletzung
 * { error: { code: '23505' } } zurück.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// ----------------- In-Memory-Fakes -----------------

type Row = Record<string, any>;
const NULL_UUID = "00000000-0000-0000-0000-000000000000";

const tables: Record<string, Row[]> = {
  mitarbeiter: [],
  einrichtungen: [],
  mitarbeiter_dokumente: [],
  kunden_bestaetigungen: [],
  einsaetze: [],
  email_send_log: [],
};
const rpcCalls: Array<{ name: string; payload: any }> = [];
const tgMessages: Array<{ chatId: number; text: string }> = [];
const tgDocs: Array<{ chatId: number; doc: string }> = [];
const versandLogs: Row[] = [];

function reset() {
  for (const k of Object.keys(tables)) tables[k] = [];
  rpcCalls.length = 0;
  tgMessages.length = 0;
  tgDocs.length = 0;
  versandLogs.length = 0;
}

// Partielle UNIQUE-Constraints pro Tabelle.
// Key wird aus angegebenen Spalten gebaut; Predicate sagt, ob die Row indiziert ist.
type UniqueConstraint = {
  key: (r: Row) => string;
  active: (r: Row) => boolean;
};
const constraints: Record<string, UniqueConstraint[]> = {
  kunden_bestaetigungen: [
    {
      key: (r) =>
        `${r.mitarbeiter_id}|${r.einrichtung_id}|${r.bedarf_id ?? NULL_UUID}`,
      active: (r) => r.status === "entwurf" || r.status === "gesendet",
    },
  ],
};

function violatesUnique(table: string, row: Row, ignoreId?: string): boolean {
  const cs = constraints[table];
  if (!cs) return false;
  const rows = tables[table] ?? [];
  for (const c of cs) {
    if (!c.active(row)) continue;
    const k = c.key(row);
    for (const r of rows) {
      if (r.id === ignoreId) continue;
      if (c.active(r) && c.key(r) === k) return true;
    }
  }
  return false;
}

// Chainable Query Builder (minimaler Mini-PostgREST)
class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private _limit: number | null = null;
  private _isInsert: Row | Row[] | null = null;
  private _isUpdate: Row | null = null;
  private _selectAfterInsert = false;
  constructor(private tableName: string) {}
  private rows(): Row[] {
    return tables[this.tableName] ?? (tables[this.tableName] = []);
  }
  select(_cols?: string) {
    this._selectAfterInsert = true;
    return this;
  }
  insert(row: Row | Row[]) {
    this._isInsert = row;
    return this;
  }
  update(patch: Row) {
    this._isUpdate = patch;
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  limit(n: number) {
    this._limit = n;
    return this;
  }
  private apply(): Row[] {
    let out = this.rows().filter((r) => this.filters.every((f) => f(r)));
    if (this._limit != null) out = out.slice(0, this._limit);
    return out;
  }
  async maybeSingle() {
    const res = await this.run();
    if (res.error) return res;
    return { data: res.data?.[0] ?? null, error: null };
  }
  async single() {
    const res = await this.run();
    if (res.error) return res;
    if (!res.data?.length) return { data: null, error: { message: "no rows" } };
    return { data: res.data[0], error: null };
  }
  then(onF: any, onR?: any) {
    return this.run().then(onF, onR);
  }
  private async run(): Promise<{ data: Row[] | null; error: any }> {
    // Mikro-Yield, damit Promise.all echte Interleaving-Reihenfolge erzeugt
    await Promise.resolve();
    if (this._isInsert) {
      const incoming = Array.isArray(this._isInsert) ? this._isInsert : [this._isInsert];
      const inserted: Row[] = [];
      for (const r of incoming) {
        const row = { id: crypto.randomUUID(), ...r };
        if (violatesUnique(this.tableName, row)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        this.rows().push(row);
        inserted.push(row);
      }
      return { data: this._selectAfterInsert ? inserted : null, error: null };
    }
    if (this._isUpdate) {
      const matched = this.apply();
      // Update atomar: Constraint-Check pro Row
      for (const r of matched) {
        const candidate = { ...r, ...this._isUpdate };
        if (violatesUnique(this.tableName, candidate, r.id)) {
          return { data: null, error: { code: "23505", message: "duplicate key on update" } };
        }
      }
      matched.forEach((r) => Object.assign(r, this._isUpdate));
      return { data: matched, error: null };
    }
    return { data: this.apply(), error: null };
  }
}

const fakeSupabaseAdmin = {
  from: (table: string) => new Query(table),
  rpc: async (name: string, payload: any) => {
    rpcCalls.push({ name, payload });
    return { data: 1, error: null };
  },
  storage: {
    from: (_bucket: string) => ({
      createSignedUrl: async (path: string) =>
        ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
    }),
  },
};

// ----------------- Modul-Mocks (vor Import des SUT) -----------------

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: fakeSupabaseAdmin,
}));
mock.module("@/lib/telegram.server", () => ({
  tgSendMessage: async (chatId: number, text: string) => {
    tgMessages.push({ chatId, text });
    return { ok: true };
  },
}));
mock.module("@/lib/versand-log.server", () => ({
  logVersand: async (entry: Row) => {
    versandLogs.push(entry);
  },
}));

// fetch (Telegram sendDocument) mocken
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).includes("/telegram/sendDocument")) {
    const body = JSON.parse(init?.body ?? "{}");
    tgDocs.push({ chatId: body.chat_id, doc: body.document });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return originalFetch(url, init);
}) as typeof fetch;

// Erst NACH den Mocks importieren
const { createKundenbestaetigungDraft, sendKundenbestaetigung } = await import(
  "../src/lib/kunden-bestaetigung.server"
);

// ----------------- Seed-Helfer -----------------

const MA_ID = "11111111-1111-1111-1111-111111111111";
const EIN_ID = "22222222-2222-2222-2222-222222222222";
const BEDARF_ID = "33333333-3333-3333-3333-333333333333";

function seed() {
  tables.mitarbeiter.push({
    id: MA_ID,
    vorname: "Max",
    nachname: "Muster",
    qualifikation: "PFK",
    telegram_chat_id: 999_000,
  });
  tables.einrichtungen.push({
    id: EIN_ID,
    name: "Pflegeheim Sonnenhof",
    ort: "Berlin",
    kontakt_name: "Frau Schmitt",
    kontakt_email: "kontakt@sonnenhof.example",
  });
  tables.mitarbeiter_dokumente.push({
    id: crypto.randomUUID(),
    mitarbeiter_id: MA_ID,
    dateiname: "examen.pdf",
    datei_path: `${MA_ID}/examen.pdf`,
    typ: "examen",
    mime_type: "application/pdf",
    groesse_bytes: 12345,
    weitergabe_erlaubt: true,
  });
}

// ----------------- Szenarien -----------------

describe("Block 5/6 Auto-Trigger – Idempotenz unter Parallelität", () => {
  beforeEach(() => {
    reset();
    seed();
  });

  it("doppelte BESTAETIGT-Updates (sequentiell) erzeugen nur EINEN Entwurf", async () => {
    const input = {
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      bedarf_id: BEDARF_ID,
      einsatz_id: "einsatz-1",
      datum: "2026-06-01",
      dienst: "F",
    };
    const a = await createKundenbestaetigungDraft(input);
    const b = await createKundenbestaetigungDraft(input);
    const c = await createKundenbestaetigungDraft(input);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(tables.kunden_bestaetigungen).toHaveLength(1);
  });

  it("PARALLEL: 5× createDraft via Promise.all erzeugt genau EINEN Entwurf", async () => {
    // Echte Race-Bedingung: alle 5 lesen "nicht vorhanden", versuchen INSERT,
    // genau 1 gewinnt den UNIQUE-Index, die anderen 4 fangen 23505 ab und
    // geben die existierende ID zurück.
    const input = {
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      bedarf_id: BEDARF_ID,
      einsatz_id: "einsatz-race",
      datum: "2026-06-04",
      dienst: "F",
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createKundenbestaetigungDraft(input)),
    );
    const ids = new Set(results);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(ids.size).toBe(1);
    expect(tables.kunden_bestaetigungen).toHaveLength(1);
  });

  it("PARALLEL ohne bedarf_id: NULL-Fall ist ebenfalls eindeutig", async () => {
    const input = {
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      einsatz_id: "einsatz-null",
      datum: "2026-06-05",
      dienst: "S",
    };
    const results = await Promise.all([
      createKundenbestaetigungDraft(input),
      createKundenbestaetigungDraft(input),
      createKundenbestaetigungDraft(input),
    ]);
    expect(new Set(results).size).toBe(1);
    expect(tables.kunden_bestaetigungen).toHaveLength(1);
  });

  it("PARALLEL: Telegram-Zusage + Dispo-Klick gleichzeitig → EIN Entwurf", async () => {
    // Simuliert den realen Worst-Case: MA tippt JA im Telegram, Disponent
    // klickt im selben Moment "Zuteilen" — beide Trigger feuern parallel.
    const fromTelegram = createKundenbestaetigungDraft({
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      bedarf_id: BEDARF_ID,
      einsatz_id: "einsatz-mix",
      datum: "2026-06-06",
      dienst: "N",
    });
    const fromDispo = createKundenbestaetigungDraft({
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      bedarf_id: BEDARF_ID,
      einsatz_id: "einsatz-mix",
      datum: "2026-06-06",
      dienst: "N",
    });
    const [a, b] = await Promise.all([fromTelegram, fromDispo]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(tables.kunden_bestaetigungen).toHaveLength(1);
  });

  it("sendKundenbestaetigung mehrfach (sequentiell) → nur EINE Versandkette", async () => {
    const draftId = await createKundenbestaetigungDraft({
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      bedarf_id: BEDARF_ID,
      einsatz_id: "einsatz-3",
      datum: "2026-06-03",
      dienst: "N",
    });
    expect(draftId).not.toBeNull();
    tables.einsaetze.push({ id: "einsatz-3", datum: "2026-06-03", dienst: "N" });

    const s1 = await sendKundenbestaetigung(draftId!, null);
    const s2 = await sendKundenbestaetigung(draftId!, null);
    const s3 = await sendKundenbestaetigung(draftId!, null);

    expect(s1.email_status).toBe("queued");
    expect(s2.email_status).toBe("skipped");
    expect(s3.email_status).toBe("skipped");

    expect(rpcCalls.filter((c) => c.name === "enqueue_email")).toHaveLength(1);
    expect(tables.email_send_log).toHaveLength(1);
    expect(tgMessages).toHaveLength(1);
    expect(tgDocs).toHaveLength(1);
    expect(versandLogs.filter((v) => v.kanal === "email")).toHaveLength(1);
    expect(versandLogs.filter((v) => v.kanal === "telegram")).toHaveLength(1);
    expect(tables.kunden_bestaetigungen[0].status).toBe("gesendet");
  });

  it("PARALLEL: 4× sendKundenbestaetigung gleichzeitig → genau EINE Versandkette", async () => {
    const draftId = await createKundenbestaetigungDraft({
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      bedarf_id: BEDARF_ID,
      einsatz_id: "einsatz-send-race",
      datum: "2026-06-07",
      dienst: "F",
    });
    expect(draftId).not.toBeNull();
    tables.einsaetze.push({ id: "einsatz-send-race", datum: "2026-06-07", dienst: "F" });

    // Echte Parallelität: alle 4 lesen Status="entwurf", aber nur EIN atomarer
    // Claim-UPDATE (status='entwurf' AND ma_unterlagen_status='pending') matcht.
    const results = await Promise.all([
      sendKundenbestaetigung(draftId!, null),
      sendKundenbestaetigung(draftId!, null),
      sendKundenbestaetigung(draftId!, null),
      sendKundenbestaetigung(draftId!, null),
    ]);

    const queued = results.filter((r) => r.email_status === "queued");
    const skipped = results.filter((r) => r.email_status === "skipped");
    expect(queued).toHaveLength(1);
    expect(skipped).toHaveLength(3);

    // Versandseiteneffekte: exakt 1× je Kanal
    expect(rpcCalls.filter((c) => c.name === "enqueue_email")).toHaveLength(1);
    expect(tables.email_send_log).toHaveLength(1);
    expect(tgMessages).toHaveLength(1);
    expect(tgDocs).toHaveLength(1);
    expect(versandLogs.filter((v) => v.kanal === "email")).toHaveLength(1);
    expect(versandLogs.filter((v) => v.kanal === "telegram")).toHaveLength(1);
    expect(tables.kunden_bestaetigungen[0].status).toBe("gesendet");
  });
});
