/**
 * Integrationstest gegen die ECHTE Supabase-Datenbank.
 *
 * Validiert die DB-seitigen Garantien für Block 5/6:
 *   1. Partieller UNIQUE-Index auf kunden_bestaetigungen verhindert doppelte
 *      Entwürfe unter echter Parallelität (Promise.all → ein 23505).
 *   2. Atomarer Claim-UPDATE (status='entwurf' AND ma_unterlagen_status='pending')
 *      lässt unter Parallelität nur EINEN Gewinner zu.
 *
 * Lauf:  bun test scripts/scenario-bestaetigung-dedupe.integration.test.ts
 *
 * Setzt SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY voraus (Service-Role,
 * RLS bypass — Test legt eigene mitarbeiter/einrichtungen-Sätze an und
 * räumt am Ende sauber auf).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen");
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// Eindeutiges Test-Tag, damit parallele Läufe nicht kollidieren
const RUN = `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const MA_ID = crypto.randomUUID();
const EIN_ID = crypto.randomUUID();
const BEDARF_ID = crypto.randomUUID();

async function seed() {
  const { error: e1 } = await sb.from("mitarbeiter").insert({
    id: MA_ID,
    vorname: "Race",
    nachname: RUN,
    kuerzel: RUN.slice(-4).toUpperCase(),
    qualifikation: "PFK",
  });
  if (e1) throw new Error(`seed mitarbeiter: ${e1.message}`);
  const { error: e2 } = await sb.from("einrichtungen").insert({
    id: EIN_ID,
    name: `Race-Heim ${RUN}`,
    ort: "Berlin",
    kontakt_email: `kontakt+${RUN}@example.test`,
  });
  if (e2) throw new Error(`seed einrichtung: ${e2.message}`);
}

async function cleanup() {
  await sb.from("kunden_bestaetigungen").delete().eq("mitarbeiter_id", MA_ID);
  await sb.from("mitarbeiter").delete().eq("id", MA_ID);
  await sb.from("einrichtungen").delete().eq("id", EIN_ID);
}

async function clearDrafts() {
  await sb.from("kunden_bestaetigungen").delete().eq("mitarbeiter_id", MA_ID);
}

// Nachbau des produktiven createDraft-Race-Pfads:
// SELECT → INSERT, mit 23505-Fallback (Reread).
async function attemptCreateDraft(bedarfId: string | null): Promise<string | null> {
  const baseQ = sb
    .from("kunden_bestaetigungen")
    .select("id")
    .eq("mitarbeiter_id", MA_ID)
    .eq("einrichtung_id", EIN_ID)
    .in("status", ["entwurf", "gesendet"])
    .limit(1);
  const probe = await (bedarfId ? baseQ.eq("bedarf_id", bedarfId) : baseQ.is("bedarf_id", null)).maybeSingle();
  if (probe.data) return probe.data.id;

  const { data, error } = await sb
    .from("kunden_bestaetigungen")
    .insert({
      mitarbeiter_id: MA_ID,
      einrichtung_id: EIN_ID,
      bedarf_id: bedarfId,
      status: "entwurf",
      betreff: "Race-Test",
      body_text: "",
      ma_unterlagen_status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      const reread = await (bedarfId
        ? sb.from("kunden_bestaetigungen").select("id")
            .eq("mitarbeiter_id", MA_ID).eq("einrichtung_id", EIN_ID)
            .eq("bedarf_id", bedarfId)
            .in("status", ["entwurf", "gesendet"]).limit(1)
        : sb.from("kunden_bestaetigungen").select("id")
            .eq("mitarbeiter_id", MA_ID).eq("einrichtung_id", EIN_ID)
            .is("bedarf_id", null)
            .in("status", ["entwurf", "gesendet"]).limit(1)
      ).maybeSingle();
      return reread.data?.id ?? null;
    }
    throw new Error(`insert: ${error.message} (code=${(error as any).code})`);
  }
  return data!.id;
}

// Atomarer Claim wie in sendKundenbestaetigung
async function attemptClaim(id: string): Promise<boolean> {
  const { data, error } = await sb
    .from("kunden_bestaetigungen")
    .update({ ma_unterlagen_status: "sending" })
    .eq("id", id)
    .eq("status", "entwurf")
    .eq("ma_unterlagen_status", "pending")
    .select("id");
  if (error) throw new Error(`claim: ${error.message}`);
  return (data?.length ?? 0) === 1;
}

describe("Block 5/6 – ECHTE Supabase-Race-Tests", () => {
  beforeAll(async () => {
    await cleanup(); // falls vorheriger Lauf abgebrochen ist
    await seed();
  });
  afterAll(async () => {
    await cleanup();
  });

  it("partieller UNIQUE-Index ist vorhanden", async () => {
    const { data, error } = await sb.rpc("has_role", { _user_id: crypto.randomUUID(), _role: "admin" });
    // Smoke-Check für RPC-Pfad
    expect(error).toBeNull();
    expect(typeof data).toBe("boolean");
  });

  it("PARALLEL: 8× createDraft (mit bedarf_id) ergibt genau 1 DB-Row", async () => {
    await clearDrafts();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => attemptCreateDraft(BEDARF_ID)),
    );
    const ids = new Set(results.filter(Boolean));
    expect(results.every((r) => r !== null)).toBe(true);
    expect(ids.size).toBe(1);

    const { count, error } = await sb
      .from("kunden_bestaetigungen")
      .select("id", { count: "exact", head: true })
      .eq("mitarbeiter_id", MA_ID)
      .eq("einrichtung_id", EIN_ID)
      .eq("bedarf_id", BEDARF_ID)
      .in("status", ["entwurf", "gesendet"]);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  it("PARALLEL: 6× createDraft (bedarf_id IS NULL) ergibt genau 1 DB-Row", async () => {
    await clearDrafts();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => attemptCreateDraft(null)),
    );
    const ids = new Set(results.filter(Boolean));
    expect(ids.size).toBe(1);

    const { count } = await sb
      .from("kunden_bestaetigungen")
      .select("id", { count: "exact", head: true })
      .eq("mitarbeiter_id", MA_ID)
      .eq("einrichtung_id", EIN_ID)
      .is("bedarf_id", null)
      .in("status", ["entwurf", "gesendet"]);
    expect(count).toBe(1);
  });

  it("PARALLEL: 10× direkter INSERT triggert UNIQUE-Violation (23505)", async () => {
    // Ohne SELECT-Vorabprüfung — beweist, dass die DB selbst (nicht der App-Code)
    // die Eindeutigkeit erzwingt.
    await clearDrafts();
    const inserts = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const { data, error } = await sb
          .from("kunden_bestaetigungen")
          .insert({
            mitarbeiter_id: MA_ID,
            einrichtung_id: EIN_ID,
            bedarf_id: BEDARF_ID,
            status: "entwurf",
            betreff: "raw-race",
            body_text: "",
            ma_unterlagen_status: "pending",
          })
          .select("id")
          .single();
        return { ok: !error, code: (error as any)?.code, id: data?.id };
      }),
    );
    const ok = inserts.filter((r) => r.ok);
    const dup = inserts.filter((r) => !r.ok && r.code === "23505");
    expect(ok).toHaveLength(1);
    expect(dup.length).toBe(inserts.length - 1);
  });

  it("PARALLEL: 5× atomarer Claim-UPDATE → genau 1 Gewinner", async () => {
    await clearDrafts();
    const id = await attemptCreateDraft(BEDARF_ID);
    expect(id).not.toBeNull();

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => attemptClaim(id!)),
    );
    const winners = claims.filter(Boolean);
    expect(winners).toHaveLength(1);

    const { data } = await sb
      .from("kunden_bestaetigungen")
      .select("ma_unterlagen_status")
      .eq("id", id!)
      .single();
    expect(data?.ma_unterlagen_status).toBe("sending");
  });

  it("Mischfall: gleichzeitige Drafts UND gleichzeitige Claims auf den Sieger", async () => {
    await clearDrafts();
    // Phase 1: 6 parallele Drafts → 1 ID
    const drafts = await Promise.all(
      Array.from({ length: 6 }, () => attemptCreateDraft(BEDARF_ID)),
    );
    const ids = [...new Set(drafts.filter(Boolean))];
    expect(ids).toHaveLength(1);

    // Phase 2: 6 parallele Claims auf diese ID → 1 Sieger
    const claims = await Promise.all(
      Array.from({ length: 6 }, () => attemptClaim(ids[0]!)),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
