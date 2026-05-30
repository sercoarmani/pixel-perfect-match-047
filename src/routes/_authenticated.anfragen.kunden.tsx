import { createFileRoute } from "@tanstack/react-router";
import { AnfragenView } from "@/components/anfragen-view";

export const Route = createFileRoute("/_authenticated/anfragen/kunden")({
  component: () => <AnfragenView scope="kunden" />,
});
