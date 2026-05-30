// Server-only helpers für Kundenbestätigungen (Block 5 + 6).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tgSendMessage } from "@/lib/telegram.server";
import { logVersand } from "@/lib/versand-log.server";

const BUCKET = "mitarbeiter-dokumente";
const DEFAULT_SIGNED_URL_TTL = 60 * 60 * 24 * 30; // 30 Tage
const SENDER_DOMAIN = "notify.dispoplan.one";
const FROM_ADDRESS = "bestaetigung@notify.dispoplan.one";
const FROM_NAME = "DispoPlan";

const DIENST_LABEL: Record<string, string> = {
  F: "Frühdienst",
  S: "Spätdienst",
  N: "Nachtdienst",
};

function fmtDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type DraftInput = {
  mitarbeiter_id: string;
  einrichtung_id: string;
  bedarf_id?: string | null;
  einsatz_id?: string | null;
  datum: string;
  dienst: string;
};

export async function createKundenbestaetigungDraft(input: DraftInput): Promise<string | null> {
  // Idempotenz: kein doppelter Draft für (einrichtung, mitarbeiter, bedarf)
  try {
    const baseQ = supabaseAdmin
      .from("kunden_bestaetigungen")
      .select("id")
      .eq("mitarbeiter_id", input.mitarbeiter_id)
      .eq("einrichtung_id", input.einrichtung_id)
      .in("status", ["entwurf", "gesendet"])
      .limit(1);
    const { data: existing } = await (input.bedarf_id
      ? baseQ.eq("bedarf_id", input.bedarf_id)
      : baseQ.is("bedarf_id", null)
    ).maybeSingle();
    if (existing) return existing.id;


    const [{ data: ma }, { data: ein }, dokRes] = await Promise.all([
      supabaseAdmin.from("mitarbeiter").select("vorname, nachname, qualifikation").eq("id", input.mitarbeiter_id).maybeSingle(),
      supabaseAdmin.from("einrichtungen").select("name, ort, kontakt_name, kontakt_email").eq("id", input.einrichtung_id).maybeSingle(),
      supabaseAdmin.from("mitarbeiter_dokumente").select("id").eq("mitarbeiter_id", input.mitarbeiter_id).eq("weitergabe_erlaubt", true),
    ]);

    const dokIds = (dokRes.data ?? []).map((d) => d.id);
    const maName = ma ? `${ma.vorname} ${ma.nachname}` : "Mitarbeiter";
    const einName = ein?.name ?? "Einrichtung";
    const dienstLabel = DIENST_LABEL[input.dienst] ?? input.dienst;
    const datumLabel = fmtDate(input.datum);

    const betreff = `Einsatzbestätigung: ${maName} am ${new Date(input.datum).toLocaleDateString("de-DE")} (${input.dienst})`;
    const body = [
      ein?.kontakt_name ? `Hallo ${ein.kontakt_name},` : "Hallo,",
      "",
      `wir bestätigen Ihnen den folgenden Einsatz:`,
      "",
      `• Einrichtung: ${einName}`,
      `• Mitarbeiter/in: ${maName}${ma?.qualifikation ? ` (${ma.qualifikation})` : ""}`,
      `• Datum: ${datumLabel}`,
      `• Dienst: ${dienstLabel}`,
      "",
      dokIds.length
        ? `Im Anhang dieser Mail finden Sie die freigegebenen Unterlagen (${dokIds.length}) als Download-Link (gültig 30 Tage).`
        : "Aktuell liegen keine zur Weitergabe freigegebenen Unterlagen vor.",
      "",
      "Bei Rückfragen erreichen Sie uns jederzeit gerne.",
      "",
      "Mit freundlichen Grüßen",
      "Ihr DispoPlan-Team",
    ].join("\n");

    const { data: row, error } = await supabaseAdmin
      .from("kunden_bestaetigungen")
      .insert({
        mitarbeiter_id: input.mitarbeiter_id,
        einrichtung_id: input.einrichtung_id,
        bedarf_id: input.bedarf_id ?? null,
        einsatz_id: input.einsatz_id ?? null,
        status: "entwurf",
        empfaenger_name: ein?.kontakt_name ?? null,
        empfaenger_email: ein?.kontakt_email ?? null,
        betreff,
        body_text: body,
        dokument_ids: dokIds,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[kunden-bestaetigung] draft insert failed", error);
      return null;
    }
    return row.id;
  } catch (e) {
    console.error("[kunden-bestaetigung] createDraft failed", e);
    return null;
  }
}

type DokRow = {
  id: string;
  dateiname: string;
  datei_path: string;
  typ: string;
  mime_type: string | null;
  groesse_bytes: number | null;
  weitergabe_erlaubt: boolean;
  mitarbeiter_id: string;
};

async function loadAllowedDocs(mitarbeiterId: string, dokIds: string[]): Promise<DokRow[]> {
  if (!dokIds.length) return [];
  const { data } = await supabaseAdmin
    .from("mitarbeiter_dokumente")
    .select("id, dateiname, datei_path, typ, mime_type, groesse_bytes, weitergabe_erlaubt, mitarbeiter_id")
    .in("id", dokIds)
    .eq("mitarbeiter_id", mitarbeiterId)
    .eq("weitergabe_erlaubt", true);
  return (data ?? []) as DokRow[];
}

async function signDoc(path: string, ttl = DEFAULT_SIGNED_URL_TTL): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, ttl);
  if (error) {
    console.error("[kunden-bestaetigung] signed url failed", path, error);
    return null;
  }
  return data?.signedUrl ?? null;
}

function buildHtml(bodyText: string, links: Array<{ label: string; url: string }>): string {
  const para = bodyText.split(/\n\n+/).map((p) => `<p style="margin:0 0 14px;line-height:1.5;color:#1f2937">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const linksHtml = links.length
    ? `<table role="presentation" style="margin:18px 0 8px;border-collapse:collapse"><tbody>${links
        .map(
          (l) =>
            `<tr><td style="padding:6px 0"><a href="${l.url}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500" target="_blank" rel="noopener">⬇︎ ${escapeHtml(l.label)}</a></td></tr>`,
        )
        .join("")}</tbody></table><p style="font-size:12px;color:#6b7280;margin:0 0 16px">Die Download-Links sind 30 Tage gültig.</p>`
    : "";
  return `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px"><tbody><tr><td>${para}${linksHtml}</td></tr></tbody></table></body></html>`;
}

export type SendResult = {
  ok: boolean;
  fehler?: string;
  email_status: "queued" | "skipped" | "failed";
  ma_unterlagen_status: "sent" | "skipped" | "failed";
  ma_unterlagen_fehler?: string;
};

export async function sendKundenbestaetigung(id: string, userId?: string | null): Promise<SendResult> {
  const { data: row, error } = await supabaseAdmin
    .from("kunden_bestaetigungen").select("*").eq("id", id).maybeSingle();
  if (error || !row) return { ok: false, fehler: "Eintrag nicht gefunden", email_status: "skipped", ma_unterlagen_status: "skipped" };
  if (row.status === "gesendet") return { ok: true, email_status: "skipped", ma_unterlagen_status: "skipped" };
  if (!row.empfaenger_email) {
    await supabaseAdmin.from("kunden_bestaetigungen").update({ status: "fehler", fehler: "Keine Empfänger-E-Mail" }).eq("id", id);
    return { ok: false, fehler: "Keine Empfänger-E-Mail", email_status: "failed", ma_unterlagen_status: "skipped" };
  }

  const docs = await loadAllowedDocs(row.mitarbeiter_id, row.dokument_ids ?? []);
  const signed: Array<{ doc: DokRow; url: string }> = [];
  for (const d of docs) {
    const url = await signDoc(d.datei_path);
    if (url) signed.push({ doc: d, url });
  }

  const links = signed.map((s) => ({
    label: `${s.doc.dateiname}${s.doc.groesse_bytes ? ` (${Math.round(s.doc.groesse_bytes / 1024)} KB)` : ""}`,
    url: s.url,
  }));

  const html = buildHtml(row.body_text, links);
  const messageId = crypto.randomUUID();

  // E-Mail einreihen via pgmq
  let emailStatus: "queued" | "failed" = "queued";
  let emailFehler: string | undefined;
  try {
    const payload = {
      to: row.empfaenger_email,
      from: { email: FROM_ADDRESS, name: FROM_NAME },
      sender_domain: SENDER_DOMAIN,
      subject: row.betreff,
      html,
      text: row.body_text + (links.length ? `\n\nDownloads:\n${links.map((l) => `- ${l.label}: ${l.url}`).join("\n")}` : ""),
      purpose: "transactional" as const,
      label: "kunden-bestaetigung",
      idempotency_key: `kb-${id}`,
      message_id: messageId,
      queued_at: new Date().toISOString(),
    };
    const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });
    if (enqErr) {
      emailStatus = "failed";
      emailFehler = enqErr.message;
    } else {
      // pending-Log-Eintrag
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "kunden-bestaetigung",
        recipient_email: row.empfaenger_email,
        status: "pending",
        metadata: { kunden_bestaetigung_id: id },
      });
    }
  } catch (e: any) {
    emailStatus = "failed";
    emailFehler = e?.message ?? String(e);
  }

  await logVersand({
    kanal: "email",
    status: emailStatus === "queued" ? "queued" : "failed",
    empfaenger: row.empfaenger_email,
    absender: FROM_ADDRESS,
    betreff: row.betreff,
    inhalt: row.body_text.slice(0, 4000),
    mitarbeiter_id: row.mitarbeiter_id,
    einrichtung_id: row.einrichtung_id,
    bedarf_id: row.bedarf_id,
    referenz_typ: "kunden_bestaetigung",
    referenz_id: id,
    ausgeloest_von: userId ?? null,
    fehler: emailFehler ?? null,
    metadata: { message_id: messageId, anhang_anzahl: links.length },
  });

  // Block 6: Unterlagen an Mitarbeiter via Telegram
  let maStatus: SendResult["ma_unterlagen_status"] = "skipped";
  let maFehler: string | undefined;
  try {
    const { data: ma } = await supabaseAdmin
      .from("mitarbeiter").select("vorname, telegram_chat_id").eq("id", row.mitarbeiter_id).maybeSingle();
    const { data: ein } = await supabaseAdmin
      .from("einrichtungen").select("name").eq("id", row.einrichtung_id).maybeSingle();

    if (ma?.telegram_chat_id) {
      const chatId = Number(ma.telegram_chat_id);
      const datumLabel = row.einsatz_id ? "" : ""; // wird unten ohne einsatz gezogen
      // Lade Einsatz-Details für hübschen Text
      let datum = "";
      let dienst = "";
      if (row.einsatz_id) {
        const { data: e } = await supabaseAdmin.from("einsaetze").select("datum, dienst").eq("id", row.einsatz_id).maybeSingle();
        if (e) { datum = e.datum; dienst = e.dienst; }
      }
      const headerText = [
        `✅ <b>Einsatz bestätigt</b>`,
        ein?.name ? `🏥 ${ein.name}` : "",
        datum ? `📅 ${fmtDate(datum)}` : "",
        dienst ? `⏰ ${DIENST_LABEL[dienst] ?? dienst}` : "",
        "",
        signed.length
          ? `Anbei deine an den Kunden weitergegebenen Unterlagen (${signed.length}):`
          : `Hinweis: Es wurden keine Dokumente an den Kunden weitergegeben.`,
      ].filter(Boolean).join("\n");

      await tgSendMessage(chatId, headerText, { parse_mode: "HTML" });

      // sendDocument pro PDF (Telegram lädt URL selbst)
      for (const s of signed) {
        try {
          const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendDocument", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": process.env.TELEGRAM_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              document: s.url,
              caption: s.doc.dateiname,
            }),
          });
          if (!res.ok) {
            const t = await res.text();
            throw new Error(`sendDocument [${res.status}]: ${t.slice(0, 200)}`);
          }
        } catch (docErr: any) {
          // einzelnes Doc-Failure ist nicht kritisch — Hinweis nachschicken
          await tgSendMessage(chatId, `⚠️ Konnte „${s.doc.dateiname}" nicht senden.`).catch(() => {});
          console.error("[kunden-bestaetigung] sendDocument failed", docErr);
        }
      }
      maStatus = "sent";

      await logVersand({
        kanal: "telegram",
        status: "sent",
        empfaenger: String(chatId),
        mitarbeiter_id: row.mitarbeiter_id,
        einrichtung_id: row.einrichtung_id,
        bedarf_id: row.bedarf_id,
        referenz_typ: "ma_unterlagen",
        referenz_id: id,
        ausgeloest_von: userId ?? null,
        inhalt: headerText,
        metadata: { dok_anzahl: signed.length },
      });
    } else {
      maStatus = "skipped";
      maFehler = "Mitarbeiter ohne Telegram-Verknüpfung";
    }
  } catch (e: any) {
    maStatus = "failed";
    maFehler = e?.message ?? String(e);
    console.error("[kunden-bestaetigung] MA Telegram-Versand failed", e);
  }

  const finalStatus: "gesendet" | "fehler" = emailStatus === "queued" ? "gesendet" : "fehler";
  await supabaseAdmin
    .from("kunden_bestaetigungen")
    .update({
      status: finalStatus,
      gesendet_am: emailStatus === "queued" ? new Date().toISOString() : null,
      fehler: emailFehler ?? null,
      ma_unterlagen_status: maStatus,
      ma_unterlagen_fehler: maFehler ?? null,
    })
    .eq("id", id);

  return {
    ok: emailStatus === "queued",
    fehler: emailFehler,
    email_status: emailStatus,
    ma_unterlagen_status: maStatus,
    ma_unterlagen_fehler: maFehler,
  };
}
