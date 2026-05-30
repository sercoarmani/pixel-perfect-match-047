## Ziel

Die Verbesserungen aus `dispoplan-optimiert-2.zip` (Runde 3: **Mitarbeiter-Self-Service-Portal**) in das aktuelle Projekt integrieren – **ohne** die kürzlich umgesetzten Änderungen zu überschreiben (Sidebar mit „Anfragen von Kunden" / „Verfügbarkeiten Mitarbeiter", `_authenticated.anfragen.tsx` als Redirect, E-Mail-Infrastruktur).

Das ältere ZIP (`dispoplan-optimiert.zip`, Runde 1+2) bringt keine neuen Inhalte mehr – die Migrations sind bereits sinngemäß in `20260529165325` / `20260529165344` umgesetzt. Wir verwenden ausschließlich Runde-3-Deltas aus dem neueren ZIP.

## Was neu reinkommt

**Datenbank** – eine neue Migration:
- `20260530xxxxxx_mitarbeiter_portal.sql` (Inhalt aus `20260529180000_mitarbeiter_portal.sql`): fügt `mitarbeiter.zugangs_token` (eindeutig, Default-Generator), `plz`, `fuehrerschein`, `profil_text` hinzu und vergibt Tokens für Bestands-Mitarbeiter.

**Server-Functions**:
- Neu: `src/lib/mitarbeiter-portal.functions.ts` – Token-Auflösung serverseitig, nur Zugriff auf die eigene `mitarbeiter_id` (Self-Service-Schichtmeldungen, 28-Tage-Fenster, keine fremden Daten).
- Update `src/lib/dispo.functions.ts`: erweiterter `upsertMitarbeiter`-Validator (`plz`, `fuehrerschein`, `profil_text`, `zugangs_token`) + Funktion zum Neu-Erzeugen des Tokens.

**Routen / UI**:
- Neu: `src/routes/m.$token.tsx` – öffentliche, mobiloptimierte Self-Service-Seite (Schichten der nächsten 28 Tage melden/zurücknehmen, vergebene Tage gesperrt).
- Update `src/routes/_authenticated.mitarbeiter.tsx`: im Tab „Verfügbarkeiten & Dienste" Block „Persönlicher Link" mit Kopieren / Neu erzeugen + Felder PLZ, Führerschein, Profiltext.
- Update `src/routes/_authenticated.dispo.tsx`: Broadcast-Knopf „Niemand erreicht" pro offener Anfrage, der einen kopierbaren Standardtext einblendet.

**Typen**: `src/integrations/supabase/types.ts` wird nach der Migration automatisch aktualisiert – nicht manuell editieren.

## Was bewusst NICHT überschrieben wird

- `src/routes/_authenticated.tsx` – aktuelle Sidebar bleibt (Disposition + indentierte „Anfragen von Kunden" / „Verfügbarkeiten Mitarbeiter").
- `src/routes/_authenticated.anfragen.tsx` – bleibt der Redirect auf `/anfragen/kunden`.
- `src/components/anfragen-view.tsx`, `_authenticated.anfragen.kunden.tsx`, `_authenticated.anfragen.mitarbeiter.tsx` – bleiben.
- E-Mail-Infrastruktur (`src/routes/lovable/email/queue/process.ts`, `20260530155054/06/49_email_infra.sql`) – bleibt.
- Alle bereits identischen Dateien (shadcn-UI, `matching.ts`, `plan.tsx`, Parser/Exporte etc.) – kein Touch.

## Schritte

1. **Migration ausführen** (Inhalt von `20260529180000_mitarbeiter_portal.sql`) – fügt Spalten + Token-Generator + Backfill hinzu. RLS-Policies aus dem ZIP übernehmen; Service-Role-Zugriff für die neuen Server-Functions sicherstellen.
2. **Neue Datei anlegen**: `src/lib/mitarbeiter-portal.functions.ts` (1:1 aus ZIP).
3. **`src/lib/dispo.functions.ts` mergen**: nur die im ZIP neuen/erweiterten Felder im `upsertMitarbeiter`-Validator und der neue Token-Refresh ergänzen – bestehende Logik (Doppelbelegungs-Klartext, Bedarfs-Zähler, E-Mail-Hooks) bleibt.
4. **Neue Route**: `src/routes/m.$token.tsx` (1:1 aus ZIP) + automatische Route-Tree-Generierung abwarten.
5. **`_authenticated.mitarbeiter.tsx` mergen**: Block „Persönlicher Link" + Felder PLZ/Führerschein/Profiltext im Tab „Verfügbarkeiten & Dienste" einfügen.
6. **`_authenticated.dispo.tsx` mergen**: Broadcast-Knopf „Niemand erreicht" pro offener Bedarfszeile ergänzen (Textbaustein + Kopieren-Button).
7. Build/Typecheck läuft automatisch; danach kurze manuelle Verifikation: Mitarbeiter öffnen → Link kopieren → `/m/{token}` in privatem Tab öffnen, Schicht melden, in Disposition prüfen.

## Offene Frage

Soll ich Schritt 1–7 jetzt umsetzen (Build-Modus nötig)?
