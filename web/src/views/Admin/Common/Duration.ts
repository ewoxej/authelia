// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

const unitSeconds: Record<string, number> = { d: 86400, h: 3600, M: 2592000, m: 60, s: 1, w: 604800, y: 31536000 };

const longUnits: Record<string, string> = {
    day: "d",
    days: "d",
    hour: "h",
    hours: "h",
    minute: "m",
    minutes: "m",
    month: "M",
    months: "M",
    second: "s",
    seconds: "s",
    week: "w",
    weeks: "w",
    year: "y",
    years: "y",
};

export type ParsedDuration = { empty: true } | { error: string } | { seconds: number };

/** Reads a duration the way Authelia does: whole numbers with units, bare numbers are seconds, '-1' is -1. */
export function parseDuration(input: string): ParsedDuration {
    const text = input.trim();

    if (text === "") {
        return { empty: true };
    }

    if (/^-?\d+$/.test(text)) {
        return { seconds: Number(text) };
    }

    const compact = text.replaceAll("and", "").replaceAll(/\s+/g, "");
    const parts = [...compact.matchAll(/(\d+)([a-zA-Z]+)/g)];

    if (parts.length === 0 || parts.map((part) => part[0]).join("") !== compact) {
        return { error: "use whole numbers with a unit, i.e. 5m" };
    }

    let seconds = 0;

    for (const [, quantity, unit] of parts) {
        const key = unitSeconds[unit] !== undefined && unit.length === 1 ? unit : longUnits[unit];

        if (key === undefined) {
            return { error: `unknown unit '${unit}'` };
        }

        seconds += Number(quantity) * unitSeconds[key];
    }

    return { seconds };
}

/** Formats seconds as the two largest units, i.e. 5400 -> '1h 30m'. */
export function formatDuration(seconds: number): string {
    if (seconds < 0) {
        return "disabled";
    }

    if (seconds === 0) {
        return "0s";
    }

    const parts: string[] = [];
    let rest = seconds;

    for (const unit of ["y", "M", "w", "d", "h", "m", "s"]) {
        if (rest >= unitSeconds[unit]) {
            const quantity = Math.floor(rest / unitSeconds[unit]);

            parts.push(`${quantity}${unit}`);
            rest -= quantity * unitSeconds[unit];
        }
    }

    return parts.slice(0, 2).join(" ");
}

export const shortDuration = (seconds: number) => formatDuration(seconds).replaceAll(" ", "");

const snapSteps: [string, number[]][] = [
    ["s", [1, 2, 5, 10, 15, 20, 30, 45]],
    ["m", [1, 2, 5, 10, 15, 20, 30, 45]],
    ["h", [1, 2, 3, 4, 6, 8, 12, 18]],
    ["d", [1, 2, 3, 4, 5]],
    ["w", [1, 2, 3]],
    ["M", [1, 2, 3, 6]],
    ["y", [1]],
];

/** The round values the slider snaps to between min and max, always including both. */
export function snapPoints(min: number, max: number): number[] {
    const points = new Set<number>([min, max]);

    for (const [unit, steps] of snapSteps) {
        for (const step of steps) {
            const seconds = step * unitSeconds[unit];

            if (seconds >= min && seconds <= max) {
                points.add(seconds);
            }
        }
    }

    return [...points].sort((a, b) => a - b);
}

const tickCandidates = [1, 10, 60, 600, 3600, 86400, 604800, 2592000, 31536000];

/** A few labelled positions on the track, at most five. */
export function tickPoints(min: number, max: number): number[] {
    const inside = tickCandidates.filter((value) => value > min && value < max);
    const ticks = [min, ...inside, max];

    while (ticks.length > 5) {
        ticks.splice(ticks.length - 2, 1);
    }

    return ticks;
}
