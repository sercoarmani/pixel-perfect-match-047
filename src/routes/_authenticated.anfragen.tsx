import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/anfragen")({
  component: AnfragenLayout,
});

function AnfragenLayout() {
  const match = typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/anfragen";
  if (match) return <Navigate to="/anfragen/kunden" replace />;
  return <Outlet />;
}
