import * as XLSX from "xlsx";

export type EinrichtungOut = {
  name: string; traeger?: string | null; ort?: string | null;
  wohnbereich?: string | null; vs_satz_pfk?: number | null; vs_satz_phk?: number | null;
  notiz?: string | null;
  /** 1-basierte Excel-Zeilennummer der ersten erkannten Quelle */
  source_row?: number;
  /** Originaler Zell-Text aus Spalte B vor der Bereinigung */
  raw_label?: string;
};
export type MitarbeiterOut = {
  vorname: string; nachname: string; kuerzel: string;
  qualifikation: string; anstellung: "Vollzeit" | "Teilzeit" | "Minijob";
  wohnort?: string | null; notiz?: string | null;
};
export type EinsatzOut = {
  mitarbeiter_kuerzel: string; einrichtung_name: string;
  datum: string; dienst: "F" | "S" | "N";
  status: "GEPLANT" | "ZUR_UEBERPRUEFUNG" | "INTERN" | "BESTAETIGT" | "ABGESAGT" | "AUSGEPLANT";
  notiz?: string | null;
};
export type AbwesenheitOut = {
  mitarbeiter_kuerzel: string; datum: string;
  art: "Urlaub" | "Wunschfrei" | "krank_mit_AU" | "krank_ohne_AU" | "unbezahlter_Urlaub";
  notiz?: string | null;
};
export type ParseResult = {
  einrichtungen: EinrichtungOut[];
  mitarbeiter: MitarbeiterOut[];
  einsaetze: EinsatzOut[];
  abwesenheiten: AbwesenheitOut[];
  warnings: string[];
};

const KUERZEL_RE = /^[A-ZÄÖÜ]{2,4}$/;

function toIsoDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(epoch.getTime() + v * 86400000);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const s = v.trim();
    // ISO bereits korrekt (JJJJ-MM-TT[...])
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // deutsches Format TT.MM.JJJJ oder TT/MM/JJJJ
    const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function cleanEinrichtungName(s: string): { name: string; ort?: string; wb?: string; pfk?: number; phk?: number } {
  let str = String(s).replace(/\s+/g, " ").trim();
  let pfk: number | undefined, phk: number | undefined;
  // VS / PFK / PHK Sätze
  const pfkM = str.match(/PFK[^0-9]{0,8}(\d{1,3}[.,]\d{1,2})/i);
  if (pfkM) pfk = Number(pfkM[1].replace(",", "."));
  const phkM = str.match(/PHK[^0-9]{0,8}(\d{1,3}[.,]\d{1,2})/i);
  if (phkM) phk = Number(phkM[1].replace(",", "."));
  const vsM = str.match(/VS[^0-9]{0,8}(\d{1,3}[.,]\d{1,2})/i);
  if (vsM && pfk === undefined) pfk = Number(vsM[1].replace(",", "."));
  // strip everything from first numeric Satz onwards if present
  str = str.replace(/\s+(VS|PFK|PHK|Flex)\b.*/i, "").trim();
  // trailing shift label (z. B. "Haus am Park Spät") entfernen – die Schicht
  // wird separat erkannt, der Einrichtungsname bleibt eindeutig.
  str = str.replace(/\s+(Früh|Frueh|Spät|Spaet|Nacht|FD|SD|ND)\s*$/i, "").trim();
  // wohnbereich at end (WB1, WB2, RD11 etc.)
  const wbM = str.match(/\s+(WB\d+|RD\d+)$/i);
  const wb = wbM?.[1];
  if (wbM) str = str.slice(0, wbM.index).trim();
  return { name: str, wb, pfk, phk };
}

function parseMitarbeiterLine(text: string): { vorname: string; nachname: string; wohnort?: string; qual?: string; anst?: "Vollzeit" | "Teilzeit" | "Minijob" } | null {
  const parts = text.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 1) return null;
  const nameRaw = parts[0];
  const nm = nameRaw.match(/^(.+?),\s*(.+)$/);
  if (!nm) return null;
  const nachname = nm[1].trim();
  const vorname = nm[2].trim();
  let wohnort: string | undefined;
  let anst: "Vollzeit" | "Teilzeit" | "Minijob" | undefined;
  const rest: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (/^TK$/i.test(p)) { anst = "Teilzeit"; continue; }
    if (/^VK$/i.test(p)) { anst = "Vollzeit"; continue; }
    rest.push(p);
  }
  if (rest.length >= 1) wohnort = rest[0];
  const qual = rest[1];
  return { vorname, nachname, wohnort, qual, anst };
}

const QUAL_MAP: Record<string, string> = {
  PFK: "PFK", PHK: "PHK", GuK: "GuK", GUK: "GuK", PFA: "PFA", PFM: "PFM", PFF: "PFF",
  Azubi: "Azubi", AZUBI: "Azubi",
  Berufserfahrung: "Berufserfahrung",
  Krankenschwester: "Krankenschwester",
  "LG1/LG2": "LG1_LG2", "LG1_LG2": "LG1_LG2",
  GuKik: "GuK",
};
function normalizeQual(raw: string | undefined, fallback: "PFK" | "PHK"): string {
  if (!raw) return fallback;
  const t = raw.replace(/\s+/g, "");
  if (QUAL_MAP[t]) return QUAL_MAP[t];
  if (/^GuK/i.test(t)) return "GuK";
  if (/Krankenschwester/i.test(t)) return "Krankenschwester";
  if (/Berufserfahrung/i.test(t)) return "Berufserfahrung";
  if (/Azubi/i.test(t)) return "Azubi";
  if (/^LG/i.test(t)) return "LG1_LG2";
  return fallback;
}

/** Schicht aus einer Zeilen-/Einrichtungsbezeichnung ableiten (falls vorhanden). */
function rowDienst(label: string): "F" | "S" | "N" | null {
  const l = (label ?? "").toLowerCase();
  if (/(spät|spaet|spätdienst|\bsd\b|\bs-?dienst\b)/.test(l)) return "S";
  if (/(nacht|nachtdienst|\bnd\b|\bn-?dienst\b)/.test(l)) return "N";
  if (/(früh|frueh|frühdienst|\bfd\b|\bf-?dienst\b)/.test(l)) return "F";
  return null;
}

/**
 * Eine Matrix-Zelle deuten. Erlaubt:
 *   "MUA"        -> Kürzel, Status geplant
 *   "MUA*"       -> Anfrage versendet (ZUR_UEBERPRUEFUNG)
 *   "MUA S" / "MUA-S" / "MUA/N" -> Kürzel mit expliziter Schicht
 *   "(MUA)" / "(MUA S)"         -> Abwesenheit/Urlaub
 */
function parseCellToken(
  s: string,
): { kuerzel: string; dienst: "F" | "S" | "N" | null; star: boolean; absence: boolean } | null {
  let str = (s ?? "").trim();
  if (!str) return null;
  const par = str.match(/^\(\s*([A-ZÄÖÜ]{2,4})\s*([FSN])?\s*\)$/i);
  if (par) {
    return { kuerzel: par[1].toUpperCase(), dienst: (par[2]?.toUpperCase() as any) ?? null, star: false, absence: true };
  }
  const star = /\*/.test(str);
  str = str.replace(/\*/g, "").trim();
  const m = str.match(/^([A-ZÄÖÜ]{2,4})\s*[-/ ]?\s*([FSN])?$/i);
  if (!m) return null;
  return { kuerzel: m[1].toUpperCase(), dienst: (m[2]?.toUpperCase() as any) ?? null, star, absence: false };
}

export async function parsePlanungsliste(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const warnings: string[] = [];

  const sheetName = wb.Sheets["Planungsliste"] ? "Planungsliste" : wb.SheetNames[0];
  if (!wb.Sheets["Planungsliste"]) {
    warnings.push(`Sheet "Planungsliste" nicht gefunden – verwende stattdessen "${sheetName}".`);
  }
  const sheet = wb.Sheets[sheetName];
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

  // Datumszeile flexibel suchen: die Zeile (innerhalb der ersten ~8) mit den
  // meisten erkennbaren Datumswerten ab Spalte C dient als Kopfzeile.
  let headerRow = 0;
  let dateCols: { col: number; iso: string }[] = [];
  const scanTo = Math.min(grid.length, 8);
  for (let r = 0; r < scanTo; r++) {
    const row = grid[r] ?? [];
    const found: { col: number; iso: string }[] = [];
    for (let c = 2; c < row.length; c++) {
      const iso = toIsoDate(row[c]);
      if (iso) found.push({ col: c, iso });
    }
    if (found.length > dateCols.length) { dateCols = found; headerRow = r; }
  }
  if (dateCols.length === 0) {
    warnings.push("Keine Datumsspalten erkannt (erwartet Datumswerte ab Spalte C in einer der ersten Zeilen).");
  } else if (headerRow > 0) {
    warnings.push(`Datums-Kopfzeile in Zeile ${headerRow + 1} erkannt.`);
  }
  const isoSorted = dateCols.map((d) => d.iso).sort();
  if (isoSorted.length > 0) {
    warnings.push(`Zeitraum: ${isoSorted[0]} bis ${isoSorted[isoSorted.length - 1]} (${dateCols.length} Tage).`);
  }

  // Find Mitarbeiter section start: first row where col1 = "PFK Minijob" / contains "Minijob" / "PFK" header text
  // Detection: row where col B and col J both contain word "Minijob" or "Kürzel" header keywords.
  let maHeaderRow = -1;
  for (let r = 0; r < grid.length; r++) {
    const b = String(grid[r]?.[1] ?? "");
    const c = String(grid[r]?.[2] ?? "");
    if (/Minijob/i.test(b) && /Kürzel|Kuerzel/i.test(c)) { maHeaderRow = r; break; }
  }
  if (maHeaderRow < 0) {
    for (let r = 0; r < grid.length; r++) {
      const b = String(grid[r]?.[1] ?? "");
      if (/^PFK\s+(Minijob|Vollzeit|Teilzeit)/i.test(b)) { maHeaderRow = r; break; }
    }
  }
  const einrichtungEnd = maHeaderRow > 0 ? maHeaderRow : Math.min(grid.length, 110);

  // ---- Parse Einrichtungen + Einsätze + Abwesenheiten (matrix part) ----
  const einrichtungenMap = new Map<string, EinrichtungOut>();
  const einsaetze: EinsatzOut[] = [];
  const abwesenheiten: AbwesenheitOut[] = [];
  const ABSENCE_KEYWORDS = ["wunschfrei", "urlaub", "krank", "unbezahlt"];
  let unmatchedCells = 0;

  // detect absence section start in matrix (column A often spells "MABEMERKUNGEN")
  for (let r = headerRow + 1; r < einrichtungEnd; r++) {
    const row = grid[r] ?? [];
    const bRaw = row[1] != null ? String(row[1]) : "";
    const bLower = bRaw.toLowerCase();
    const isAbsenceRow = ABSENCE_KEYWORDS.some((k) => bLower.includes(k));
    // Schicht-Hinweis aus der (Roh-)Zeilenbezeichnung, z. B. "Haus am Park Spät".
    const rowShift = rowDienst(bRaw);

    let einrichtungName: string | null = null;
    if (!isAbsenceRow && bRaw.trim() && !/^\s*$/.test(bRaw)) {
      const cleaned = cleanEinrichtungName(bRaw);
      if (cleaned.name && cleaned.name.length > 3 && !/^keine\s/i.test(cleaned.name)) {
        einrichtungName = cleaned.name;
        if (!einrichtungenMap.has(einrichtungName)) {
          einrichtungenMap.set(einrichtungName, {
            name: einrichtungName,
            wohnbereich: cleaned.wb ?? null,
            vs_satz_pfk: cleaned.pfk ?? null,
            vs_satz_phk: cleaned.phk ?? null,
            ort: cleaned.ort ?? null,
            source_row: r + 1,
            raw_label: bRaw.trim(),
          });
        }
      }
    }

    // walk date cols
    for (const { col, iso } of dateCols) {
      const v = row[col];
      if (v == null || v === "") continue;
      const tok = parseCellToken(String(v));
      if (!tok) { unmatchedCells++; continue; }
      if (tok.absence) {
        abwesenheiten.push({ mitarbeiter_kuerzel: tok.kuerzel, datum: iso, art: "Urlaub" });
        continue;
      }
      if (isAbsenceRow) {
        const art: AbwesenheitOut["art"] = bLower.includes("wunschfrei")
          ? "Wunschfrei"
          : bLower.includes("unbezahlt")
          ? "unbezahlter_Urlaub"
          : bLower.includes("krank")
          ? "krank_ohne_AU"
          : "Urlaub";
        abwesenheiten.push({ mitarbeiter_kuerzel: tok.kuerzel, datum: iso, art });
      } else if (einrichtungName) {
        einsaetze.push({
          mitarbeiter_kuerzel: tok.kuerzel,
          einrichtung_name: einrichtungName,
          datum: iso,
          // Schicht: Zelle > Zeilenbezeichnung > Standard (Früh)
          dienst: tok.dienst ?? rowShift ?? "F",
          status: tok.star ? "ZUR_UEBERPRUEFUNG" : "GEPLANT",
        });
      } else {
        unmatchedCells++;
      }
    }
  }

  // ---- Parse Mitarbeiter sections (lower part) ----
  const mitarbeiterMap = new Map<string, MitarbeiterOut>();
  if (maHeaderRow >= 0) {
    let currentAnst: "Minijob" | "Vollzeit" | "Teilzeit" = "Minijob";
    for (let r = maHeaderRow; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const b = String(row[1] ?? "");
      const j = String(row[9] ?? "");
      // Section header detection
      if (/Minijob/i.test(b) && /Kürzel|Kuerzel/i.test(String(row[2] ?? ""))) {
        // determine anstellung from header keywords
        if (/Minijob/i.test(b)) currentAnst = "Minijob";
        else if (/Vollzeit/i.test(b)) currentAnst = "Vollzeit";
        else if (/Teilzeit/i.test(b)) currentAnst = "Teilzeit";
        continue;
      }
      if (/^PFK\s+Vollzeit|^PFK\s+Teilzeit|^PFK_VZ|^PFK_TZ/i.test(b)) {
        currentAnst = /Vollzeit|VZ/i.test(b) ? "Vollzeit" : "Teilzeit";
      }
      const aVal = row[0];
      const isMaRow = typeof aVal === "number" && Number.isFinite(aVal);
      if (!isMaRow) continue;

      // PFK column: B (name) + C (kuerzel)
      const pfkKuerzelRaw = String(row[2] ?? "").trim();
      if (b && pfkKuerzelRaw && !/^\(/.test(pfkKuerzelRaw) && KUERZEL_RE.test(pfkKuerzelRaw)) {
        const p = parseMitarbeiterLine(b);
        if (p) {
          const anst = p.anst ?? currentAnst;
          const key = pfkKuerzelRaw;
          if (!mitarbeiterMap.has(key)) {
            mitarbeiterMap.set(key, {
              vorname: p.vorname, nachname: p.nachname, kuerzel: key,
              qualifikation: normalizeQual(p.qual, "PFK") as any,
              anstellung: anst, wohnort: p.wohnort ?? null,
            });
          }
        }
      }
      // PHK column: J (name) + K (kuerzel)
      const phkKuerzelRaw = String(row[10] ?? "").trim();
      if (j && phkKuerzelRaw && !/^\(/.test(phkKuerzelRaw) && KUERZEL_RE.test(phkKuerzelRaw)) {
        const p = parseMitarbeiterLine(j);
        if (p) {
          const anst = p.anst ?? currentAnst;
          const key = phkKuerzelRaw;
          if (!mitarbeiterMap.has(key)) {
            mitarbeiterMap.set(key, {
              vorname: p.vorname, nachname: p.nachname, kuerzel: key,
              qualifikation: normalizeQual(p.qual, "PHK") as any,
              anstellung: anst, wohnort: p.wohnort ?? null,
            });
          }
        }
      }
    }
  }

  if (unmatchedCells > 0) {
    warnings.push(`${unmatchedCells} Zelle(n) konnten nicht zugeordnet werden (kein gültiges Kürzel).`);
  }
  if (einsaetze.length > 0) {
    const dist = einsaetze.reduce(
      (acc: Record<string, number>, e) => { acc[e.dienst] = (acc[e.dienst] ?? 0) + 1; return acc; },
      {},
    );
    warnings.push(`Einsätze nach Dienst: F ${dist.F ?? 0} · S ${dist.S ?? 0} · N ${dist.N ?? 0}.`);
    if (!dist.S && !dist.N) {
      warnings.push(
        'Hinweis: keine Spät-/Nachtdienste erkannt. Schicht wird je Zelle ("MUA S") ' +
        'oder je Zeile ("… Spät") gelesen – sonst gilt Früh als Standard.',
      );
    }
  }

  return {
    einrichtungen: Array.from(einrichtungenMap.values()),
    mitarbeiter: Array.from(mitarbeiterMap.values()),
    einsaetze,
    abwesenheiten,
    warnings,
  };
}
