# Importierte Einrichtungen überall sichtbar machen

## Ziel
Jede beim Planungslisten-Import erkannte (oder vorhandene) Einrichtung ist nach `Import abgeschlossen` ohne weiteres Zutun
1. in der Einrichtungen-Liste (= Kunden) auffindbar,
2. in der Planungsmatrix mit den richtigen Einsätzen verknüpft,
3. im Bedarfsassistenten als auswählbare Einrichtung verfügbar.

Heute funktioniert das in der Theorie schon (alle drei Bereiche lesen aus `einrichtungen`), scheitert aber in der Praxis an Namens-Mismatches (Leerzeichen, Groß/Klein) und an fehlender Sichtbarkeit im Import-Report. Genau das wird hier geschlossen.

## Was geändert wird

### 1. Namens-Normalisierung als gemeinsamer Schlüssel
- Neue Helfer `normalizeName(s)` (trim + interne Whitespaces auf eines reduzieren) in `src/lib/dispo.functions.ts`.
- `importEinrichtungen` nutzt `normalizeName` für `eq("name", …)`-Lookup **und** speichert den getrimmten Namen. Damit gibt es keine „doppelten" Einrichtungen mehr, nur weil Excel ein Trailing-Space liefert.
- `importEinsaetze` baut `einMap` mit `normalizeName(e.name)` als Key und sucht mit `normalizeName(r.einrichtung_name)`. Gleiches für `mitMap` (kuerzel).

### 2. Garantierte Anlage vor Einsatz-Import
- In `src/routes/_authenticated.import.tsx` `runAll()`: nach `importEi` und vor `importEs` einmal `listEinrichtungen` per ServerFn nachladen und prüfen, dass **jeder distinct `einrichtung_name`** aus `filteredEinsaetze` einen Treffer hat.
- Fehlende Namen → vor dem Einsatz-Import in einem zweiten `importEi`-Call automatisch als Minimal-Einrichtung (`{ name }`) nachgereicht. Damit kann es nie zu „Einrichtung 'X' nicht gefunden"-Fehlern für Zeilen kommen, die wir gerade selbst eingelesen haben.

### 3. Rückgabe inkl. IDs für Direktlinks
- `importEinrichtungen` liefert zusätzlich `created_records: { id, name }[]` und `updated_records: { id, name }[]` (gleiche Liste wie bisher `*_names`, nur mit ID).
- Im Import-Report (`PlanungslistePanel`):
  - „+ Diakonie" / „↺ Diakonie" werden zu klickbaren Links auf `/einrichtungen` (Liste mit vorausgefülltem Suchparameter — siehe Punkt 5).
  - Drei feste Quick-Links unter dem Einrichtungen-Block: **„Einrichtungen-Liste"**, **„Planungsmatrix"**, **„Bedarfsassistent"**, damit du direkt verifizieren kannst, dass die Daten überall ankommen.

### 4. Verifikations-Badge im Report
- Nach `runAll` wird im Report explizit angezeigt: `N von M Einrichtungen aus der Datei sind in der Datenbank vorhanden` (Vergleich zwischen `activeEinrichtungen` und dem frischen `listEinrichtungen`-Snapshot). Bei Lücken Warnung + Auflistung.

### 5. Suche in Einrichtungen-Liste via URL-Param
- `src/routes/_authenticated.einrichtungen.tsx` bekommt `validateSearch` für `?q=…` und übernimmt den Wert in das vorhandene Suchfeld. Damit funktioniert der Direktlink aus dem Import-Report ohne Zusatz-State.

### 6. Cache-Konsistenz (bereits getan, hier nur Verifikation)
- Die im letzten Schritt eingeführte `qc.refetchQueries` + `router.invalidate()`-Logik nach Import deckt Einrichtungen-Tab, Planungsmatrix (`["einsaetze"]`/`["einrichtungen"]`) und Bedarfsassistent (`["einrichtungen"]`) ab. Keine weitere Änderung nötig, nur kurz prüfen.

## Was nicht geändert wird
- Kein neues Datenmodell, keine separate „kunden"-Tabelle — Einrichtungen sind die Kunden (laut Klärung).
- Keine Anpassung an Bedarfsassistent-Logik selbst; er liest bereits `listEinrichtungen` über denselben Query-Key.
- Träger bleibt optional und wird wie zuletzt vereinbart nicht erzwungen.

## Technische Details

### Geänderte/neue Dateien
- `src/lib/dispo.functions.ts`
  - neue Helfer `normalizeName`
  - `importEinrichtungen`: normalisiertes Lookup + `created_records`/`updated_records` mit `id`
  - `importEinsaetze`: normalisierte Map-Keys
- `src/routes/_authenticated.import.tsx`
  - `runAll`: Verifikations-Schritt (Re-Fetch + Nachzügler-Insert + Coverage-Check)
  - Report-UI: Links auf `/einrichtungen?q=<name>`, Quick-Links auf Planungsmatrix & Bedarfsassistent, Coverage-Badge
- `src/routes/_authenticated.einrichtungen.tsx`
  - `validateSearch` für `?q`, Übernahme in Suchfeld via `Route.useSearch()`

### Test (manuell)
1. Planungsliste mit ≥ 3 Einrichtungen importieren (eine bewusst mit Leerzeichen am Ende).
2. Report zeigt für jede Einrichtung einen Link, Coverage „3/3".
3. Klick auf Link öffnet `/einrichtungen?q=Name` → Einrichtung sichtbar.
4. Planungsmatrix öffnen → Einsätze hängen unter derselben Einrichtung.
5. Bedarfsassistent öffnen → Einrichtung im Dropdown auswählbar.