// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";

/**
 * What the logo of the sign-in pages shows: the halves apart while nobody is signed in, closing in while a sign-in is
 * checked, red when it failed, amber while the network is banned, joined once signed in and parting again on sign out.
 */
export type LoginMarkState = "ban" | "busy" | "error" | "idle" | "joined" | "unlock";

export interface LoginMarkSnapshot {
    state: LoginMarkState;
    // Changes on every update so setting the same state again replays its animation, i.e. a second failed attempt.
    seq: number;
    // The halves joined as the sign-in completed: the logo grows into the middle of the page over a dimmed background.
    celebrate: boolean;
}

// How long the sign-in animation takes, the sign-in waits for it before leaving the page.
export const loginMarkJoinDuration = 1600;

let snapshot: LoginMarkSnapshot = { celebrate: false, seq: 0, state: "idle" };
let shown = false;
let joining: Promise<void> | undefined;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => snapshot;

export function setLoginMark(state: LoginMarkState, celebrate = false) {
    snapshot = { celebrate, seq: snapshot.seq + 1, state };

    for (const listener of listeners) listener();
}

export function getLoginMark(): LoginMarkState {
    return snapshot.state;
}

/** Records that the logo was on the page, so finishing a sign-in has something to animate. */
export function setLoginMarkShown() {
    shown = true;
}

export function useLoginMark(): LoginMarkSnapshot {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Joins the halves once the sign-in is complete and resolves when they are, so the page can be left after it. It
 * resolves at once when the logo wasn't shown, i.e. the user was signed in already, or the halves are joined already.
 */
export function joinLoginMark(): Promise<void> {
    // Asked again while they join, i.e. by a page rendering again: it waits for the same animation.
    if (joining) return joining;

    setSignedIn(true);

    if (!shown || snapshot.state === "joined") return Promise.resolve();

    setLoginMark("joined", true);

    if (reducedMotion()) return Promise.resolve();

    joining = new Promise((resolve) =>
        setTimeout(() => {
            joining = undefined;
            resolve();
        }, loginMarkJoinDuration),
    );

    return joining;
}

const signedInKey = "janus.signed-in";

/**
 * Remembers whether the user is signed in so a loading page can show the keyhole whole or split before anything is
 * known about the session. It's only a hint for the look and never used to decide anything.
 */
export function setSignedIn(signedIn: boolean) {
    try {
        if (signedIn) {
            globalThis.localStorage.setItem(signedInKey, "1");
        } else {
            globalThis.localStorage.removeItem(signedInKey);
        }
    } catch {
        // The storage isn't available, i.e. in a private window: the loading page shows the keyhole split.
    }
}

export function isSignedIn(): boolean {
    try {
        return globalThis.localStorage.getItem(signedInKey) === "1";
    } catch {
        return false;
    }
}

/** Resets the logo, for the tests. */
export function resetLoginMark() {
    snapshot = { celebrate: false, seq: 0, state: "idle" };
    shown = false;
    joining = undefined;
}
