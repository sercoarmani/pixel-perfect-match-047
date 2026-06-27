## Outlook fertigstellen + Telegram-KI-Agent + Build-Fix

Drei Arbeitsblöcke in einer Reihenfolge, die den aktuellen Build-Fehler zuerst behebt und dann sauber aufeinander aufbaut.

---

### Block 1 — Build reparieren (zuerst)

Der letzte Build bricht im Nitro-/Rollup-Schritt beim `readFile` ab (Stacktrace ist abgeschnitten, deutet auf eine fehlende oder fehlerhaft referenzierte Datei aus dem Outlook-Versuch). Ich:

1. Suche nach hinterlassenen Outlook-Artefakten (`src/lib/outlook.*`, `src/routes/api/public/outlook/*`, Imports in `verwaltung.tsx`/`posteingang.tsx`/Migrations).
2. Entferne tote Imports/Dateien, repariere offene Dialog-/Card-Inserts in `_authenticated.verwaltung.tsx`.
3. Lasse den Dev-Build sauber durchlaufen, bevor Block 2 startet.

---

### Block 2 — Outlook-Anbindung sauber zu Ende bauen

- **Connector verbinden**: `standard_connectors--connect` mit `microsoft_outlook` → du wählst dein Konto. Setzt `MICROSOFT_OUTLOOK_API_KEY` als Server-Env.
- **`src/lib/outlook.server.ts`**: Gateway-Calls über `https://connector-gateway.lovable.dev/microsoft_outlook` mit den zwei Pflicht-Headern (`Authorization: Bearer $LOVABLE_API_KEY`, `X-Connection-Api-Key: $MICROSOFT_OUTLOOK_API_KEY`).
  - `fetchInboxSince(iso)` → `GET /me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime ge {iso}`.
  - `sendMail({to,subject,html,text,replyTo})` → `POST /me/sendMail` (Outlook-JSON-Body).
- **Sync-Route** `src/routes/api/public/outlook/sync.ts` (HMAC-geschützt mit `OUTLOOK_SYNC_SECRET`, via `secrets--generate_secret`):
  - holt neue Mails seit `last_synced_at`, mappt auf `email_inbox` (`message_id`-Dedupe), ruft `classifyAndAssignInbox(id)`.
- **Migration**: Tabelle `outlook_sync_state(id, last_synced_at, last_message_id, updated_at)` + RLS + GRANTs.
- **pg_cron**: ruft Sync-Route alle 2 min mit `apikey`-Header (Anon-Key).
- **Versand-Pfad**: `sendeFreemail` bekommt Verzweigung — wenn Outlook konfiguriert → `sendOutlookMail` (Absender = dein Postfach, landet im echten Gesendet-Ordner), sonst Fallback Lovable-Queue. Logging in `versand_log` + `email_send_log` bleibt.
- **UI**: Neue Card „Outlook-Postfach" in `_authenticated.verwaltung.tsx` (Status, „Jetzt synchronisieren", „Test-Mail"). Posteingang bekommt „Synchronisieren"-Button.

---

### Block 3 — Telegram-KI-Agent im bestehenden Bot

Der vorhandene Bot (`src/routes/api/public/telegram/webhook.ts`) versteht heute nur fixe Kommandos (Kopplungscode, Zusage/Absage). Ich ergänze einen KI-Modus für freie Fragen.

- **Provider-Helper**: `src/lib/ai-gateway.server.ts` mit `createLovableAiGatewayProvider` (AI-SDK + `@ai-sdk/openai-compatible`). Model-Default: `google/gemini-3-flash-preview`.
- **Agent-Funktion** `src/lib/telegram-agent.server.ts`:
  - System-Prompt: „Du bist der DispoPlan-Assistent. Antworte kurz, deutsch, höflich. Nutze Tools, um echte Daten zu lesen — niemals erfinden."
  - Tools (alle read-only, scoped auf den verknüpften Mitarbeiter):
    - `getMeineEinsaetze({from,to})` — eigene Einsätze.
    - `getOffeneBedarfe({limit})` — offene Bedarfe im Umkreis.
    - `getMeineVerfuegbarkeit({monat})` — eingetragene Verfügbarkeiten.
    - `getNaechsteAnfrage()` — letzte/aktuelle Anfrage an mich.
  - `stopWhen: stepCountIs(50)`, Gateway-Run-ID-Propagation gemäß AI-SDK-Standard.
- **Webhook-Erweiterung**: Wenn `linked` Mitarbeiter eine freie Textnachricht schickt (kein Code, kein Kommando, kein Callback), wird der Agent gerufen, Antwort per `tgSendMessage` zurück. „Typing…"-Indicator via `sendChatAction(typing)` während der Inferenz.
- **Rate-Limit & Sicherheit**: max. 20 Agent-Calls/Stunde pro `mitarbeiter_id` (einfache In-Memory-LRU im Worker reicht; bei Überschreitung höfliche Antwort). Niemals Daten anderer Mitarbeiter rausgeben — alle Tool-Queries filtern strikt auf den verknüpften `mitarbeiter_id`.
- **Verwaltung-UI**: Toggle „KI-Antworten aktiv" + Anzeige letzter Agent-Antworten/Kosten (aus `ai_gateway_logs`).

### Technische Hinweise

- Kein neuer Telegram-Bot, kein separater Agent-Account — alles im bestehenden Webhook.
- Kein GitHub nötig für den KI-Agent (du wolltest nur Telegram-Bot mit KI). Lovable ↔ GitHub-Repo-Sync wäre separat (GUI-Schritt: Plus-Menü → GitHub → Connect) und braucht keinen Code.
- `LOVABLE_API_KEY` ist bereits gesetzt; keine zusätzlichen Keys nötig (außer Outlook-Connector-OAuth und `OUTLOOK_SYNC_SECRET`).
- Build-Fix passiert zuerst, sonst sieht man Folgefehler nicht.

### Was du tun musst

1. Plan bestätigen → ich starte mit dem Build-Fix.
2. Wenn der Outlook-Connector-Dialog erscheint: mit deinem Outlook-Account anmelden.
3. Danach läuft alles automatisch (Sync + Versand + KI-Antworten im Telegram-Bot).
