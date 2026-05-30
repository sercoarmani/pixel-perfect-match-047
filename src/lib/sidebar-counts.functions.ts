import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSidebarCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [posteingang, anfragenKunden, verfNeu] = await Promise.all([
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
        .from("verfuegbarkeiten")
        .select("*", { count: "exact", head: true })
        .gte("eingegangen_am", since),
    ]);

    return {
      posteingang: posteingang.count ?? 0,
      anfragenKunden: anfragenKunden.count ?? 0,
      verfuegbarkeiten: verfNeu.count ?? 0,
    };
  });
