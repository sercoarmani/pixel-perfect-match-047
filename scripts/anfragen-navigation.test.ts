/**
 * UI-Regression: Navigation innerhalb von /anfragen muss in der Layout-Route
 * <Outlet /> die Kind-Inhalte rendern. Wir bauen einen Memory-Router mit
 * der echten AnfragenLayout-Komponente und Stub-Kindern und navigieren
 * zwischen /anfragen, /anfragen/kunden und /anfragen/mitarbeiter.
 *
 * Lauf:  bun test scripts/anfragen-navigation.test.ts
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

// happy-dom als globales DOM einrichten BEVOR React-DOM importiert wird
const window = new Window({ url: "http://localhost/anfragen/kunden" });
(globalThis as any).window = window;
(globalThis as any).document = window.document;
(globalThis as any).navigator = window.navigator;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).getComputedStyle = window.getComputedStyle.bind(window);
(window as any).SyntaxError = SyntaxError;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = await import("@testing-library/react");
const { createRoot } = await import("react-dom/client");
const {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} = await import("@tanstack/react-router");
const { AnfragenLayout } = await import("../src/routes/_authenticated.anfragen");

function buildRouter(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => React.createElement(Outlet) });
  const anfragenRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/anfragen",
    component: AnfragenLayout,
  });
  const kundenRoute = createRoute({
    getParentRoute: () => anfragenRoute,
    path: "/kunden",
    component: () => React.createElement("div", { "data-testid": "kunden-content" }, "Anfragen von Kunden"),
  });
  const mitarbeiterRoute = createRoute({
    getParentRoute: () => anfragenRoute,
    path: "/mitarbeiter",
    component: () => React.createElement("div", { "data-testid": "mitarbeiter-content" }, "Verfügbarkeiten der Mitarbeiter"),
  });
  const routeTree = rootRoute.addChildren([anfragenRoute.addChildren([kundenRoute, mitarbeiterRoute])]);
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

async function renderAt(path: string) {
  const router = buildRouter(path);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container as any);
  await act(async () => {
    root.render(React.createElement(RouterProvider as any, { router }));
    await router.load();
  });
  return { container, router, root };
}

describe("/anfragen Navigation rendert Outlet-Children", () => {
  it("/anfragen/kunden zeigt Kunden-Inhalt", async () => {
    const { container } = await renderAt("/anfragen/kunden");
    expect(container.querySelector('[data-testid="kunden-content"]')).not.toBeNull();
    expect(container.textContent).toContain("Anfragen von Kunden");
  });

  it("/anfragen/mitarbeiter zeigt Mitarbeiter-Inhalt", async () => {
    const { container } = await renderAt("/anfragen/mitarbeiter");
    expect(container.querySelector('[data-testid="mitarbeiter-content"]')).not.toBeNull();
    expect(container.textContent).toContain("Verfügbarkeiten der Mitarbeiter");
  });

  it("Navigation /anfragen/kunden -> /anfragen/mitarbeiter tauscht den Inhalt", async () => {
    const { container, router } = await renderAt("/anfragen/kunden");
    expect(container.querySelector('[data-testid="kunden-content"]')).not.toBeNull();
    await act(async () => {
      await router.navigate({ to: "/anfragen/mitarbeiter" });
    });
    expect(container.querySelector('[data-testid="kunden-content"]')).toBeNull();
    expect(container.querySelector('[data-testid="mitarbeiter-content"]')).not.toBeNull();
  });

  it("Outlet bleibt nicht leer (Layout rendert nicht nur einen Wrapper)", async () => {
    const { container } = await renderAt("/anfragen/kunden");
    expect((container.textContent ?? "").trim().length).toBeGreaterThan(0);
  });
});
