// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { render } from "@testing-library/react";

import Orb from "@components/Orb";

it("pulses with the icon while waiting", () => {
    const { container } = render(<Orb state="wait" icon={<span data-testid="icon" />} />);

    expect(container.querySelector(".l-orb")).toHaveAttribute("data-state", "wait");
    expect(container.querySelectorAll(".pulse")).toHaveLength(2);
    expect(container.querySelector("[data-testid='icon']")).toBeInTheDocument();
});

it.each(["ok", "fail"] as const)("shows the outcome without the waiting icon when %s", (state) => {
    const { container } = render(<Orb state={state} icon={<span data-testid="icon" />} />);

    expect(container.querySelector(".l-orb")).toHaveClass(state);
    expect(container.querySelector(".pulse")).not.toBeInTheDocument();
    expect(container.querySelector("[data-testid='icon']")).not.toBeInTheDocument();
});
