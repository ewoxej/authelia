// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { SVGProps, useId } from "react";

import "@components/janus.css";

// The colour of the logo: the accent of the page (currentColor of the container), access denied, development or the
// text colour.
export type JanusLogoTone = "accent" | "current" | "denied" | "dev";

export interface Props extends Omit<SVGProps<SVGSVGElement>, "fill" | "mask"> {
    size?: number;
    tone?: JanusLogoTone;
    title?: string;
}

const fills: Record<JanusLogoTone, string> = {
    accent: "currentColor",
    current: "currentColor",
    denied: "#e05a5a",
    dev: "#e6a23c",
};

interface Geometry {
    scale: number;
    dx: number;
    dy: number;
    rings: "full" | "none" | "single";
}

// The small sizes use a bigger keyhole and fewer rings so it stays readable.
const geometry = (size: number): Geometry => {
    if (size <= 20) return { dx: 1.59, dy: 2.9, rings: "none", scale: 1.38 };
    if (size <= 40) return { dx: 1.72, dy: 3.45, rings: "single", scale: 1.16 };

    return { dx: 2, dy: 4, rings: "full", scale: 1 };
};

/** The Janus logo: a coin with a keyhole split in two halves looking in opposite directions. */
const JanusLogo = function ({ size = 32, title, tone = "accent", ...props }: Props) {
    const id = `janus-${useId().replaceAll(":", "")}`;
    const { dx, dy, rings, scale } = geometry(size);

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={size}
            height={size}
            role={title ? "img" : undefined}
            aria-hidden={title ? undefined : true}
            aria-label={title}
            className="janus-logo"
            {...props}
        >
            {title ? <title>{title}</title> : null}
            <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                <rect width="100" height="100" fill="#fff" />
                <g fill="#000">
                    <g transform={`translate(50 50) scale(${scale}) translate(-50 -50)`}>
                        <path
                            transform={`translate(${-dx} ${-dy})`}
                            d="M50,28 A12,12 0 0,0 38,40 A12,12 0 0,0 43.5,50 L40,72 L50,72 Z"
                        />
                        <path
                            transform={`translate(${dx} ${dy})`}
                            d="M50,28 A12,12 0 0,1 62,40 A12,12 0 0,1 56.5,50 L60,72 L50,72 Z"
                        />
                    </g>
                    {rings === "single" ? (
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#000" strokeWidth="3" />
                    ) : null}
                    {rings === "full" ? (
                        <>
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
                        </>
                    ) : null}
                </g>
            </mask>
            <circle cx="50" cy="50" r="47" fill={fills[tone]} mask={`url(#${id})`} />
        </svg>
    );
};

export default JanusLogo;
