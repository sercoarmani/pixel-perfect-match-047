Großer Funktionsumfang — ich schlage vor, in **3 Phasen** umzusetzen. Bitte bestätige Phase 1, dann gehe ich direkt weiter.

## Phase 1 — Anfrage-Workflow (Kern, jetzt)

**1. Anfrage-Eingabe (neue Seite `/anfragen/neu`)**
- Zwei Tabs: **"Text einfügen"** (E-Mail-Text reinpasten) und **"Manuell"**
- KI-Parser via Lovable AI (`google/gemini-2.5-flash`): liest aus dem Text → Einrichtung, Datum(e), Schicht (F/S/N), Qualifikation, Anzahl
- Vorschau-Tabelle der erkannten Bedarfe → "In Planungsmatrix übernehmen" (schreibt in `bedarfe`)

**2. Verfügbare Mitarbeiter vorschlagen**
- Pro Bedarf: zeigt alle Mitarbeiter mit
  - passender Qualifikation
  - Dienst in `dienste_moeglich`
  - keine Abwesenheit am Datum
  - kein anderer Einsatz am Datum
  - `max_einsaetze` im Monat noch nicht erreicht
- Sortiert: PFK > PHK, Vollzeit > Teilzeit > Minijob
- Pro Zeile: **📞 Anrufen** (`tel:`), **💬 WhatsApp** (`https://wa.me/...`), **✅ Zusage** (legt Einsatz mit Status BESTAETIGT an)

**3. Dark/Light Mode**
- Theme-Toggle im Header, persistiert in localStorage
- `src/styles.css` Tokens für beide Modes (bereits teils da, ergänzen)

## Phase 2 — Kunden-Portal (Bedarfsmeldung) (nächste Runde)
- Öffentlicher Token-Link `/kunde/$token` für Einrichtungen
- Formular: Datum, Schicht, Qualifikation, Anzahl, Notiz
- Schreibt direkt in `bedarfe` mit `quelle = 'kundenportal'`
- Toast/Benachrichtigung im Dashboard ("Neue Bedarfe (3)")

## Phase 3 — E-Mail-Integration (später)
- Empfehlung: **Gmail-Connector** (eingehende Anfragen lesen) + **Lovable Emails** (Bestätigungen senden)
- Eingehende E-Mails per Server-Function listen → mit demselben KI-Parser verarbeiten
- "Einsatz bestätigen"-Button sendet Bestätigungsmail an Einrichtung + Mitarbeiter

---

### Technische Details Phase 1
- **Neue Datei**: `src/lib/anfrage-parser.functions.ts` — `parseAnfrageText` ServerFn → Lovable AI Gateway
- **Neue Datei**: `src/lib/dispo-vorschlag.functions.ts` — `getVerfuegbareMitarbeiter({ datum, dienst, qualifikation })`
- **Neue Route**: `src/routes/_authenticated.anfragen.tsx`
- **Erweitert**: `src/routes/_authenticated.tsx` — Nav-Item "Anfragen", Theme-Toggle
- **Erweitert**: `src/styles.css` — Light-Mode-Tokens prüfen/ergänzen
- **Komponente**: `ThemeToggle` mit Sonne/Mond-Icon

Soll ich mit **Phase 1** starten?