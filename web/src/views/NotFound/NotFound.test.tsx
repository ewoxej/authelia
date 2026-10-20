// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";

import NotFound from "@views/NotFound/NotFound";

const navigate = vi.fn();

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@hooks/RouterNavigate", () => ({
    useRouterNavigate: () => navigate,
}));

vi.mock("@layouts/MinimalLayout", () => ({
    default: (props: any) => (
        <div>
            <h1>{props.title}</h1>
            {props.children}
        </div>
    ),
}));

it("tells there's nothing here and leads to the settings", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading")).toHaveTextContent("Page not found");

    fireEvent.click(screen.getByRole("button"));

    expect(navigate).toHaveBeenCalledWith("/settings");
});
