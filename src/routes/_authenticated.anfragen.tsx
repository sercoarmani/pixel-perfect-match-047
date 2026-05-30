import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/anfragen")({
  component: () => <Navigate to="/anfragen/kunden" replace />,
});
