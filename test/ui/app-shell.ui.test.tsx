import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  queryOptions: <T,>(options: T) => options,
  useQuery: () => ({ data: { isAdmin: false } }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/" } }),
}));

vi.mock("#/components/pwa-install-button.tsx", () => ({
  PwaInstallButton: () => null,
}));

vi.mock("#/components/support-dialog.tsx", () => ({
  SupportDialog: () => null,
}));

vi.mock("#/components/finance/theme-toggle.tsx", () => ({
  ThemeToggle: () => null,
}));

import { AppShell } from "#/components/finance/app-shell.tsx";

describe("AppShell", () => {
  it("keeps the content padding at 16px on desktop", () => {
    render(
      <AppShell offline={false} onLogout={vi.fn()} user={null}>
        Conteúdo
      </AppShell>,
    );

    const main = screen.getByText("Conteúdo").closest("main");
    expect(main).not.toBeNull();
    expect(main).toHaveClass("px-4");
    expect(main?.className).not.toMatch(/\b(?:sm|md|lg|xl|2xl):px-/);
  });
});
