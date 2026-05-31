## Hintergrund / Klarstellung

WhatsApp erlaubt **technisch nicht**, dass eine Nummer automatisch Nachrichten an viele andere Nummern sendet, außer über die kostenpflichtige WhatsApp Business Cloud API. Die aktuelle wa.me-Lösung ist ein **Click-to-Chat-Link**: sie öffnet den Chat mit vorausgefülltem Text – das tatsächliche "Senden" muss immer manuell passieren. Es gibt keine Möglichkeit, das zu umgehen.

Wir bleiben bei wa.me, machen aber die UX und Erwartungshaltung deutlich besser.

## Änderungen

### 1) Sequenzieller Versand statt Massen-Tabs

Aktuell öffnen sich N Tabs auf einmal (Pop-up-Blocker, Chaos). Stattdessen:
- **Ein Chat nach dem anderen**: Dialog zeigt "Empfänger 1 von 12 – Max Müller". Button "Chat öffnen & weiter".
- Nach Klick öffnet sich genau **ein** WhatsApp-Tab. User drückt dort "Senden", schließt den Tab, kommt zurück, klickt "Nächster".
- Fortschrittsanzeige (z. B. "5 von 12 versendet"), Buttons "Überspringen" und "Abbrechen".
- Optional: Checkbox "als versendet markieren" pro Empfänger (lokal im Dialog).

### 2) Klartext-Hinweis im Dialog

Großer Info-Hinweis ganz oben im WhatsApp-Versand-Dialog (sowohl Dispo als auch Mitarbeiter):

> WhatsApp erlaubt keinen vollautomatischen Massenversand. Für jeden Empfänger öffnet sich der Chat mit der vorausgefüllten Nachricht – du musst in WhatsApp selbst auf **Senden** drücken.

### 3) "Alle Tabs auf einmal"-Modus als Opt-in

Für erfahrene User bleibt der bisherige Modus erhalten, aber hinter einem Toggle "Alle auf einmal öffnen (für Power-User)". Default: sequenziell.

## Technische Details

- `src/components/icons/whatsapp.tsx`: `openWhatsAppChats` bleibt für den Power-Mode. Neue Funktion `openWhatsAppChatSingle(phone, text)` öffnet genau einen Tab.
- Neue Komponente `src/components/whatsapp-sequential-dialog.tsx`: gemeinsamer Sequenz-Dialog mit Empfängerliste, Index-State, Fortschritt, Skip/Cancel. Wird von Dispo- und Mitarbeiter-Flow wiederverwendet.
- `src/routes/_authenticated.dispo.tsx`: bestehender FlexTeam-Dialog ruft nach "Tabs öffnen" stattdessen den Sequenz-Dialog auf (mit Toggle für Power-Mode).
- `src/routes/_authenticated.mitarbeiter.tsx`: Verfügbarkeitslink-Dialog im WhatsApp-Kanal verwendet ebenfalls den Sequenz-Dialog. Pro Empfänger wird der personalisierte Link verwendet.
- Keine Backend-/Server-Fn-Änderungen nötig – Datenabruf läuft schon.
