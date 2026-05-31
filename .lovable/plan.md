## Ziel

1. **Disposition**: Neuer Button „WhatsApp FlexTeam" – öffnet pro aktivem Mitarbeiter mit Telefonnummer einen WhatsApp-Chat mit vorbereitetem Text.
2. **Mitarbeiter → Verfügbarkeitslink senden**: Versand zusätzlich via WhatsApp möglich (bisher nur Telegram). Pro Mitarbeiter mit Telefonnummer wird ein WhatsApp-Tab mit dem persönlichen Link für den gewählten Monat geöffnet.

WhatsApp-Versand erfolgt per Click-to-Chat-Link (`wa.me`), da kein Twilio/WABA verbunden ist. Pro Empfänger öffnet sich ein Tab; du tippst dort jeweils nur noch auf „Senden".

---

## 1) Dispo: WhatsApp-FlexTeam-Button

**Datei**: `src/routes/_authenticated.dispo.tsx`

- Neuer Button in der Kopfzeile (neben/unter dem Radius-Faktor-Block): „WhatsApp an FlexTeam" mit grünem WhatsApp-Icon.
- Klick öffnet einen Dialog mit:
  - **Vorlage** vorgefüllt aus den aktuell offenen Bedarfen, z. B.:
    ```
    Hallo, offene Dienste:
    • Mo 02.06. Spät – Haus Sonnenschein (PFK)
    • Di 03.06. Früh – Haus Anna (PHK)
    Wer kann? Bitte kurz zurückmelden.
    ```
    (Maximal die ersten ~5 Bedarfe; bei mehr „… und X weitere"). Bei null offenen Bedarfen generischer Default „Hallo, wir suchen kurzfristig Unterstützung – wer hat diese Woche Kapazität?".
  - **Editierbares Textfeld** (Textarea) mit dieser Vorlage.
  - Empfängerzähler: „Wird an N aktive Mitarbeiter mit Telefonnummer geöffnet."
  - Aktionen: „Abbrechen" / „Tabs öffnen".
- Beim Klick „Tabs öffnen": neuer Server-Fn-Aufruf `listFlexTeamPhones` lädt aktive MA mit Telefon (id, vorname, telefon); im Browser wird pro Empfänger mit Verzögerung von ~350 ms ein `https://wa.me/<number>?text=<urlencoded>` geöffnet. Toast: „N Chats werden geöffnet …".
- Hinweistext im Dialog: „Pro Mitarbeiter öffnet sich ein WhatsApp-Tab. Du musst dort jeweils auf ‚Senden' tippen – automatisches Senden ist über persönliche WhatsApp-Nummern nicht möglich."

## 2) Mitarbeiter: Verfügbarkeitslink auch via WhatsApp

**Datei**: `src/routes/_authenticated.mitarbeiter.tsx` (`VerfuegbarkeitsBroadcastButton`)

- Im Dialog „Verfügbarkeitslink senden" einen Kanal-Selector ergänzen:
  - **Telegram** (bisheriger Pfad: `sendVerfuegbarkeitsBroadcast` – Server-side, sendet automatisch an verknüpfte Chats)
  - **WhatsApp** (neu: lädt aktive MA mit Telefonnummer, öffnet pro Mitarbeiter `wa.me/<num>?text=…` mit personalisiertem Link auf `/m/<zugangs_token>?monat=YYYY-MM`).
- Empfängerzähler passt sich an gewählten Kanal an:
  - Telegram: Mitarbeiter mit `telegram_chat_id`
  - WhatsApp: Mitarbeiter mit `telefon`
- Beim Klick „Jetzt senden" wird je nach Kanal die jeweilige Logik ausgelöst.

## 3) Neue Server-Fn

**Datei**: `src/lib/dispo.functions.ts` (oder bestehende `telegram.functions.ts`, neutraler Name)

- `listFlexTeamPhones` (auth-geschützt): liefert `[{ id, vorname, nachname, telefon }]` für aktive Mitarbeiter mit nicht-leerer `telefon`-Spalte.
- `listVerfuegbarkeitsLinksWhatsApp({ monat, nur_aktive })` (auth-geschützt): liefert `[{ id, vorname, telefon, link, text }]` mit demselben Linkformat wie der Telegram-Broadcast (`${publicOrigin}/m/<token>?monat=YYYY-MM`) und Standardtext „Hallo {vorname}, bitte trage deine Verfügbarkeit für {Monat} ein: {link}". Frontend öffnet daraus die `wa.me`-Tabs.
- Optional: `versand_log`-Einträge pro WhatsApp-Versuch mit `kanal: 'whatsapp'`, `status: 'queued'`, damit nachvollziehbar bleibt, an wen ein Tab geöffnet wurde. (Kein echter Versand-Status, da Click-to-Chat.)

## 4) Hinweise

- Telefonnummern werden mit `normalizePhone()` (analog `_authenticated.nachrichten.tsx`) auf E.164 normalisiert; ohne führendes `+` für `wa.me`. Mitarbeiter ohne Telefonnummer werden übersprungen.
- Browser-Popup-Blocker: bei vielen Empfängern (>5) ggf. Hinweis im Toast, dass Popups erlaubt sein müssen.
- Keine DB-Migration nötig.

---

## Technische Details

- Reuse von `WhatsAppIcon` aus `_authenticated.nachrichten.tsx` → in eine kleine Shared-Datei `src/components/icons/whatsapp.tsx` extrahieren, damit Dispo und Mitarbeiter den gleichen Icon-Import verwenden.
- Öffnen der Tabs sequenziell mit `setTimeout(i * 350)` (analog Nachrichten-Seite), um Popup-Blocker zu entschärfen.
- Server-Fn `listFlexTeamPhones` query: `from("mitarbeiter").select("id,vorname,nachname,telefon").eq("aktiv", true).not("telefon", "is", null).neq("telefon", "")`.
- Vorlagengenerierung im Dispo-Dialog rein client-seitig aus `data.bedarfe` (Datum, Dienst-Langform via `DIENST_LANG`, Einrichtungsname, Qualifikation).
