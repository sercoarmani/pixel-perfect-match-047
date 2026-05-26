## Änderungen

### 1. Planungsmatrix immer monatlich (ab dem 1.)
`src/routes/_authenticated.plan.tsx` & `src/lib/dispo-utils.ts`
- Anker auf `startOfMonth(new Date())` setzen statt Wochenstart.
- Datumsbereich = ganzer Monat (28–31 Tage), Tag-Auswahl (7/14/28) durch Monatsnavigation ersetzen: «‹ Vormonat | Aktueller Monatname | Folgemonat ›» + «Heute».
- Neue Helfer `monthRange(anchor)` in `dispo-utils.ts`.

### 2. Einzelnen Mitarbeiter in Planungsmatrix wählen
- Neues Select „Mitarbeiter" oben (zwischen Anstellung-Filter und Monatsnav): „Alle" + Liste aller geladenen Mitarbeiter (sortiert nach Kürzel).
- Filterlogik in `grouped` ergänzen.

### 3. Status „Krank" in Planungsmatrix
- Im Zellen-Dialog (`EinsatzDialog`) zusätzlich eine Schaltfläche „Als krank markieren" → legt `abwesenheit` mit `art = krank_mit_AU` an (oder Select `krank_mit_AU` / `krank_ohne_AU`).
- Anzeige in der Zelle: rote Pille statt grauem Italic für `krank_*`.
- Neue Server-Funktionen in `src/lib/dispo.functions.ts`: `upsertAbwesenheit({ mitarbeiter_id, datum, art, notiz })` und `deleteAbwesenheit({ id })`.

### 4. Mitarbeiter bearbeiten: aktiv/inaktiv
`src/routes/_authenticated.mitarbeiter.tsx` – `EditDialog`
- Schalter „Status: aktiv/inaktiv" (identisch zum bereits funktionierenden Einrichtungs-Schalter) ergänzen; `aktiv` wird bereits korrekt gespeichert, der UI-Toggle fehlt nur noch.

### 5. Einrichtungen-Dialog: Feldreihenfolge & Status
`src/routes/_authenticated.einrichtungen.tsx` – `EditDialog`
- Felder umsortieren auf: Träger → Name → Ort → Kontaktperson → Telefon → E-Mail → VS-Satz PFK → VS-Satz PHK → Status (aktiv/inaktiv).
- Neues Träger-Auswahlfeld (Select) inkl. Inline-Anlage neuer Träger.
- Tabelle: Status-Spalte zeigt aktiv UND inaktiv (existiert; Default-Filter auf „alle" stellen, statt „aktiv").
- Server-Funktionen: `listTraeger`, `createTraeger` ergänzen (falls noch nicht vorhanden).

### 6. Sidebar / Datei-Import & Datei-Export
`src/routes/_authenticated.tsx` (Sidebar) + neuer Route-Eintrag
- „Excel-Import" → umbenennen in **„Datei-Import"** (Route `/import` bleibt).
- Neuer Eintrag direkt darunter: **„Datei-Export"** (Route `/export`).
- Neue Routendatei `src/routes/_authenticated.export.tsx`:
  - Exporte für Mitarbeiter, Einrichtungen, Einsätze, Abwesenheiten — jeweils als Excel (.xlsx) **und** PDF.
  - Zusätzlich Planungsliste (aktueller Monat / wählbar) als Excel und PDF (nutzt vorhandene Funktionen in `excel-planungsliste.ts`).
- Bestehende `excel-planungsliste.ts` wird wiederverwendet; für die anderen Entitäten kleine generische Tabellen-Exporter.

## Nicht enthalten
- Keine Datenbank-Migrationen nötig (Schema reicht aus).
- Keine Änderungen an Auth / RLS.
