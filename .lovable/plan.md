## Ziel

Verhindern, dass PDF- und Excel-Export gleichzeitig ausgelöst werden können.

## Betroffene Stellen

1. **`src/routes/_authenticated.plan.tsx`** (Planungsmatrix-Header)
   - Aktuell sind beide Buttons nur über `disabled={isLoading}` (Datenladen) gesperrt, nicht aber während eines laufenden Exports.

2. **`src/routes/_authenticated.mitarbeiter.tsx`** (`PdfButton`-Komponente)
   - Bereits korrekt umgesetzt — `loading`-State sperrt beide Buttons. Hier ist nichts zu tun.

## Änderung

In `_authenticated.plan.tsx`:
- Einen gemeinsamen State `const [exporting, setExporting] = useState<null | "pdf" | "xlsx">(null)` einführen.
- Beide Export-Handler in `try/finally` setzen den State auf `"pdf"` bzw. `"xlsx"` und am Ende auf `null` zurück.
- Beide Buttons mit `disabled={isLoading || exporting !== null}` versehen.
- Optional kleine Lade-Indikation am gerade aktiven Button (Text z. B. "PDF…" / "Excel…").

Keine weiteren Dateien betroffen, keine Logik-Änderung am Export selbst.
