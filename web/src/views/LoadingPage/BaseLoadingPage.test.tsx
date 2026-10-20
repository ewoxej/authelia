// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";

import { setSignedIn } from "@hooks/LoginMark";
import BaseLoadingPage from "@views/LoadingPage/BaseLoadingPage";

afterEach(() => {
    setSignedIn(false);
});

it("renders the loading message", () => {
    render(<BaseLoadingPage message="Please wait" />);
    expect(screen.getByText("Please wait...")).toBeInTheDocument();
});

it("shows the keyhole split when nobody is known to be signed in", () => {
    const { container } = render(<BaseLoadingPage message="Loading" />);

    expect(container.querySelector(".janus-coin")).toHaveAttribute("data-joined", "false");
});

it("shows the keyhole whole for a signed in user", () => {
    setSignedIn(true);

    const { container } = render(<BaseLoadingPage message="Loading" />);

    expect(container.querySelector(".janus-coin")).toHaveAttribute("data-joined", "true");
});

it("does not inject a stylesheet to animate it", () => {
    const before = document.head.querySelectorAll("style").length;

    render(<BaseLoadingPage message="Loading" />);

    expect(document.head.querySelectorAll("style")).toHaveLength(before);
});
