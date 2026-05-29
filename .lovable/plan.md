## Was im ZIP enthalten ist

Laut `CHANGELOG-OPTIMIERUNG.md` enthält das Paket:

1. **Neues Modul `src/lib/matching.ts`** — vereinheitlichte Dispo-/Matching-Logik (Qualifikation, Verfügbarkeit, Konflikte, Reaktionszeit-Konstante).
2. **Doppelbelegung sichtbar machen** in `_authenticated.plan.tsx` (Konflikt-Markierung, „Bedarfsspur") + Guard im `upsertEinsatz`.
3. **Bedarf mit `anzahl > 1`** wird in `bedarfZusage` korrekt gezählt.
4. **Mitarbeiter-Formular** um Dispo-Felder (`umkreis_km`, `dienste_moeglich`, `max_einsaetze`, `status`) erweitert.
5. **Parser & Exporte robuster** (`planungsliste-parser.ts`, `excel-*`, `pdf-dienstplan.ts`).
6. **Zwei neue Migrationen**
   - `20260529160000_fix_einsaetze_delete_cascade.sql` — repariert die FKs `einsaetze → mitarbeiter/einrichtung` zurück auf `ON DELETE CASCADE`.
   - `20260529170000_einsatz_no_doppelbelegung.sql` — bereinigt vorhandene Doppelbelegungen und legt einen partiellen UNIQUE-Index `(mitarbeiter_id, datum)` für aktive Status an.

## Geänderte/neue Dateien (genau diese werden überschrieben)

Neu:
- `src/lib/matching.ts`

Überschrieben:
- `src/lib/dispo.functions.ts`
- `src/lib/anfrage-ai.functions.ts`
- `src/lib/planungsliste-parser.ts`
- `src/lib/excel-planungsliste.ts`
- `src/lib/excel-dienstplan.ts`
- `src/lib/pdf-dienstplan.ts`
- `src/routes/_authenticated.plan.tsx`
- `src/routes/_authenticated.mitarbeiter.tsx`
- `src/routes/_authenticated.tsx`

`src/routeTree.gen.ts` wird **nicht** angefasst (wird vom Vite-Plugin generiert).

## Wichtig — Konflikt mit deinem letzten Wunsch

Die optimierte `src/routes/_authenticated.tsx` **schaltet den Login-Schutz wieder ein** (Redirect auf `/login` bei fehlender Session). Du hattest vorher gesagt: „Anmeldung erstmal raus solange ich am Projekt arbeite".

Optionen:
- **A)** Optimierung 1:1 einspielen → Login ist wieder aktiv.
- **B)** Optimierung einspielen, aber den Login-Redirect in `_authenticated.tsx` weiterhin deaktiviert lassen (Dev-Modus wie zuletzt).

Ich empfehle **B**, bis du den Login wieder aktivieren möchtest.

## Umsetzungsschritte

1. Die zwei Migrationen über das Datenbank-Migrationstool ausführen (zuerst `…160000_fix_einsaetze_delete_cascade`, dann `…170000_einsatz_no_doppelbelegung`). Du bekommst eine Freigabe-Aufforderung pro Migration.
2. Alle oben gelisteten Code-Dateien aus dem ZIP übernehmen (parallel kopieren).
3. Bei Wahl **B** in `_authenticated.tsx` den `Navigate to="/login"`-Block entfernen und den „Entwicklungsmodus"-Footer beibehalten — Rest der Datei wie im ZIP.
4. Build/Typecheck läuft automatisch; Ergebnis prüfen.

## Bitte entscheide

- Variante **A** (Login wieder an) oder **B** (Login bleibt aus)?
