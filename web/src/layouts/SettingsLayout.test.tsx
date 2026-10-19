// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import SettingsLayout from "@layouts/SettingsLayout";

const mockNavigate = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@constants/constants", () => ({
    BrandName: "Janus",
    EncodedName: [81, 88, 86, 48, 97, 71, 86, 115, 97, 87, 69, 61],
}));

vi.mock("@constants/Routes", () => ({
    AdminRoute: "/admin",
    IndexRoute: "/",
    SecuritySubRoute: "/security",
    SettingsRoute: "/settings",
    SettingsTwoFactorAuthenticationSubRoute: "/two-factor-authentication",
}));

vi.mock("@hooks/RouterNavigate", () => ({
    useRouterNavigate: () => mockNavigate,
}));

const mockSignOut = vi.fn();

vi.mock("@hooks/SignOut", () => ({
    useSignOut: () => mockSignOut,
}));

const mocks = vi.hoisted(() => ({ administrator: false }));

vi.mock("@hooks/Configuration", () => ({
    useConfiguration: () => [{ administrator: mocks.administrator }, vi.fn()],
}));

const renderLayout = async (path = "/settings/security", children?: React.ReactNode) => {
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[path]}>
                <SettingsLayout>{children}</SettingsLayout>
            </MemoryRouter>,
        );
    });
};

beforeEach(() => {
    mockNavigate.mockReset();
    mocks.administrator = false;
});

afterEach(() => {
    delete document.documentElement.dataset.portalSkin;
    delete document.documentElement.dataset.adminTheme;
});

it("renders the brand with the settings label", async () => {
    await renderLayout();

    expect(screen.getByText("Janus")).toBeInTheDocument();
    expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
});

it("renders children", async () => {
    await renderLayout("/settings", <div data-testid="child">Content</div>);

    expect(screen.getByTestId("child")).toBeInTheDocument();
});

it("always shows the navigation with the current page marked", async () => {
    await renderLayout("/settings/security");

    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Two-Factor Authentication" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
});

it("applies the administration design while mounted", async () => {
    await renderLayout();

    expect(document.documentElement.dataset.portalSkin).toBe("");
    expect(document.documentElement.dataset.adminTheme).toBeDefined();
});

it("sets the document title", async () => {
    await renderLayout();

    expect(document.title).toContain("Settings");
});

it("navigates when a nav item is clicked", async () => {
    await renderLayout("/settings/two-factor-authentication");

    fireEvent.click(screen.getByRole("button", { name: "Security" }));

    expect(mockNavigate).toHaveBeenCalledWith("/settings/security");
});

it("does not navigate when the selected nav item is clicked", async () => {
    await renderLayout("/settings/security");

    fireEvent.click(screen.getByRole("button", { name: "Security" }));

    expect(mockNavigate).not.toHaveBeenCalled();
});

it("signs out from the navigation", async () => {
    await renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(mockSignOut).toHaveBeenCalledWith(false);
});

it("links to the administration area for administrators only", async () => {
    await renderLayout();

    expect(screen.queryByRole("button", { name: "Administration" })).not.toBeInTheDocument();
});

it("opens the administration area from the navigation", async () => {
    mocks.administrator = true;

    await renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "Administration" }));

    expect(mockNavigate).toHaveBeenCalledWith("/admin");
});
