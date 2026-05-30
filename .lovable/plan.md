## Ziel

Pro Monat (z. B. Juni) einen Broadcast über den Telegram-Bot auslösen, der jedem verknüpften Mitarbeiter seinen persönlichen Link schickt. Im Portal sieht der Mitarbeiter genau diesen Monat als Tagesliste und kann je Tag Früh-/Spät-/Nachtdienst eintragen.

## Was der Mitarbeiter bekommt

Telegram-Nachricht, z. B.:

> Hallo Saeed, bitte trage deine Verfügbarkeit für **Juni 2026** ein:
> https://…/m/<token>?monat=2026-06

Klick → Portalseite zeigt nur Juni, gruppiert nach Wochen, mit F/S/N-Buttons pro Tag und „Speichern". Bereits gemeldete/vergebene Schichten bleiben sichtbar und geschützt (wie heute).

## Was die Dispo bekommt

Auf der Seite **Mitarbeiter** (oben rechts) ein neuer Button **„Verfügbarkeitslink senden"**:

1. Dialog öffnet sich.
2. Monatsauswahl (Default: nächster Monat, wählbar bis 6 Monate voraus).
3. Optional Filter: „Nur aktive Mitarbeiter" (Default an).
4. Vorschau: „Wird an N verknüpfte Mitarbeiter gesendet" (Anzahl der Mitarbeiter mit `telegram_chat_id`).
5. Button „Jetzt senden" → Server-Funktion verschickt die Nachrichten und gibt Statistik zurück (gesendet, übersprungen, Fehler).

## Technische Umsetzung

### Portal (`src/routes/m.$token.tsx`)
- Liest `?monat=YYYY-MM` aus der URL (Fallback: aktueller Monat).
- Ersetzt die bisherige „28 Tage ab heute"-Liste durch eine **Monatsansicht**: alle Tage des gewählten Monats, gruppiert nach Kalenderwochen, Wochenenden gehighlightet, Tage in der Vergangenheit ausgegraut.
- Header zeigt „Verfügbarkeit für Juni 2026" plus kleine Navigation „◀ Mai / Juli ▶" (nur Monate ≥ aktueller Monat).
- F/S/N-Logik, Speichern, „Vergeben"-Sperre bleiben unverändert.
- Bestehender Server-Endpoint `getMitarbeiterPortal` bekommt optionalen Parameter `monat`, damit nur die relevanten Verfügbarkeiten geladen werden.

### Server-Funktion (`src/lib/telegram.functions.ts`)
Neue Funktion `sendVerfuegbarkeitsBroadcast({ monat: "YYYY-MM", nur_aktive?: boolean })`:
- Lädt alle Mitarbeiter mit `telegram_chat_id IS NOT NULL` (optional `aktiv=true`).
- Baut pro Mitarbeiter den Link `${publicOrigin()}/m/${token}?monat=${monat}`.
- Versendet die Nachricht via vorhandenem `tgSendMessage` (sequenziell, Fehler pro Empfänger werden gesammelt, nicht abbrechend).
- Rückgabe: `{ gesendet, gesamt, fehler: string[] }`.

Die bestehende Bedarfs-Broadcast-Funktion bleibt unverändert.

### Dispo-UI (`src/routes/_authenticated.mitarbeiter.tsx`)
- Neuer Button „Verfügbarkeitslink senden" in der Toolbar.
- Dialog mit Monats-Dropdown (aktueller + 5 folgende Monate) + Checkbox „nur aktive Mitarbeiter".
- Anzeige der Empfängerzahl (geladen aus bestehendem Mitarbeiter-Query, gefiltert auf `telegram_chat_id`).
- Beim Senden Toast mit Ergebnis (z. B. „12 von 15 Nachrichten gesendet, 3 Fehler").

### Datenbank
Keine Schemaänderung nötig. Verwendet bestehende Tabellen `mitarbeiter` (für Chat-IDs und Token) und `verfuegbarkeiten` (für die Einträge). Optional später: Audit-Eintrag in `audit_log` für jeden Broadcast (kann ich auf Wunsch hinzufügen).

## Offene Punkte (bitte bestätigen oder korrigieren)

1. **Default-Monat im Dialog**: nächster Monat (aktuell wäre das Juni 2026). OK?
2. **Empfängerkreis**: alle Mitarbeiter mit Telegram-Chat **und** `aktiv = true`. OK?
3. **Nachrichtentext** wie oben („Hallo {Vorname}, bitte trage deine Verfügbarkeit für {Monat} ein: <link>"). OK oder anderer Wortlaut?
4. **Mehrfaches Senden** im selben Monat erlauben (z. B. als Erinnerung)? Default: ja.
