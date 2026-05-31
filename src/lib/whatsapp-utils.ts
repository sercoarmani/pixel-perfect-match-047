// Geteilte Telefon-Helfer – sicher für Client & Server.
export function normalizePhoneE164(p?: string | null): string {
  if (!p) return "";
  return p.replace(/[^\d+]/g, "").replace(/^\+/, "");
}
