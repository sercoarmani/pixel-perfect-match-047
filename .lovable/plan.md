## Ziel

1. Der rote Badge „Anfrage Kunden" in der Sidebar soll exakt die Anzahl der roten „offen"-Zeilen in `/anfragen/kunden` widerspiegeln (aktuell zählt er nur die `anfragen`-Tabelle und zeigt deshalb 2 statt ~69).
2. Zeilen in `/anfragen/kunden` werden so sortiert, dass heutige und zukünftige Zeiträume zuerst (aufsteigend) erscheinen, vergangene danach (ebenfalls aufsteigend).

## Änderungen

### 1. `src/lib/sidebar-counts.functions.ts`
- Zusätzlich zur Anfragen-Zählung alle offenen Bedarfe abfragen (`bedarfe.status='offen'`, nur `einrichtung_id, datum, dienst`).
- Serverseitig nach `(einrichtung_id, datum, dienst)` deduplizieren (gleiche Logik wie in der UI).
- `anfragenKunden = (anfragen.offen & empfaenger_typ='einrichtung' & typ='bedarf') + distinct(bedarfe.offen)`.

### 2. `src/components/anfragen-view.tsx`
- Sortier-Vergleicher anpassen:
  - Sortierdatum jeder Anfrage-Zeile = `zeitraum_von`, jeder Bedarf-Zeile = `datum` (unverändert).
  - Heute (`yyyy-MM-dd`) als Schwelle: Einträge mit `sortDate >= today` zuerst, aufsteigend; danach Einträge mit `sortDate < today`, aufsteigend.

Keine Änderungen an Spalten, Styling oder Server-Funktion `listOffeneBedarfe`/`listAnfragen`.

## Verifikation

- DB-Abgleich per `psql`: erwarteter Sidebar-Count = `count(anfragen offen, einrichtung, bedarf)` + `count(DISTINCT (einrichtung_id, datum, dienst)) FROM bedarfe WHERE status='offen'`.
- Visuelle Prüfung in `/anfragen/kunden`: Sidebar-Zahl = Anzahl roter Badges in der Tabelle; oberste Zeile hat `Zeitraum >= heute`.
