# Problem

Beim Anlegen eines Mitarbeiters ohne ausgefülltes Feld „Kürzel" schlägt die Validierung mit `kuerzel: String must contain at least 1 character(s)` fehl. Der Server-Validator (`src/lib/dispo.functions.ts:187`) verlangt `z.string().min(1).max(20)`, das UI-Formular markiert das Feld aber nicht als Pflichtfeld und gibt keinen Hinweis.

# Lösung

Kürzel wird optional gemacht und beim Anlegen automatisch generiert (eindeutig, max. 20 Zeichen). Beim Bearbeiten bleibt es weiterhin Pflicht (kein leeres Überschreiben eines existierenden Kürzels).

## Änderungen

1. **`src/lib/dispo.functions.ts`** – `upsertMitarbeiter`:
   - `kuerzel` im Validator zu `z.string().max(20).optional()` ändern.
   - Im Handler:
     - Bei vorhandener `id` (Update): wenn `kuerzel` leer/undefined → Feld nicht überschreiben.
     - Bei neuem Datensatz: wenn leer, Kürzel aus `Nachname` (erste 3 Buchstaben, Großbuchstaben, Umlaute ersetzt) + `Vorname` (erster Buchstabe) generieren, Umlaute/Sonderzeichen entfernen. Bei Kollision (`select kuerzel where kuerzel like 'BASIS%'`) numerischen Suffix `2`, `3`, … anhängen, bis frei. Auf max. 20 Zeichen begrenzen.
     - Fallback wenn Vor-/Nachname leer: `MA` + zufälliger 4-Zeichen-Suffix.

2. **`src/routes/_authenticated.mitarbeiter.tsx`** (Zeile 337):
   - Label „Kürzel" um Hinweis ergänzen: `<Field label="Kürzel (optional, wird sonst automatisch erzeugt)">`.
   - Keine Logikänderung im Client.

## Nicht Teil dieses Plans

- Keine DB-Migration; `kuerzel` bleibt `NOT NULL` in der Tabelle.
- Keine Änderungen an Import-Validatoren (Zeile 347, 370, 379) — dort ist Kürzel zwingend.
