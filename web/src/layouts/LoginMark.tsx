// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useId, useLayoutEffect, useRef } from "react";

import { setLoginMarkShown, useLoginMark } from "@hooks/LoginMark";

/**
 * The large logo on top of the sign-in card. Its keyhole halves move with the state of the sign-in, see LoginMarkState.
 * The halves are cut out of the coin with a mask so the card shows through whatever its colour.
 */
const LoginMark = function () {
    const id = `l-logo-${useId().replaceAll(":", "")}`;
    const { celebrate, seq, state } = useLoginMark();
    const wrapRef = useRef<HTMLDivElement>(null);
    const dimRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(false);

    useEffect(() => {
        setLoginMarkShown();
    }, []);

    // The state is set outside React so setting it again restarts its animations.
    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        const dim = dimRef.current;

        if (!wrap || !dim) return;

        // A page opened after the sign-in shows the joined logo in its place rather than celebrating again.
        const grow = celebrate && mountedRef.current;

        mountedRef.current = true;

        delete wrap.dataset.state;
        delete wrap.dataset.celebrate;
        delete dim.dataset.celebrate;

        if (grow) {
            // Moves the middle of the logo to the middle of the page.
            const rect = wrap.getBoundingClientRect();

            wrap.style.setProperty("--l-logo-dx", `${globalThis.innerWidth / 2 - (rect.left + rect.width / 2)}px`);
            wrap.style.setProperty("--l-logo-dy", `${globalThis.innerHeight / 2 - (rect.top + rect.height / 2)}px`);
        }

        void wrap.offsetWidth;
        wrap.dataset.state = state;

        if (grow) {
            wrap.dataset.celebrate = "";
            dim.dataset.celebrate = "";
        }
    }, [celebrate, seq, state]);

    return (
        <>
            <div ref={dimRef} className="l-dim" aria-hidden />
            <div ref={wrapRef} className="l-logo" data-testid="brand-mark">
                <span className="l-halo" aria-hidden />
                <span className="l-halo b" aria-hidden />
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120" aria-hidden>
                    <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                        <rect width="100" height="100" fill="#fff" />
                        <g fill="#000">
                            <path
                                className="l-half l"
                                d="M50,28 A12,12 0 0,0 38,40 A12,12 0 0,0 43.5,50 L40,72 L50.4,72 L50.4,28 Z"
                            />
                            <path
                                className="l-half r"
                                d="M50,28 A12,12 0 0,1 62,40 A12,12 0 0,1 56.5,50 L60,72 L49.6,72 L49.6,28 Z"
                            />
                            <circle cx="50" cy="50" r="41.5" fill="none" stroke="#000" strokeWidth="2" />
                            <circle
                                cx="50"
                                cy="50"
                                r="37.5"
                                fill="none"
                                stroke="#000"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeDasharray="0 5.89"
                            />
                        </g>
                    </mask>
                    <circle className="l-coin" cx="50" cy="50" r="47" mask={`url(#${id})`} />
                </svg>
            </div>
        </>
    );
};

export default LoginMark;
