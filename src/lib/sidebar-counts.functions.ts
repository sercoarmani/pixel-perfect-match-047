import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSidebarCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [posteingang, anfragenKundenRes, bedarfeOffen, verfNeu] = await Promise.all([
      supabase
        .from("email_inbox")
        .select("*", { count: "exact", head: true })
        .eq("status", "neu"),
      supabase
        .from("anfragen")
        .select("*", { count: "exact", head: true })
        .eq("typ", "bedarf")
        .eq("empfaenger_typ", "einrichtung")
        .eq("status", "offen"),
      supabase
        .from("bedarfe")
        .select("einrichtung_id, datum, dienst")
        .eq("status", "offen")
        .limit(5000),
      supabase
        .from("verfuegbarkeiten")
        .select("*", { count: "exact", head: true })
        .gte("eingegangen_am", since),
    ]);

    // Dedupe wie in der UI: pro (Einrichtung × Datum × Dienst) eine Zeile
    const seen = new Set<string>();
    for (const b of (bedarfeOffen.data ?? []) as Array<{ einrichtung_id: string; datum: string; dienst: string }>) {
      seen.add(`${b.einrichtung_id}|${b.datum}|${b.dienst}`);
    }

    return {
      posteingang: posteingang.count ?? 0,
      anfragenKunden: (anfragenKundenRes.count ?? 0) + seen.size,
      verfuegbarkeiten: verfNeu.count ?? 0,
    };
  });
