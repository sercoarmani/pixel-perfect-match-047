import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, Building2, Inbox, LogOut, MessageSquare, FileSpreadsheet, Download, LayoutDashboard, Sparkles, BarChart3, Menu, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/statistik", label: "Statistiken", icon: BarChart3 },
  { to: "/bedarf", label: "Bedarfsassistent", icon: Sparkles },
  { to: "/dispo", label: "Disposition", icon: PhoneCall },
  { to: "/plan", label: "Planungsmatrix", icon: CalendarDays },
  { to: "/anfragen", label: "Anfragen", icon: Inbox },
  { to: "/mitarbeiter", label: "Mitarbeiter", icon: Users },
  { to: "/einrichtungen", label: "Einrichtungen", icon: Building2 },
  { to: "/import", label: "Datei-Import", icon: FileSpreadsheet },
  { to: "/export", label: "Datei-Export", icon: Download },
  { to: "/nachrichten", label: "Nachrichten", icon: MessageSquare },
] as const;


function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { location } = useRouterState();
  return (
    <nav className="flex-1 p-2">
      {NAV.map((n) => {
        const active = location.pathname.startsWith(n.to);
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AuthLayout() {
  const { session, signOut, user, isDispo } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Dev-Modus: Login ist deaktiviert. Kein Redirect, kein Lade-Block.


  const footer = session ? (
    <div className="border-t p-3 space-y-1">
      <div className="text-xs text-muted-foreground truncate px-1">{user?.email}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1">
        {isDispo ? "Disponent" : "Eingeschränkt"}
      </div>
      <ThemeToggle />
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut()}>
        <LogOut className="mr-2 h-4 w-4" /> Abmelden
      </Button>
    </div>
  ) : (
    <div className="border-t p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1">
        Entwicklungsmodus (kein Login)
      </div>
      <ThemeToggle />
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="px-5 py-5 border-b">
          <div className="text-lg font-semibold tracking-tight">DispoPlan</div>
          <div className="text-xs text-muted-foreground">Pflege-Disposition</div>
        </div>
        <NavList />
        {footer}
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 py-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menü öffnen">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar">
              <SheetHeader className="px-5 py-4 border-b text-left">
                <SheetTitle className="text-base">DispoPlan</SheetTitle>
                <div className="text-xs text-muted-foreground">Pflege-Disposition</div>
              </SheetHeader>
              <NavList onNavigate={() => setMobileOpen(false)} />
              {footer}
            </SheetContent>
          </Sheet>
          <div className="font-semibold tracking-tight">DispoPlan</div>
        </header>
        <div className="flex-1 min-w-0 overflow-x-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
