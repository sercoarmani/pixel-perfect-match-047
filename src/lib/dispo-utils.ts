import { format, addDays, startOfWeek, startOfMonth, endOfMonth, differenceInCalendarDays, parseISO } from "date-fns";
import { de } from "date-fns/locale";

export const DIENSTE = ["F", "S", "N"] as const;
export type Dienst = (typeof DIENSTE)[number];

export const DIENST_LABEL: Record<Dienst, string> = { F: "Früh", S: "Spät", N: "Nacht" };
export const DIENST_KURZ: Record<Dienst, string> = { F: "F", S: "S", N: "N" };

export type EinsatzStatus = "GEPLANT" | "INTERN" | "ZUR_UEBERPRUEFUNG" | "BESTAETIGT" | "AUSGEPLANT" | "ABGESAGT";

export const STATUS_LABEL: Record<EinsatzStatus, string> = {
  GEPLANT: "Geplant",
  INTERN: "Intern",
  ZUR_UEBERPRUEFUNG: "Prüfung",
  BESTAETIGT: "Bestätigt",
  AUSGEPLANT: "Ausgeplant",
  ABGESAGT: "Abgesagt",
};

export const STATUS_CLASS: Record<EinsatzStatus, string> = {
  GEPLANT: "bg-status-geplant text-status-geplant-fg",
  INTERN: "bg-status-intern text-status-intern-fg",
  ZUR_UEBERPRUEFUNG: "bg-status-pruefung text-status-pruefung-fg",
  BESTAETIGT: "bg-status-bestaetigt text-status-bestaetigt-fg",
  AUSGEPLANT: "bg-status-ausgeplant text-status-ausgeplant-fg",
  ABGESAGT: "bg-status-abgesagt text-status-abgesagt-fg",
};

export function buildDateRange(from: Date, days: number): Date[] {
  return Array.from({ length: days }, (_, i) => addDays(from, i));
}

export function fmtIsoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function fmtShort(d: Date) {
  return format(d, "EEE dd.MM.", { locale: de });
}

export function fmtLong(d: Date) {
  return format(d, "EEEE, dd. MMMM yyyy", { locale: de });
}

export function weekStart(d: Date) {
  return startOfWeek(d, { weekStartsOn: 1 });
}

export function monthRange(anchor: Date): Date[] {
  const s = startOfMonth(anchor);
  const e = endOfMonth(anchor);
  const n = differenceInCalendarDays(e, s) + 1;
  return Array.from({ length: n }, (_, i) => addDays(s, i));
}

export function parseDate(s: string) {
  return parseISO(s);
}
