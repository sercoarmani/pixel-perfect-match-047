// ============================================================
// Zentrale Dispo-Logik (eine Quelle der Wahrheit).
//
// Diese Datei ist bewusst "isomorph": rein funktional, ohne Server-
// oder Client-spezifische Imports. Sie wird sowohl von den Server-
// Functions (Vorschlags-Engine, Bedarf-Zusage) als auch im Browser
// (Planungsmatrix, Konflikt-Anzeige) verwendet, damit überall
// dieselben Regeln gelten.
// ============================================================

export type Dienst = "F" | "S" | "N";

export type Qualifikation =
  | "PFK" | "PHK" | "GuK" | "PFA" | "PFM" | "PFF"
  | "Azubi" | "Berufserfahrung" | "LG1_LG2" | "Krankenschwester";

/** Welche Mitarbeiter-Qualifikationen decken eine Fachkraft-Anforderung (PFK)? */
export const FACHKRAFT_QUALS: Qualifikation[] = [
  "PFK", "PFM", "PFF", "GuK", "Krankenschwester", "PFA",
];

/**
 * Deckt die Qualifikation eines Mitarbeiters den angeforderten Bedarf?
 * - PHK-Bedarf:  jede Qualifikation ist zulässig (auch Fachkräfte).
 * - PFK-Bedarf:  nur examinierte Fachkräfte (siehe FACHKRAFT_QUALS).
 * - sonst:       exakter Abgleich (Fallback, falls erweitert wird).
 */
export function qualErfuellt(maQual: string, bedarfQual: string): boolean {
  if (bedarfQual === "PHK") return true;
  if (bedarfQual === "PFK") return FACHKRAFT_QUALS.includes(maQual as Qualifikation);
  return maQual === bedarfQual;
}

/**
 * Ist der Dienst für den Mitarbeiter erlaubt?
 * Leere/fehlende Liste = keine Einschränkung (alle Dienste möglich).
 */
export function dienstMoeglich(
  dienste: readonly string[] | null | undefined,
  dienst: string,
): boolean {
  if (!Array.isArray(dienste) || dienste.length === 0) return true;
  return dienste.includes(dienst);
}

/** Einsatz-Status, in denen ein Einsatz den Mitarbeiter an dem Tag belegt. */
export const AKTIVE_EINSATZ_STATUS = new Set([
  "GEPLANT", "INTERN", "ZUR_UEBERPRUEFUNG", "BESTAETIGT",
]);

export function einsatzBelegt(status: string): boolean {
  return AKTIVE_EINSATZ_STATUS.has(status);
}

/** Mitarbeiter-Status, der eine Einplanung grundsätzlich ausschließt. */
export const GESPERRTE_MA_STATUS = new Set(["gesperrt", "austritt", "inaktiv"]);

export function maEinplanbar(ma: { aktiv?: boolean; status?: string | null }): boolean {
  if (ma.aktiv === false) return false;
  if (ma.status && GESPERRTE_MA_STATUS.has(ma.status)) return false;
  return true;
}

// ---------- Sortierung der Vorschläge ----------
export const ANSTELLUNG_RANK: Record<string, number> = {
  Vollzeit: 0, Teilzeit: 1, Minijob: 2,
};

export function qualRank(q: string): number {
  return FACHKRAFT_QUALS.includes(q as Qualifikation) ? 0 : 1;
}

// ============================================================
// Konflikt-Erkennung (für Matrix & Server-Guard)
// ============================================================
export type EinsatzLike = {
  id?: string;
  mitarbeiter_id: string;
  datum: string;
  dienst: string;
  status: string;
};
export type AbwLike = { mitarbeiter_id: string; datum: string };

export type KonfliktInfo = {
  /** Schlüssel `${mitarbeiter_id}|${datum}` mit >1 belegendem Einsatz. */
  doppelbelegung: Set<string>;
  /** Schlüssel `${mitarbeiter_id}|${datum}`: Einsatz an einem Abwesenheitstag. */
  abwesendTrotzEinsatz: Set<string>;
};

export function cellKey(mitarbeiter_id: string, datum: string): string {
  return `${mitarbeiter_id}|${datum}`;
}

export function findeKonflikte(
  einsaetze: EinsatzLike[],
  abwesenheiten: AbwLike[],
): KonfliktInfo {
  const proTag = new Map<string, number>();
  for (const e of einsaetze) {
    if (!einsatzBelegt(e.status)) continue;
    const k = cellKey(e.mitarbeiter_id, e.datum);
    proTag.set(k, (proTag.get(k) ?? 0) + 1);
  }
  const doppelbelegung = new Set<string>();
  proTag.forEach((n, k) => { if (n > 1) doppelbelegung.add(k); });

  const abwKeys = new Set(
    abwesenheiten.map((a) => cellKey(a.mitarbeiter_id, a.datum)),
  );
  const abwesendTrotzEinsatz = new Set<string>();
  for (const e of einsaetze) {
    if (!einsatzBelegt(e.status)) continue;
    const k = cellKey(e.mitarbeiter_id, e.datum);
    if (abwKeys.has(k)) abwesendTrotzEinsatz.add(k);
  }
  return { doppelbelegung, abwesendTrotzEinsatz };
}

export function hatKonflikt(info: KonfliktInfo, mitarbeiter_id: string, datum: string): boolean {
  const k = cellKey(mitarbeiter_id, datum);
  return info.doppelbelegung.has(k) || info.abwesendTrotzEinsatz.has(k);
}

// ============================================================
// Gemeinsame Konstanten für Kennzahlen
// ============================================================
/** Obergrenze für plausible Reaktionszeiten (Stunden) – Ausreißerfilter. */
export const REAKTION_MAX_STUNDEN = 24 * 30; // 30 Tage
