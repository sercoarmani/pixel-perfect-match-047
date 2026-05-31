import { createFileRoute, Outlet, Link, useRouterState, Navigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, Users, Building2, Inbox, LogOut, MessageSquare, FileSpreadsheet,
  Download, LayoutDashboard, Sparkles, BarChart3, Menu, PhoneCall, UserCheck,
  Settings2, Mail, ScrollText, MailCheck, LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { getSidebarCounts } from "@/lib/sidebar-counts.functions";
import { HelpChatbot } from "@/components/help-chatbot";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

type CountKey = "posteingang" | "verfuegbarkeiten" | "anfragenKunden";
type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; countKey?: CountKey };
type NavSection = { label: string; items: NavItem[]; adminOnly?: boolean };

const SECTIONS: NavSection[] = [
  {
    label: "Übersicht",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/statistik", label: "Statistiken", icon: BarChart3 },
    ],
  },
  {
    label: "Disposition",
    items: [
      { to: "/bedarf", label: "Bedarfsassistent", icon: Sparkles },
      { to: "/posteingang", label: "Posteingang", icon: Mail, countKey: "posteingang" },
      { to: "/dispo", label: "Disposition", icon: PhoneCall },
      { to: "/anfragen/kunden", label: "Anfragen Kunden", icon: Inbox, countKey: "anfragenKunden" },
      { to: "/anfragen/mitarbeiter", label: "Verfügbarkeiten", icon: UserCheck, countKey: "verfuegbarkeiten" },
      { to: "/plan", label: "Planungsmatrix", icon: CalendarDays },
    ],
  },
  {
    label: "Stammdaten",
    items: [
      { to: "/mitarbeiter", label: "Mitarbeiter", icon: Users },
      { to: "/einrichtungen", label: "Kunden", icon: Building2 },
    ],
  },
  {
    label: "Kontakt",
    items: [
      { to: "/nachrichten", label: "Mitarbeiterkontakt", icon: MessageSquare },
      { to: "/bestaetigungen", label: "Kundenkontakt", icon: MailCheck },
      { to: "/protokoll", label: "Versand-Protokoll", icon: ScrollText },
    ],
  },
  {
    label: "Hilfe",
    items: [
      { to: "/hilfe", label: "Hilfebereich", icon: LifeBuoy },
    ],
  },
  {
    label: "Daten & System",
    adminOnly: true,
    items: [
      { to: "/import", label: "Datei-Import", icon: FileSpreadsheet },
      { to: "/export", label: "Datei-Export", icon: Download },
      { to: "/verwaltung", label: "Verwaltung", icon: Settings2 },
    ],
  },
];

function BrandMark() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-1">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
        <CalendarDays className="h-[18px] w-[18px]" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-[15px] font-semibold tracking-tight">DispoPlan</div>
        <div className="text-[11px] text-muted-foreground">Pflege-Disposition</div>
      </div>
    </Link>
  );
}

function NavList({ onNavigate, isAdmin }: { onNavigate?: () => void; isAdmin: boolean }) {
  const { location } = useRouterState();
  const fetchCounts = useServerFn(getSidebarCounts);
  const countsQ = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: () => fetchCounts(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const counts = countsQ.data ?? { posteingang: 0, verfuegbarkeiten: 0, anfragenKunden: 0 };

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      {visibleSections.map((section) => (
        <div key={section.label} className="mb-5">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            {section.label}
          </div>
          <div className="space-y-0.5">
            {section.items.map((n) => {
              const active = location.pathname.startsWith(n.to);
              const Icon = n.icon;
              const count = n.countKey ? counts[n.countKey] : 0;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/70 hover:bg-accent hover:text-foreground",
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="truncate flex-1">{n.label}</span>
                  {count > 0 && (
                    <span
                      className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground shadow-sm animate-in fade-in"
                      aria-label={`${count} neu`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AuthLayout() {
  const { session, signOut, user, isDispo, isAdmin, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Lade…</div>;
  }
  if (!session) {
    return <Navigate to="/login" />;
  }

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const footer = (
    <div className="border-t bg-card/50 p-3">
      <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-foreground">{user?.email}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isAdmin ? "Admin" : isDispo ? "Disponent" : "Eingeschränkt"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button variant="ghost" size="sm" className="flex-1 justify-start text-[12px]" onClick={() => signOut()}>
          <LogOut className="mr-2 h-3.5 w-3.5" /> Abmelden
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="border-b px-4 py-4">
          <BrandMark />
        </div>
        <NavList isAdmin={isAdmin} />
        {footer}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menü öffnen">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar">
              <SheetHeader className="border-b px-4 py-4 text-left">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <BrandMark />
              </SheetHeader>
              <NavList isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
              {footer}
            </SheetContent>
          </Sheet>
          <div className="md:hidden font-display text-[15px] font-semibold tracking-tight">DispoPlan</div>
        </header>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Outlet />
        </div>
      </main>

      <HelpChatbot />
    </div>
  );
}
