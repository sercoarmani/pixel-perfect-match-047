## Outlook-Anbindung für Posteingang & Versand

Ich verbinde dein Microsoft-Outlook-Postfach über den Lovable-Connector (OAuth) und ersetze damit den bisherigen Inbound-Webhook als primäre Mailquelle. Versand & Empfang laufen dann über dein echtes Outlook-Postfach – sichtbar im Posteingang, zählbar im Versand-Protokoll.

### Was eingerichtet wird

1. **Connector verbinden**
   - `standard_connectors--connect` mit `microsoft_outlook` → du wählst deinen Outlook-Account.
   - Damit stehen `LOVABLE_API_KEY` und `MICROSOFT_OUTLOOK_API_KEY` als Server-Env zur Verfügung (Gateway: `https://connector-gateway.lovable.dev/microsoft_outlook`).

2. **Server-Modul `src/lib/outlook.server.ts`**
   - `fetchOutlookMessages({ since })` – ruft `/me/mailFolders/inbox/messages` mit `$orderby=receivedDateTime desc` + `$filter=receivedDateTime ge …`.
   - `sendOutlookMail({ to, subject, html, text, replyTo })` – `POST /me/sendMail` mit JSON-Body (Outlook-Format, kein RFC 2822).
   - Mapping: Outlook-Message → bestehendes `email_inbox`-Schema (`message_id`, `von_email`, `betreff`, `body_text/html`, `anhaenge`, `empfangen_am`). Duplikate per `message_id`-Unique-Check.
   - Nach Insert: `classifyAndAssignInbox(id)` wie bisher.

3. **Sync-Endpoint & Cron**
   - Neuer Server-Route `src/routes/api/public/outlook/sync.ts` (HMAC-geschützt mit `OUTLOOK_SYNC_SECRET`).
   - pg_cron-Job (alle 2 min) ruft den Endpoint → holt neue Mails seit `last_synced_at` (in `email_send_state` oder neuer `outlook_sync_state`-Zeile).
   - Manueller „Jetzt synchronisieren"-Button in Posteingang.

4. **Versand-Pfad umstellen**
   - `sendeFreemail` bekommt eine Verzweigung: Wenn Outlook verbunden → `sendOutlookMail` (Absender = dein Outlook-Account, sichtbar im echten „Gesendet"-Ordner), sonst Fallback auf bisherige Lovable-Queue.
   - Logging unverändert: `versand_log` (Status `sent`/`failed`) + `email_send_log`.

5. **Verwaltung-UI**
   - Neue Card „Outlook-Postfach" in `_authenticated.verwaltung.tsx`: Verbindungsstatus, Adresse, „Test-Sync", „Test-Mail senden".

### Technische Details

- Gateway-Auth: zwei Header (`Authorization: Bearer $LOVABLE_API_KEY`, `X-Connection-Api-Key: $MICROSOFT_OUTLOOK_API_KEY`) — strikt server-seitig in Handler-Bodies, keine Top-Level-Imports.
- Reichweite: Connector greift auf **dein** Postfach zu (workspace-owner OAuth), nicht auf Kunden-Postfächer — passt, weil eingehende Kundenmails an deine Outlook-Adresse gehen sollen.
- Bestehender Inbound-Webhook bleibt als Fallback bestehen, aber inaktiv, sobald Outlook-Sync läuft.
- Migration: neue Tabelle `outlook_sync_state(id, last_synced_at, last_message_id)` mit RLS + GRANTs.

### Was du tun musst

- Im nächsten Schritt öffnet sich ein Connector-Dialog für Microsoft Outlook → mit deinem Outlook-Account anmelden und freigeben.
- Danach läuft alles automatisch (Sync + Versand über Outlook).

### Offene Frage

Soll der Versand **immer** über Outlook laufen (alle App-Mails kommen aus deinem persönlichen Postfach, auch Kundenbestätigungen & Massenmails), oder **nur** Antworten aus dem Posteingang über Outlook und transaktionale Massenmails weiter über `noreply@notify.dispoplan.one`?
