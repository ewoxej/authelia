// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";

import Authenticated from "@views/LoginPortal/Authenticated";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@components/Orb", () => ({
    default: (props: any) => (
        <div
            data-testid={props.state === "ok" ? "success-icon" : props.state === "fail" ? "failure-icon" : "wait-icon"}
        />
    ),
}));

it("renders the authenticated stage with success icon", () => {
    render(<Authenticated />);
    expect(screen.getByText("Authenticated")).toBeInTheDocument();
    expect(screen.getByTestId("success-icon")).toBeInTheDocument();
});

it("carries the identifier the suites wait for", () => {
    const { container } = render(<Authenticated />);
    expect(container.querySelector("#authenticated-stage")).toBeInTheDocument();
});
