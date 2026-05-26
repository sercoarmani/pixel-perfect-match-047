
# DispoPlan – Bauplan

Die Spezifikation ist sehr umfangreich (8 Kerntabellen, Planungs-Matrix, Dashboard, Anfragen-Center, Matching-Engine, Import/Export, Templates, Webhook-Vorbereitung). Das in einem Rutsch zu bauen führt erfahrungsgemäß zu instabilen Ergebnissen. Ich schlage einen **klar geschnittenen MVP (Phase A)** vor, der sofort produktiv ist, und baue die weiteren Phasen danach Schritt für Schritt darauf auf.

Hinweis zur Plattform: Statt eines externen Supabase-Kontos nutze ich **Lovable Cloud** (gleicher Funktionsumfang wie Supabase – Postgres, Auth, RLS, Edge Functions, Storage – ohne separates Konto und ohne Setup). Die App-Logik bleibt 1:1 identisch zur Spezifikation.

---

## Phase A – MVP (dieser Auftrag)

Ziel: Disponent kann sich einloggen, Stammdaten pflegen, in der Matrix planen, Verfügbarkeits- und Bedarfs-Links erzeugen + per WhatsApp/E-Mail versenden, Antworten landen automatisch in der DB.

1. **Cloud + Auth + Rollen**
   - Lovable Cloud aktivieren
   - E-Mail/Passwort-Login, Rollen `admin` / `disponent` über separate `user_roles`-Tabelle mit `has_role()`-Funktion (Security Best Practice)
   - Geschützter Bereich unter `/_authenticated`, öffentliche Token-Routen daneben

2. **Datenmodell anlegen (alle 9 Tabellen aus dem Prompt)**
   - `traeger, einrichtungen, mitarbeiter, einsaetze, abwesenheiten, verfuegbarkeiten, bedarfe, anfragen, audit_log`
   - RLS-Policies: interne Rollen lesen/schreiben; öffentliche Token-Endpunkte laufen über Server-Functions mit Admin-Client + Token-Validierung
   - Beispieldaten-Seed (3 Träger, 5 Einrichtungen, 10 Mitarbeiter, ein paar Einsätze, Verfügbarkeiten, offene Bedarfe)

3. **Disponenten-UI (Desktop-first, deutschsprachig)**
   - **Dashboard**: offene Bedarfe, neue Verfügbarkeiten/Bedarfe, Auslastung, Auffälligkeiten, Schnellsprung Matrix
   - **Planungs-Matrix**: Zeilen = Einrichtungen (nach Träger gruppiert, aufklappbar), Spalten = Tage des Monats (Wochenenden abgesetzt, sticky Header/erste Spalte), Zellen = Mitarbeiter-Kürzel mit Status-Badge (Text + Icon, nicht nur Farbe). Zell-Klick öffnet Panel zum Zuweisen/Bearbeiten. Live-Warnungen (Doppelplanung, Abwesenheit, Qualifikation, max_einsaetze, „nicht verfügbar")
   - **Mitarbeiter-Übersicht** (Liste + Bearbeiten + Status)
   - **Einrichtungen/Kunden-Übersicht** (Liste + Bearbeiten + Sätze)
   - **Anfragen-Center**: Liste aller Versand-Vorgänge, Status, Link kopieren, erneut senden
   - **Verfügbarkeits-Matrix** (Mitarbeiter × Tage)

4. **Token-Link-System (öffentlich, mobil-first, ohne Login)**
   - Disponent erzeugt Anfrage → langer zufälliger Token, Ablaufdatum
   - Route `/v/[token]` (Verfügbarkeit Mitarbeiter): Tagesliste, pro Tag F/S/N antippen, Notiz, Absenden → schreibt `verfuegbarkeiten`, setzt Anfrage `beantwortet`
   - Route `/b/[token]` (Bedarf Einrichtung): pro Tag Dienst + Qualifikation + Anzahl → schreibt `bedarfe` mit Status `offen`
   - Server-Functions validieren Token, prüfen Ablauf, schreiben sauber (Mehrfach-Antworten überschreiben)

5. **Versand-Komfort (manuell, sofort nutzbar)**
   - Versand-Adapter-Architektur (Interface), aktiv: `wa.me`-Deep-Link, `sms:`-Link, `mailto:`-Link mit vorausgefülltem Text
   - Sammel-Versand: pro Empfänger eigener Link, ein Klick öffnet jeweils WhatsApp
   - Webhook-Endpoint `/api/public/whatsapp-webhook` als Skeleton (Signaturprüfung, später aktivierbar) – nur Stub, im UI als „später aktivierbar" gekennzeichnet

6. **Nachrichten-Templates (Admin-Bereich, editierbar)**
   - Templates für Verfügbarkeitsabfrage / Erinnerung / Bedarfsabfrage / Einsatzbestätigung (Texte aus Abschnitt 3 als Defaults)
   - Platzhalter `{{Vorname}} {{von}} {{bis}} {{Link}} {{Einrichtung}} {{Firmenname}} {{Disponent}}` werden beim Versand befüllt

7. **Matching-Vorschläge**
   - Beim Besetzen eines Bedarfs Vorschlagsliste (sortiert): hat „verfügbar" gemeldet → Qualifikation → Dienst möglich → freie Kapazität → keine Kollision → optional Wohnort-Nähe
   - Eignungsgründe + Warnungen sichtbar, ein Klick = Einsatz angelegt (`quelle=aus_bedarf`, Bedarf → `besetzt`)

8. **Status-System + Audit-Log**
   - Status-Dropdown direkt in der Matrix; jede Änderung schreibt Audit-Log-Zeile

## Phase B (nach MVP-Abnahme)

- CSV-Import-Assistent (Semikolon, UTF-8 BOM) für `mitarbeiter.csv` + `einrichtungen.csv` mit Spalten-Mapping und Vorschau
- Export Matrix → Excel + PDF, Einsatzplan pro Mitarbeiter → PDF
- Manueller Komplett-Export (JSON/Excel) im Admin-Bereich

## Phase C (optional, später)

- Echte WhatsApp Business Cloud API / Twilio anbinden (Adapter wird aktiviert, Webhook scharfschalten)
- Erweiterte Auswertungen, Erinnerungs-Automatiken (Cron)

---

## Design-Richtung

Disponenten-Tool, kein Marketing-Look. Vorschlag: ruhige, dichte Informations-Oberfläche – helle Basis, kräftige Status-Akzente, sehr klare Typografie. Status-Badges immer **Icon + Kurztext + Farbe** (Barrierefreiheit). Mobile Link-Seiten dagegen großzügig, große Tap-Targets, ein Button pro Tag.

Falls du eine andere Richtung möchtest (z.B. dunkler Operator-Look, Excel-nah, oder farbenfroher), sag kurz Bescheid – sonst baue ich in der oben skizzierten ruhig-dichten Variante.

## Technische Details (zur Info)

- Stack: TanStack Start (React 19 + TS) + Tailwind v4 + shadcn/ui + Lovable Cloud (Postgres/Auth/Edge)
- Routen: `src/routes/_authenticated/*` für Disponenten-Bereich, `src/routes/v.$token.tsx` + `src/routes/b.$token.tsx` für öffentliche Token-Seiten, `src/routes/api/public/*` für Webhooks
- Server-Logik über `createServerFn` mit `requireSupabaseAuth` für interne Calls; Token-Endpunkte als öffentliche Server-Functions mit eigener Token-Validierung
- Audit-Log über DB-Trigger auf relevanten Tabellen
- Token-Generierung: `crypto.randomUUID()` + zusätzlicher Zufalls-Suffix, im URL-Pfad, nie Personendaten in der URL

---

## Was ich nach deinem OK zuerst tue

1. Lovable Cloud aktivieren
2. Schema + RLS + Seed-Daten anlegen
3. Auth + geschützter Bereich
4. Matrix + Stammdaten-CRUD
5. Token-Link-Flows (Verfügbarkeit + Bedarf)
6. Anfragen-Center + Versand-Helfer + Templates
7. Matching-Vorschläge + Live-Warnungen

CSV-Import, Exports und WhatsApp-API kommen in Phase B/C – sag mir nach dem MVP, in welcher Reihenfolge.
