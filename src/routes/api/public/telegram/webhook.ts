import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { telegramWebhookSecret, tgAnswerCallback, tgSendMessage } from "@/lib/telegram.server";
import { einsatzBelegt } from "@/lib/matching";

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function findMitarbeiterByChat(chatId: number) {
  const { data } = await supabaseAdmin
    .from("mitarbeiter")
    .select("id, vorname, nachname")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data;
}

async function handleStart(chatId: number, token: string, username: string | null) {
  const { data: ma } = await supabaseAdmin
    .from("mitarbeiter")
    .select("id, vorname, nachname, zugangs_token, telegram_chat_id")
    .eq("zugangs_token", token)
    .maybeSingle();

  if (!ma) {
    await tgSendMessage(chatId, "Ungültiger oder abgelaufener Link. Bitte beim Dispo melden.");
    return;
  }
  if (ma.telegram_chat_id && Number(ma.telegram_chat_id) !== chatId) {
    await tgSendMessage(chatId, "Dieser Link ist bereits einem anderen Telegram-Konto zugeordnet.");
    return;
  }
  await supabaseAdmin
    .from("mitarbeiter")
    .update({ telegram_chat_id: chatId, telegram_username: username })
    .eq("id", ma.id);

  await tgSendMessage(
    chatId,
    `Hallo ${ma.vorname}! ✅\nDein Konto ist jetzt mit diesem Bot verknüpft. Du erhältst hier Anfragen für offene Dienste und kannst direkt mit Zusage/Absage antworten.`,
  );
}

async function handleCallback(callbackId: string, chatId: number, dataStr: string) {
  const ma = await findMitarbeiterByChat(chatId);
  if (!ma) {
    await tgAnswerCallback(callbackId, "Konto nicht verknüpft.");
    return;
  }
  const [action, bedarfId] = dataStr.split(":");
  if (!bedarfId) {
    await tgAnswerCallback(callbackId, "Unbekannte Aktion.");
    return;
  }

  if (action === "z") {
    // Zusage – Logik wie in bedarfZusage, aber serverseitig mit Admin-Client
    const { data: bedarf } = await supabaseAdmin.from("bedarfe").select("*").eq("id", bedarfId).maybeSingle();
    if (!bedarf || bedarf.ergebnis !== "offen") {
      await tgAnswerCallback(callbackId, "Dienst ist bereits vergeben.");
      await tgSendMessage(chatId, "Schade – dieser Dienst ist nicht mehr offen.");
      return;
    }
    const [{ data: tagEins }, { data: tagAbw }] = await Promise.all([
      supabaseAdmin.from("einsaetze").select("status").eq("mitarbeiter_id", ma.id).eq("datum", bedarf.datum),
      supabaseAdmin.from("abwesenheiten").select("art").eq("mitarbeiter_id", ma.id).eq("datum", bedarf.datum).limit(1),
    ]);
    if ((tagAbw ?? []).length > 0 || (tagEins ?? []).some((e: any) => einsatzBelegt(e.status))) {
      await tgAnswerCallback(callbackId, "Doppelbelegung – nicht möglich.");
      await tgSendMessage(chatId, "Du bist an dem Tag bereits eingeplant oder abwesend.");
      return;
    }
    const { error: insErr } = await supabaseAdmin.from("einsaetze").insert({
      mitarbeiter_id: ma.id,
      einrichtung_id: bedarf.einrichtung_id,
      datum: bedarf.datum,
      dienst: bedarf.dienst,
      status: "BESTAETIGT",
      quelle: "telegram",
      notiz: bedarf.notiz ?? null,
    });
    if (insErr) {
      await tgAnswerCallback(callbackId, "Konnte nicht eintragen.");
      return;
    }
    await supabaseAdmin
      .from("verfuegbarkeiten")
      .update({ status: "vergeben" })
      .eq("mitarbeiter_id", ma.id)
      .eq("datum", bedarf.datum)
      .eq("dienst", bedarf.dienst);

    const { data: deckung } = await supabaseAdmin
      .from("einsaetze").select("status")
      .eq("einrichtung_id", bedarf.einrichtung_id)
      .eq("datum", bedarf.datum)
      .eq("dienst", bedarf.dienst);
    const besetzt = (deckung ?? []).filter((e: any) => einsatzBelegt(e.status)).length;
    const voll = besetzt >= (bedarf.anzahl ?? 1);
    await supabaseAdmin.from("bedarfe").update({
      ergebnis: voll ? "abgedeckt" : "offen",
      status: voll ? "besetzt" : "in_bearbeitung",
      besetzt_durch: ma.id,
    }).eq("id", bedarfId);

    await tgAnswerCallback(callbackId, "Zusage gespeichert. Danke!");
    await tgSendMessage(chatId, "✅ Zusage gespeichert. Der Dispo wurde informiert.");
  } else if (action === "a") {
    const { data: bedarf } = await supabaseAdmin.from("bedarfe").select("notiz").eq("id", bedarfId).maybeSingle();
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const note = `${bedarf?.notiz ?? ""}\n[${stamp}] Absage via Telegram von ${ma.nachname}, ${ma.vorname}`.trim();
    await supabaseAdmin.from("bedarfe").update({ notiz: note }).eq("id", bedarfId);
    await tgAnswerCallback(callbackId, "Absage vermerkt.");
    await tgSendMessage(chatId, "❌ Absage vermerkt. Danke für die Rückmeldung!");
  } else {
    await tgAnswerCallback(callbackId, "Unbekannte Aktion.");
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = telegramWebhookSecret();
        const actual = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();

        // Idempotenz-Log
        if (typeof update?.update_id === "number") {
          await supabaseAdmin.from("telegram_updates").upsert(
            {
              update_id: update.update_id,
              chat_id: update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? null,
              text: update.message?.text ?? update.callback_query?.data ?? null,
              raw: update,
            },
            { onConflict: "update_id" },
          );
        }

        try {
          if (update.message?.text) {
            const text: string = update.message.text;
            const chatId: number = update.message.chat.id;
            const username: string | null = update.message.from?.username ?? null;
            const m = text.match(/^\/start\s+(\S+)/);
            if (m) {
              await handleStart(chatId, m[1], username);
            } else if (text.trim() === "/start") {
              await tgSendMessage(
                chatId,
                "Hallo 👋\nBitte benutze den persönlichen Bot-Link, den du vom Dispo erhalten hast (Format: /start <Token>).",
              );
            } else if (text.trim() === "/hilfe" || text.trim() === "/help") {
              await tgSendMessage(chatId, "Du erhältst hier Anfragen für offene Dienste. Antworte einfach mit ✅ Zusage oder ❌ Absage.");
            }
          } else if (update.callback_query) {
            const cb = update.callback_query;
            await handleCallback(cb.id, cb.message?.chat?.id, cb.data ?? "");
          }
        } catch (e: any) {
          console.error("[telegram webhook] error", e);
        }

        return Response.json({ ok: true });
      },
      GET: async () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
