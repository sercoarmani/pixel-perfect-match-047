
# Ausbauplan – 7 Blöcke

Ich schlage vor, die Blöcke **einzeln** umzusetzen und jeweils direkt testbar abzuschließen. So bleibt jede Etappe überschaubar, du kannst nach jedem Block prüfen, und wir verheddern uns nicht in Halbfertigem.

## Reihenfolge (empfohlen)

1. **Block 2** – Dokumente (Storage + Felder) → Grundlage für Block 5 & 6
2. **Block 1** – Reiter „Verwaltung / Verknüpfungen" → Sichtbarkeit aller Kanäle
3. **Block 7** – Versand-Protokoll (Tabelle) → wird ab Block 4 sofort befüllt
4. **Block 3** – Bedarfsassistent (E-Mail-Eingang + KI-Parsing + Bestätigung)
5. **Block 4** – Auto-Outreach an Mitarbeiter (Telegram + WhatsApp)
6. **Block 5** – Kundenbestätigung nach Zusage (E-Mail mit Anhängen)
7. **Block 6** – MA-Bestätigung per Telegram/WhatsApp

---

## Block 1 – Verwaltung / Verknüpfungen
- Neue Route `/verwaltung/verknuepfungen` (Admin-only via `has_role`)
- Tabelle `integrations` (id, key, name, kategorie, status, last_active_at, config jsonb, aktiv) – erweiterbar
- Status-Erkennung pro Eintrag über kleine Server-Functions (Telegram getMe, E-Mail-Domain-Status, WhatsApp Ping)
- UI: Liste mit Badge (verbunden/Fehler/nicht verbunden) + Connect/Disconnect-Button
- Seed: E-Mail, Telegram, WhatsApp, Telefon-App, „weitere…"

## Block 2 – Mitarbeiter-Dokumente
- Storage-Bucket `mitarbeiter-dokumente` (privat) mit Pfadschema `{mitarbeiter_id}/{uuid}-{filename}`
- Tabelle `mitarbeiter_dokumente`: mitarbeiter_id, typ (enum: zertifikat/fuehrungszeugnis/profil/sonstiges), datei_path, dateiname, ausstellungsdatum, ablaufdatum, weitergabe_erlaubt (bool), erkannt_json (jsonb), erkannt_geprueft (bool), erstellt_am
- Upload-UI im Mitarbeiter-Detail + Sammel-Import-Dialog (mehrere Dateien → Zuordnung pro Datei)
- Server-Function `extractDocument`:
  - PDF → `pdfjs-dist` Textextraktion
  - Excel → `xlsx` (SheetJS)
  - Bilder/JPEG → OCR via Lovable AI Gateway (gemini-2.5-flash, multimodal)
  - Felder (ausstellungs-/ablaufdatum, Name) aus extrahiertem Text via Lovable AI mit JSON-Schema
  - Resultat als „automatisch erkannt – bitte prüfen" markiert
- RLS: Admin/Dispo sieht alle; künftiger MA-Zugang nur eigene
- Ablauf-Warnung: Dashboard-Widget + Verwaltungs-Liste mit `ablaufdatum ≤ heute+60 Tage`

## Block 3 – Bedarfsassistent (E-Mail-Eingang)
- Eingangsweg: dedizierte Inbox-Adresse (z. B. `bedarf@notify.dispoplan.one`) → Inbound-Webhook (Lovable Emails Inbound oder externer Forwarder)
- Tabelle `bedarf_inbox`: roh_email, status (neu/erkannt/bestaetigt/verworfen), erkannt_json, kunde_einrichtung_id (nullable), erstellt_am
- KI-Parsing (Lovable AI) extrahiert: kunde, datum, schicht (F/S/N), ort, qualifikation → JSON-Schema
- UI `/bedarfsassistent`: Liste neuer Mails; Detail mit erkannten Feldern, manuell editierbar; „Bestätigen" legt `bedarfe`-Eintrag an und markiert Inbox als verarbeitet
- Verknüpfung mit bestehender Planungs-/Verfügbarkeitsmatrix

## Block 4 – Auto-Outreach an Mitarbeiter
- Aus `bedarfe`-Eintrag: Matching (gleiche Qualifikation, Verfügbarkeit am Datum+Schicht, kein Konflikt)
- Vorlage erzeugen: `Dienst frei: {schicht} am {datum} in {ort}. Kannst du? JA/NEIN`
- Telegram: bestehender Bot, Inline-Buttons JA/NEIN → Callback updated `verfuegbarkeiten`/`anfragen`
- WhatsApp: Business API (Cloud API von Meta) – wegen 24h-Session-Regel **Template Message** für Erstkontakt, Free-Form nach Antwort
  - **Voraussetzung**: WhatsApp-Connector/Provider (Meta Cloud API mit Phone Number ID + System User Token, oder 360dialog/Twilio). Müssen wir vor diesem Block einrichten.
- Versand mehrfach parallel, pro MA ein `anfragen`-Eintrag

## Block 5 – Kundenbestätigung nach Zusage
- Trigger: Mitarbeiter sagt JA → Server-Function `confirmEinsatz`
- Baut E-Mail (Lovable Emails) an Kontakt der `einrichtung`:
  - Inhalt: Name, Position, Datum/Schicht
  - Anhänge: alle Dokumente des MA mit `weitergabe_erlaubt = true` (Profil + Zertifikate)
- Vorschau-Dialog vor Versand (Empfänger, Betreff, Body, Anhang-Liste editierbar/abwählbar)
- Nach Freigabe: senden + in `versand_log` protokollieren

## Block 6 – Unterlagen an den Mitarbeiter
- Nach Versand an Kunde: automatischer Versand an MA über Telegram + WhatsApp
- Inhalt: Bestätigung des Einsatzes + PDF (Profil/Bestätigung)
- Wenn MA nur einen Kanal verknüpft hat → nur dieser

## Block 7 – Versand-Protokoll
- Tabelle `versand_log`: id, kanal (email/telegram/whatsapp), richtung (out/in), empfaenger_typ (kunde/mitarbeiter), empfaenger_id, betreff, body_snippet, anhaenge jsonb, status (ok/fehler/queued), fehler_text, bezug_typ (bedarf/anfrage/einsatz/dokument), bezug_id, erstellt_am
- View/Seite `/verwaltung/protokoll` mit Filter
- Jede Server-Function aus Block 3–6 schreibt am Ende in `versand_log`

---

## Sicherheit (gilt durchgängig)
- Storage-Bucket privat, signierte URLs nur serverseitig, kurze TTL
- RLS:
  - `mitarbeiter_dokumente`: `is_dispo(auth.uid())` voll; spätere MA-Policy via `mitarbeiter.user_id`
  - `bedarf_inbox`, `versand_log`, `integrations`: dispo-only
- Secrets (WhatsApp-Token, Inbound-Webhook-Secret) ausschließlich in Lovable Secrets
- Kunden-Mail: hartes Check, dass jeder Anhang `weitergabe_erlaubt = true` hat (auch serverseitig, nicht nur UI)

---

## Was du vor Start klären musst
1. **WhatsApp-Provider**: Hast du einen Meta-Business-Account + Phone Number ID? Oder willst du 360dialog/Twilio? Ohne das funktioniert Block 4/6-WhatsApp nicht.
2. **E-Mail-Inbound für Bedarfsassistent**: Lovable Emails inbound einrichten oder externer Forwarder (z. B. Cloudflare Email Worker, IMAP-Poll)?
3. **OCR-Sprache**: Reicht Deutsch+Englisch via Gemini multimodal, oder brauchst du Tesseract on-device?
4. **Start-Block**: Sollen wir wirklich mit **Block 2 (Dokumente)** anfangen, oder hast du eine andere Priorität?

Sag mir die Antworten – dann lege ich mit dem ersten Block los.
