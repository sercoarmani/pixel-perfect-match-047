/**
 * Router-/UI-Test: /anfragen ist eine Layout-Route und MUSS <Outlet />
 * rendern, damit Kinder wie /anfragen/kunden und /anfragen/mitarbeiter
 * sichtbar werden. Frühere Regression: component war ein <Navigate>,
 * wodurch die Kinder nie gerendert wurden.
 *
 * Lauf:  bun test scripts/anfragen-outlet.test.ts
 */
import { describe, it, expect } from "bun:test";
import { isValidElement } from "react";
import { Outlet, Navigate } from "@tanstack/react-router";
import { AnfragenLayout } from "../src/routes/_authenticated.anfragen";

describe("/anfragen Layout-Route", () => {
  it("rendert <Outlet /> wenn kein window vorhanden ist (SSR / Kindroute)", () => {
    // @ts-expect-error – simuliere SSR
    delete (globalThis as any).window;
    const el = AnfragenLayout();
    expect(isValidElement(el)).toBe(true);
    expect((el as any).type).toBe(Outlet);
  });

  it("rendert <Outlet /> auf einer Kindroute wie /anfragen/kunden", () => {
    (globalThis as any).window = { location: { pathname: "/anfragen/kunden" } };
    const el = AnfragenLayout();
    expect((el as any).type).toBe(Outlet);
  });

  it("rendert <Outlet /> auf /anfragen/mitarbeiter", () => {
    (globalThis as any).window = { location: { pathname: "/anfragen/mitarbeiter" } };
    const el = AnfragenLayout();
    expect((el as any).type).toBe(Outlet);
  });

  it("leitet beim Root-Pfad /anfragen auf /anfragen/kunden um", () => {
    (globalThis as any).window = { location: { pathname: "/anfragen" } };
    const el = AnfragenLayout();
    expect((el as any).type).toBe(Navigate);
    expect((el as any).props.to).toBe("/anfragen/kunden");
  });

  it("akzeptiert auch /anfragen/ (mit Trailing Slash) als Root-Redirect", () => {
    (globalThis as any).window = { location: { pathname: "/anfragen/" } };
    const el = AnfragenLayout();
    expect((el as any).type).toBe(Navigate);
  });
});
