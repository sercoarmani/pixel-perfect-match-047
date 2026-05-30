import { createFileRoute } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LifeBuoy, LayoutDashboard, Sparkles, Mail, PhoneCall, Inbox, UserCheck,
  CalendarDays, Users, Building2, MessageSquare, MailCheck, ScrollText,
  FileSpreadsheet, Download, Settings2, BarChart3, Bot,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/hilfe")({
  component: HilfePage,
});

type Section = { icon: any; title: string; intro: string; steps: string[] };

const SECTIONS: Section[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    intro: "Startseite mit den wichtigsten Kennzahlen.",
    steps: [
      "Zeigt offene Bedarfe, ablaufende Dokumente und anstehende Einsätze.",
      "Klick auf eine Kachel öffnet die zugehörige Detailansicht.",
    ],
  },
  {
    icon: BarChart3,
    title: "Statistiken",
    intro: "Auswertungen zu Auslastung, Bedarfen und Mitarbeitern.",
    steps: [
      "Zeitraum oben rechts auswählen.",
      "Charts können per Klick auf die Legende gefiltert werden.",
    ],
  },
  {
    icon: Sparkles,
    title: "Bedarfsassistent",
    intro: "Anfragen-Text per KI in strukturierte Bedarfe umwandeln.",
    steps: [
      'Anfrage-Text (z. B. aus einer E-Mail) links einfügen, dann auf "Mit KI auslesen" klicken.',
      "Erkannte Bedarfe und Einrichtung werden vorgeschlagen — bei Bedarf manuell anpassen.",
      "Rechts erscheinen verfügbare Mitarbeiter mit Entfernung in km — die nächsten zuerst.",
      'Mit "Zusage" wird ein bestätigter Einsatz angelegt.',
      '"In Planungsmatrix übernehmen" speichert alle Bedarfe und erzeugt automatisch eine Kundenanfrage.',
    ],
  },
  {
    icon: Mail,
    title: "Posteingang",
    intro: "Eingehende E-Mails aus den Postfächern.",
    steps: [
      "Neue Mails werden in der Sidebar mit rotem Punkt signalisiert.",
      "Mail öffnen — KI-Zusammenfassung und Zuordnung zu Mitarbeiter/Einrichtung erscheinen automatisch.",
      'Status auf "bearbeitet" setzen, sobald die Mail verarbeitet ist.',
    ],
  },
  {
    icon: PhoneCall,
    title: "Disposition",
    intro: "Schnellplanung und Massen-Versand pro Tag.",
    steps: [
      "Tag und Dienst auswählen.",
      "Vorschlagsliste durchgehen, Zusage/Absage erfassen.",
      "Sammelnachricht an mehrere Mitarbeiter verschicken.",
    ],
  },
  {
    icon: Inbox,
    title: "Anfragen Kunden",
    intro: "Bedarfsabfragen an Einrichtungen per Token-Link.",
    steps: [
      '"Neue Anfrage" auswählen, dann Einrichtung, Zeitraum und Vorlage wählen.',
      "Generierter Token-Link an die Einrichtung senden (60 Tage gültig).",
      "Antwort der Einrichtung landet automatisch als Bedarf.",
    ],
  },
  {
    icon: UserCheck,
    title: "Verfügbarkeiten",
    intro: "Verfügbarkeitsabfragen an Mitarbeiter per Token-Link.",
    steps: [
      '"Neue Anfrage" auswählen, dann Mitarbeiter und Zeitraum wählen.',
      "Link via Telegram/WhatsApp/E-Mail teilen.",
      "Eingehende Antworten erscheinen in der Sidebar mit Signal.",
    ],
  },
  {
    icon: CalendarDays,
    title: "Planungsmatrix",
    intro: "Monatsübersicht aller Einsätze, Abwesenheiten und offenen Bedarfe.",
    steps: [
      "Filter oben: Monat, Qualifikation, Anstellung, Mitarbeiter.",
      "Klick in eine Zelle, um Einsatz oder Abwesenheit anzulegen oder zu bearbeiten.",
      "Über jedem Tag werden offene Bedarfe als Pill angezeigt.",
      "Export als PDF oder Excel oben rechts.",
    ],
  },
  {
    icon: Users,
    title: "Mitarbeiter",
    intro: "Stammdaten, Dokumente, Geokodierung.",
    steps: [
      'Neue Mitarbeiter über "Neu" anlegen — Kürzel ist Pflicht.',
      "Dokumente per Drag-and-Drop hochladen — Ablauf wird überwacht.",
      'Telegram-Code generieren, damit der Mitarbeiter sich im Mitarbeiter-Bot verknüpfen kann.',
    ],
  },
  {
    icon: Building2,
    title: "Einrichtungen",
    intro: "Träger, Adresse, Verrechnungssätze.",
    steps: [
      "Spaltenköpfe anklicken zum Sortieren (Träger, Name, Ort, VS PFK, VS PHK).",
      '"Portal-Link" generiert einen Kunden-Token-Link für direkte Bedarfsmeldung.',
      "VS-Satz = Verrechnungssatz pro Stunde, PFK = Pflegefachkraft, PHK = Pflegehilfskraft.",
    ],
  },
  {
    icon: MessageSquare,
    title: "Kontakt (Kommunikation)",
    intro: "Mitarbeiter direkt per Telegram oder WhatsApp anschreiben.",
    steps: [
      "Mitarbeiter-Zeile zeigt Telegram- und WhatsApp-Icon — Klick öffnet den Direkt-Chat.",
      "Voraussetzung Telegram: Mitarbeiter hat den Bot per Einmal-Code verknüpft.",
      "Voraussetzung WhatsApp: Telefonnummer am Mitarbeiter hinterlegt.",
    ],
  },
  {
    icon: MailCheck,
    title: "Kundenbestätigungen",
    intro: "PDF-Bestätigungen mit Mitarbeiter-Unterlagen an Kunden.",
    steps: [
      'Aus einem bestätigten Einsatz: "Bestätigung an Kunden".',
      "Dokumente auswählen, die mitgesendet werden sollen.",
      "Status (Entwurf zu gesendet) wird automatisch geführt.",
    ],
  },
  {
    icon: ScrollText,
    title: "Versand-Protokoll",
    intro: "Alle versendeten Nachrichten (E-Mail, Telegram, WhatsApp).",
    steps: [
      "Filter nach Kanal und Status.",
      "Bei Fehlern wird der Grund eingeblendet.",
    ],
  },
  {
    icon: FileSpreadsheet,
    title: "Datei-Import (Admin)",
    intro: "Excel-Listen importieren — Planungsliste, Stammdaten.",
    steps: [
      "Datei auswählen, Vorschau prüfen, Import bestätigen.",
      "Fehlerhafte Zeilen werden markiert und übersprungen.",
    ],
  },
  {
    icon: Download,
    title: "Datei-Export (Admin)",
    intro: "Dienstpläne und Listen als PDF/Excel exportieren.",
    steps: [
      "Monat und Format wählen, herunterladen.",
    ],
  },
  {
    icon: Settings2,
    title: "Verwaltung (Admin)",
    intro: "Verbindungen, Nachrichten-Vorlagen, Tools.",
    steps: [
      "Status aller Verbindungen (Telegram, E-Mail, ...) auf einen Blick.",
      "Nachrichten-Vorlagen bearbeiten — Platzhalter {name}, {zeitraum}, {link}.",
      "Geokodierung-Sammellauf für alle Adressen.",
    ],
  },
  {
    icon: Bot,
    title: "Assistent",
    intro: "Der Chat-Button unten rechts beantwortet Fragen zu allen Funktionen.",
    steps: [
      "Auf den blauen Bot-Button klicken.",
      "Frage stellen — der Assistent kennt deine aktuelle Seite.",
    ],
  },
];

function HilfePage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hilfe & Schnellstart</h1>
          <p className="text-sm text-muted-foreground">
            Schritt-für-Schritt-Erklärungen zu allen Bereichen. Fragen? Nutze den Assistenten unten rechts.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alle Bereiche</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <AccordionItem key={i} value={`s-${i}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium">{s.title}</span>
                      <span className="text-xs font-normal text-muted-foreground hidden sm:inline">— {s.intro}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground mb-2 sm:hidden">{s.intro}</p>
                    <ol className="space-y-1.5 pl-5 text-sm list-decimal marker:text-primary">
                      {s.steps.map((step, k) => <li key={k}>{step}</li>)}
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
