// Server-only helper zum Loggen von Versand-/Empfangsaktionen.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type VersandLogInput = {
  kanal: "telegram" | "email" | "whatsapp" | "intern" | "sonstiges";
  richtung?: "out" | "in";
  status?: "queued" | "sent" | "delivered" | "failed" | "received";
  empfaenger?: string | null;
  absender?: string | null;
  betreff?: string | null;
  inhalt?: string | null;
  mitarbeiter_id?: string | null;
  einrichtung_id?: string | null;
  bedarf_id?: string | null;
  anfrage_id?: string | null;
  referenz_typ?: string | null;
  referenz_id?: string | null;
  ausgeloest_von?: string | null;
  fehler?: string | null;
  metadata?: any;
};

export async function logVersand(entry: VersandLogInput): Promise<void> {
  try {
    await supabaseAdmin.from("versand_log").insert({
      kanal: entry.kanal,
      richtung: entry.richtung ?? "out",
      status: entry.status ?? "sent",
      empfaenger: entry.empfaenger ?? null,
      absender: entry.absender ?? null,
      betreff: entry.betreff ?? null,
      inhalt: entry.inhalt ?? null,
      mitarbeiter_id: entry.mitarbeiter_id ?? null,
      einrichtung_id: entry.einrichtung_id ?? null,
      bedarf_id: entry.bedarf_id ?? null,
      anfrage_id: entry.anfrage_id ?? null,
      referenz_typ: entry.referenz_typ ?? null,
      referenz_id: entry.referenz_id ?? null,
      ausgeloest_von: entry.ausgeloest_von ?? null,
      fehler: entry.fehler ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    // Logging darf den eigentlichen Versand nie blockieren
    console.error("versand_log insert failed", e);
  }
}
