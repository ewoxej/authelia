// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";

import UserChip from "@components/UserChip";

it("shows the name, the initials and the action", () => {
    const { container } = render(
        <UserChip name="Alice Liddell">
            <button>Logout</button>
        </UserChip>,
    );

    expect(screen.getByText("Alice Liddell")).toBeInTheDocument();
    expect(container.querySelector(".l-ava")).toHaveTextContent("AL");
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
});

it("falls back to a placeholder without a name", () => {
    const { container } = render(<UserChip name="" />);

    expect(container.querySelector(".l-ava")).toHaveTextContent("?");
});
