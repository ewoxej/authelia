// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook } from "@testing-library/react";

import {
    getLoginMark,
    joinLoginMark,
    loginMarkJoinDuration,
    resetLoginMark,
    setLoginMark,
    setLoginMarkShown,
    useLoginMark,
} from "@hooks/LoginMark";

beforeEach(() => {
    resetLoginMark();
});

afterEach(() => {
    vi.useRealTimers();
});

it("starts with the halves apart", () => {
    expect(getLoginMark()).toBe("idle");
});

it("changes the snapshot on every update so a repeated state replays", () => {
    const { result } = renderHook(() => useLoginMark());

    act(() => setLoginMark("error"));
    const first = result.current.seq;

    act(() => setLoginMark("error"));

    expect(result.current.state).toBe("error");
    expect(result.current.seq).toBe(first + 1);
});

it("doesn't wait when the logo wasn't shown", async () => {
    await joinLoginMark();

    expect(getLoginMark()).toBe("idle");
});

it("joins the halves and waits for them once shown", async () => {
    vi.useFakeTimers();
    setLoginMarkShown();

    let done = false;

    joinLoginMark().then(() => (done = true));
    // A second request while they join waits for the same animation.
    const again = joinLoginMark();

    expect(getLoginMark()).toBe("joined");

    await vi.advanceTimersByTimeAsync(loginMarkJoinDuration - 1);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await again;
    expect(done).toBe(true);

    // Joined already: nothing more to wait for.
    await joinLoginMark();
});
