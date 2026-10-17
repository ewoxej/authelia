// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";

import SettingsView from "@views/Settings/SettingsView";

const navigate = vi.fn();
let configuration: { administrator?: boolean } | undefined = undefined;

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@hooks/RouterNavigate", () => ({
    useRouterNavigate: () => navigate,
}));

vi.mock("@hooks/Configuration", () => ({
    useConfiguration: () => [configuration, vi.fn()],
}));

beforeEach(() => {
    navigate.mockReset();
    configuration = undefined;
});

it("renders the settings overview", () => {
    render(<SettingsView />);
    expect(screen.getByText("User Settings")).toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
});

it("shows the administration button to administrators", () => {
    configuration = { administrator: true };

    render(<SettingsView />);

    fireEvent.click(screen.getByText("Administration"));

    expect(navigate).toHaveBeenCalledWith("/admin");
});
