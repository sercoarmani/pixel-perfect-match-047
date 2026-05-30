# Plan: Disposition-Erweiterungen, Sidebar-Signale, Hilfe & Chatbot

Umfangreiche Anfrage — in 11 klare Arbeitspakete aufgeteilt. Vorschlag zur Umsetzung in einem Durchgang.

## 1. Bedarf = Anfrage Kunde
Wenn der Bedarfsassistent einen neuen Bedarf erkennt, wird automatisch eine `anfragen`-Zeile (`typ=kunde`, `empfaenger_typ=einrichtung`, Status `offen`) angelegt und mit dem Bedarf verknüpft. Vorhandene "Anfragen Kunden"-Liste zeigt diese dann sofort.

## 2. Bedarfsassistent: Mitarbeiter-Radius + Sortierung
- In der Mitarbeiter-Vorschlagsliste pro MA die Distanz (km) zur Einrichtung anzeigen (Haversine aus `lat/lng`).
- Vorschläge primär nach Distanz aufsteigend sortieren; MA ohne Geo ans Ende.
- Optionaler Radius-Filter (Default = `max_radius_km` des MA).

## 3. Sidebar-Signale (Badges/Dots)
Roter Punkt + Zahl an den Nav-Items, wenn ungelesen/offen:
- **Posteingang** — `email_inbox.status='neu'`
- **Verfügbarkeiten** — neue Einträge in `verfuegbarkeiten` seit letztem Besuch (localStorage Marker)
- **Anfragen Kunden** — `anfragen` mit `typ=kunde` & `status='offen'`

Polling alle 30s via TanStack Query.

## 4. Planungsmatrix: offene Bedarfe
Pro Tag/Einrichtung-Zelle einen Hinweis (Pill) wenn `bedarfe.status='offen'` für dieses Datum existiert.

## 5. Einrichtungen sortierbar
Spalten-Header-Klicks: Träger, Name, Ort, VS-Satz PFK, VS-Satz PHK. Toggle asc/desc.

## 6. Kommunikation: Telegram + WhatsApp Icons
Auf `/nachrichten` pro Mitarbeiter Icon-Buttons (Telegram-Link `https://t.me/<username>`, WhatsApp `https://wa.me/<telefon>`).

## 7. Nachrichtenvorlagen verschieben
- Aus Sidebar-Gruppe **Kommunikation** entfernen.
- In **Verwaltung** (`/verwaltung`) als Tab/Sektion "Nachrichtenvorlagen" integrieren.

## 8. "Daten & System" nur für Admins
Sidebar-Gruppe wird ausgeblendet, wenn `!has_role('admin')`. Neuer Hook `useIsAdmin()` analog `useAuth().isDispo`.

## 9. Hilfebereich `/hilfe`
Neue Route mit strukturierten Erklärungen (Accordion) pro Bereich: Dashboard, Bedarfsassistent, Posteingang, Disposition, Anfragen, Verfügbarkeiten, Planungsmatrix, Mitarbeiter, Einrichtungen, Nachrichten, Bestätigungen, Import/Export, Verwaltung. Inhalt als statische Markdown-Blöcke.

## 10. Chatbot-Onboarding-Assistent
Floating-Button (rechts unten) auf allen Auth-Seiten → Sheet mit Chat.
- Backend: neue ServerFn `chatHelp` ruft Lovable AI Gateway (`google/gemini-3-flash-preview`, streaming) mit System-Prompt der die App, Rollen, Workflows erklärt.
- Kontext-aware: aktuelle Route wird in System-Prompt eingespeist ("Nutzer ist gerade auf /bedarf").
- Markdown-Rendering im Chat.

## 11. Sidebar-Reorganisation (folgt aus 7 + 8)
Aktualisierte SECTIONS:
- Übersicht, Disposition, Stammdaten
- Kommunikation: Nachrichten, Kundenbestätigungen, Versand-Protokoll
- Hilfe: Hilfebereich
- Daten & System (admin-only): Import, Export, Verwaltung (inkl. Vorlagen)

---

## Technische Details

**Neue/geänderte Dateien (ca.):**
- `src/routes/_authenticated.tsx` — Badges, Admin-Gate, Reorg, Chatbot-Trigger
- `src/routes/_authenticated.bedarf.tsx` + `dispo.functions.ts` — Anfrage-Auto-Erzeugung, Distanz/Sort
- `src/routes/_authenticated.plan.tsx` — offene Bedarfe Pills
- `src/routes/_authenticated.einrichtungen.tsx` — sortierbare Header
- `src/routes/_authenticated.nachrichten.tsx` — TG/WA Icons
- `src/routes/_authenticated.verwaltung.tsx` — Vorlagen-Tab
- `src/routes/_authenticated.hilfe.tsx` — **neu**
- `src/components/help-chatbot.tsx` — **neu** (Sheet + streaming chat)
- `src/lib/chat-help.functions.ts` — **neu** (Lovable AI streaming serverFn)
- `src/lib/sidebar-counts.functions.ts` — **neu** (counts polling)
- `src/lib/auth.tsx` — `isAdmin` ergänzen

**DB:** Keine Schema-Änderungen nötig. Auto-Anfrage nutzt bestehende `anfragen`-Tabelle.

**Abhängigkeit:** `react-markdown` für Chatbot & Hilfe (`bun add react-markdown`).

---

## Offene Frage
Soll **alles in einem Rutsch** umgesetzt werden (großer Diff), oder lieber **in 2–3 Phasen** (z.B. Phase A: Sidebar/Sortierung/Verschiebungen, Phase B: Bedarf-Logik/Planungsmatrix, Phase C: Hilfe+Chatbot)? Phasen-Modus ist sicherer zu reviewen.
