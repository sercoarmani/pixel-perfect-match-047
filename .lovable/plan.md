# Fix: Geocoding scheitert mit `ENOTFOUND benli`

## Ursache
In den Server-Logs ist die ausgeführte URL `https://benli/search?...`. Das heißt: das Secret `NOMINATIM_BASE_URL` enthält aktuell den Wert `benli` (oder `https://benli`). DNS findet diesen Host nicht – daher `fetch failed (getaddrinfo ENOTFOUND benli)`. Das ist eine reine Fehlkonfiguration, kein Code-Bug. Der bisherige Fallback in `resolveNominatimBase()` greift nicht, weil `https://benli` formal eine gültige URL ist.

## Schritte

1. **Secret `NOMINATIM_BASE_URL` neu setzen**
   - Den falschen Wert `benli` durch `https://nominatim.openstreetmap.org` ersetzen (oder leer lassen → Code fällt dann automatisch auf diesen Default zurück).
   - Erfolgt über `update_secret` für `NOMINATIM_BASE_URL`.

2. **`src/lib/geocoding.functions.ts` defensiver machen**
   - `resolveNominatimBase()` zusätzlich prüfen: wenn der Hostname keinen Punkt enthält (z. B. `benli`, `localhost`-ähnlich) und nicht explizit `localhost`/`127.0.0.1` ist, auf den Default `https://nominatim.openstreetmap.org` zurückfallen und eine Warnung loggen. So führt eine zukünftige Fehlkonfiguration nicht mehr zu `ENOTFOUND`.
   - Fehlermeldung im UI nutzerfreundlicher: bei `ENOTFOUND` / Netzwerkfehlern `"Geocoding-Dienst nicht erreichbar – bitte Konfiguration prüfen"` zurückgeben, statt rohem `fetch failed (...)`.

3. **Verifikation**
   - Nach Secret-Update einmal „Adresse geokodieren“ in den Einrichtungen ausführen und prüfen, dass Status `ok` wird und `lat/lng` befüllt sind.
   - Server-Logs (`stack_modern--server-function-logs`, filter `geocode`) dürfen keinen `ENOTFOUND` mehr enthalten.

## Geänderte Dateien
- Secret: `NOMINATIM_BASE_URL` (Wert, keine Code-Datei)
- `src/lib/geocoding.functions.ts` (nur `resolveNominatimBase` + Fehlermapping)
