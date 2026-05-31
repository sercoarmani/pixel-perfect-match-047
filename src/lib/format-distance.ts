/**
 * Einheitliches Format für Entfernungen in km – immer mit einer Nachkommastelle
 * und deutschem Dezimaltrennzeichen (z. B. "5,0 km", "12,3 km").
 *
 * Diese Funktion ist die einzige Quelle der Wahrheit für km-Darstellungen
 * in der UI. Bitte überall verwenden, wo Entfernungen angezeigt werden.
 */
const KM_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "–";
  return `${KM_FORMAT.format(km)} km`;
}
