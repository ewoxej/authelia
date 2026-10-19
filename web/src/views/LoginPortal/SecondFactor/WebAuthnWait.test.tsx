// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";

import { WebAuthnTouchState } from "@models/WebAuthn";
import WebAuthnWait from "@views/LoginPortal/SecondFactor/WebAuthnWait";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

it("waits for the key with the time left", () => {
    const { container } = render(
        <WebAuthnWait onRetryClick={vi.fn()} webauthnTouchState={WebAuthnTouchState.WaitTouch} />,
    );

    expect(container.querySelector(".l-orb")).toHaveAttribute("data-state", "wait");
    expect(container.querySelector(".l-progress")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
});

it("offers to retry after a failure", () => {
    const onRetryClick = vi.fn();

    const { container } = render(
        <WebAuthnWait onRetryClick={onRetryClick} webauthnTouchState={WebAuthnTouchState.Failure} />,
    );

    expect(container.querySelector(".l-orb")).toHaveAttribute("data-state", "fail");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetryClick).toHaveBeenCalledTimes(1);
});
