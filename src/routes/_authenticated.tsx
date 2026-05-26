import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, Building2, Inbox, LogOut, MessageSquare, FileSpreadsheet, Download, LayoutDashboard, Sparkles, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/statistik", label: "Statistiken", icon: BarChart3 },
  { to: "/bedarf", label: "Bedarfsassistent", icon: Sparkles },
  { to: "/plan", label: "Planungsmatrix", icon: CalendarDays },
  { to: "/anfragen", label: "Anfragen", icon: Inbox },
  { to: "/mitarbeiter", label: "Mitarbeiter", icon: Users },
  { to: "/einrichtungen", label: "Einrichtungen", icon: Building2 },
  { to: "/import", label: "Datei-Import", icon: FileSpreadsheet },
  { to: "/export", label: "Datei-Export", icon: Download },
  { to: "/nachrichten", label: "Nachrichten", icon: MessageSquare },
] as const;


function AuthLayout() {
  const { loading, session, signOut, user, isDispo } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Lade…</div>;
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="px-5 py-5 border-b">
          <div className="text-lg font-semibold tracking-tight">DispoPlan</div>
          <div className="text-xs text-muted-foreground">Pflege-Disposition</div>
        </div>
        <nav className="flex-1 p-2">
          {NAV.map((n) => {
            const active = location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
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
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
