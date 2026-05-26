import * as XLSX from "xlsx";

export type EinrichtungOut = {
  name: string; traeger?: string | null; ort?: string | null;
  wohnbereich?: string | null; vs_satz_pfk?: number | null; vs_satz_phk?: number | null;
  notiz?: string | null;
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
    const m = v.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
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

export async function parsePlanungsliste(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const sheet = wb.Sheets["Planungsliste"] ?? wb.Sheets[wb.SheetNames[0]];
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const warnings: string[] = [];

  // Row 0 = header; date columns (index 2..32)
  const dateCols: { col: number; iso: string }[] = [];
  const header = grid[0] ?? [];
  for (let c = 2; c < header.length; c++) {
    const iso = toIsoDate(header[c]);
    if (iso) dateCols.push({ col: c, iso });
  }
  if (dateCols.length === 0) {
    warnings.push("Keine Datumsspalten in Zeile 1 erkannt.");
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

  // detect absence section start in matrix (column A often spells "MABEMERKUNGEN")
  for (let r = 1; r < einrichtungEnd; r++) {
    const row = grid[r] ?? [];
    const bRaw = row[1] != null ? String(row[1]) : "";
    const bLower = bRaw.toLowerCase();
    const isAbsenceRow = ABSENCE_KEYWORDS.some((k) => bLower.includes(k));

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
          });
        }
      }
    }

    // walk date cols
    for (const { col, iso } of dateCols) {
      const v = row[col];
      if (v == null || v === "") continue;
      const s = String(v).trim();
      // Absence in parentheses (XYZ)
      const parM = s.match(/^\(([A-ZÄÖÜ]{2,4})\)$/);
      if (parM) {
        abwesenheiten.push({
          mitarbeiter_kuerzel: parM[1], datum: iso, art: "Urlaub",
        });
        continue;
      }
      // Asterisk indicates Anfrage versendet → ZUR_UEBERPRUEFUNG
      const starM = s.match(/^([A-ZÄÖÜ]{2,4})\*$/);
      const plainM = s.match(/^([A-ZÄÖÜ]{2,4})$/);
      const kuerzel = starM?.[1] ?? plainM?.[1];
      const status = starM ? "ZUR_UEBERPRUEFUNG" : "GEPLANT";
      if (!kuerzel) continue;
      if (isAbsenceRow) {
        const art: AbwesenheitOut["art"] = bLower.includes("wunschfrei")
          ? "Wunschfrei"
          : bLower.includes("unbezahlt")
          ? "unbezahlter_Urlaub"
          : bLower.includes("krank")
          ? "krank_ohne_AU"
          : "Urlaub";
        abwesenheiten.push({ mitarbeiter_kuerzel: kuerzel, datum: iso, art });
      } else if (einrichtungName) {
        einsaetze.push({
          mitarbeiter_kuerzel: kuerzel,
          einrichtung_name: einrichtungName,
          datum: iso,
          dienst: "F",
          status,
        });
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

  return {
    einrichtungen: Array.from(einrichtungenMap.values()),
    mitarbeiter: Array.from(mitarbeiterMap.values()),
    einsaetze,
    abwesenheiten,
    warnings,
  };
}
