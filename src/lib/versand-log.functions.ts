import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProtokollEintrag = {
  id: string;
  quelle: "versand" | "email_out" | "email_in";
  created_at: string;
  kanal: string;
  richtung: "out" | "in";
  status: string;
  empfaenger: string | null;
  absender: string | null;
  betreff: string | null;
  inhalt: string | null;
  mitarbeiter_id: string | null;
  einrichtung_id: string | null;
  fehler: string | null;
  metadata: Record<string, unknown>;
};

export const listProtokoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    kanal?: string;
    richtung?: "out" | "in" | "all";
    status?: string;
    suche?: string;
    limit?: number;
  }) =>
    z.object({
      kanal: z.string().optional(),
      richtung: z.enum(["out", "in", "all"]).optional(),
      status: z.string().optional(),
      suche: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const limit = data.limit ?? 200;

    // versand_log
    let vq = supabase
      .from("versand_log")
      .select(
        "id, created_at, kanal, richtung, status, empfaenger, absender, betreff, inhalt, mitarbeiter_id, einrichtung_id, fehler, metadata",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.kanal && data.kanal !== "all") vq = vq.eq("kanal", data.kanal as any);
    if (data.richtung && data.richtung !== "all") vq = vq.eq("richtung", data.richtung);
    if (data.status && data.status !== "all") vq = vq.eq("status", data.status as any);
    const { data: vRows } = await vq;

    // email_send_log (out, dedupliziert per message_id)
    const { data: emailOut } = await supabase
      .from("email_send_log")
      .select("id, created_at, message_id, template_name, recipient_email, status, error_message, metadata")
      .order("created_at", { ascending: false })
      .limit(limit);
    const seen = new Set<string>();
    const emailOutDedup = (emailOut ?? []).filter((r: any) => {
      const k = r.message_id ?? r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // email_inbox (in)
    const { data: emailIn } = await supabase
      .from("email_inbox")
      .select(
        "id, empfangen_am, von_email, von_name, an_email, betreff, ai_zusammenfassung, status, zugeordnet_mitarbeiter_id, zugeordnet_einrichtung_id, ai_kategorie",
      )
      .order("empfangen_am", { ascending: false })
      .limit(limit);

    const eintraege: ProtokollEintrag[] = [];

    for (const r of vRows ?? []) {
      eintraege.push({
        id: `v:${r.id}`,
        quelle: "versand",
        created_at: r.created_at,
        kanal: r.kanal,
        richtung: r.richtung,
        status: r.status,
        empfaenger: r.empfaenger,
        absender: r.absender,
        betreff: r.betreff,
        inhalt: r.inhalt,
        mitarbeiter_id: r.mitarbeiter_id,
        einrichtung_id: r.einrichtung_id,
        fehler: r.fehler,
        metadata: (r.metadata as any) ?? {},
      });
    }

    if (!data.kanal || data.kanal === "all" || data.kanal === "email") {
      if (!data.richtung || data.richtung === "all" || data.richtung === "out") {
        for (const r of emailOutDedup) {
          eintraege.push({
            id: `eo:${r.id}`,
            quelle: "email_out",
            created_at: r.created_at,
            kanal: "email",
            richtung: "out",
            status: r.status,
            empfaenger: r.recipient_email,
            absender: null,
            betreff: r.template_name,
            inhalt: null,
            mitarbeiter_id: null,
            einrichtung_id: null,
            fehler: r.error_message ?? null,
            metadata: (r.metadata as any) ?? {},
          });
        }
      }
      if (!data.richtung || data.richtung === "all" || data.richtung === "in") {
        for (const r of emailIn ?? []) {
          eintraege.push({
            id: `ei:${r.id}`,
            quelle: "email_in",
            created_at: r.empfangen_am,
            kanal: "email",
            richtung: "in",
            status: r.status,
            empfaenger: r.an_email,
            absender: r.von_name ? `${r.von_name} <${r.von_email}>` : r.von_email,
            betreff: r.betreff,
            inhalt: r.ai_zusammenfassung,
            mitarbeiter_id: r.zugeordnet_mitarbeiter_id,
            einrichtung_id: r.zugeordnet_einrichtung_id,
            fehler: null,
            metadata: { ai_kategorie: r.ai_kategorie },
          });
        }
      }
    }

    // Filter Status/Suche auf gemergten Eintraegen
    let result = eintraege;
    if (data.status && data.status !== "all") {
      result = result.filter((e) => e.status === data.status);
    }
    if (data.suche && data.suche.trim()) {
      const s = data.suche.trim().toLowerCase();
      result = result.filter((e) =>
        [e.empfaenger, e.absender, e.betreff, e.inhalt, e.fehler]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s)),
      );
    }

    result.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    result = result.slice(0, limit);

    // Namen für Mitarbeiter/Einrichtung anreichern
    const maIds = Array.from(
      new Set(result.map((r) => r.mitarbeiter_id).filter(Boolean) as string[]),
    );
    const einIds = Array.from(
      new Set(result.map((r) => r.einrichtung_id).filter(Boolean) as string[]),
    );
    const [maRes, einRes] = await Promise.all([
      maIds.length
        ? supabase.from("mitarbeiter").select("id, vorname, nachname").in("id", maIds)
        : Promise.resolve({ data: [] as any[] }),
      einIds.length
        ? supabase.from("einrichtungen").select("id, name").in("id", einIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const maMap = new Map((maRes.data ?? []).map((m: any) => [m.id, `${m.vorname} ${m.nachname}`]));
    const einMap = new Map((einRes.data ?? []).map((e: any) => [e.id, e.name]));

    return {
      eintraege: result.map((e) => ({
        ...e,
        mitarbeiter_name: e.mitarbeiter_id ? maMap.get(e.mitarbeiter_id) ?? null : null,
        einrichtung_name: e.einrichtung_id ? einMap.get(e.einrichtung_id) ?? null : null,
      })),
      stats: {
        gesamt: result.length,
        out: result.filter((r) => r.richtung === "out").length,
        in: result.filter((r) => r.richtung === "in").length,
        failed: result.filter((r) => r.status === "failed" || r.status === "dlq").length,
      },
    };
  });
