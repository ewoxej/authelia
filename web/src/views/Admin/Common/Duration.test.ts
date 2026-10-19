// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { formatDuration, parseDuration, shortDuration, snapPoints } from "@views/Admin/Common/Duration";

describe("parseDuration", () => {
    it.each([
        ["5m", 300],
        ["5 minutes", 300],
        ["1h30m", 5400],
        ["1 hour and 30 minutes", 5400],
        ["1 week", 604800],
        ["1M", 2592000],
        ["90", 90],
        ["-1", -1],
    ])("reads %s", (input, seconds) => {
        expect(parseDuration(input)).toEqual({ seconds });
    });

    it("reports empty and invalid input", () => {
        expect(parseDuration("  ")).toEqual({ empty: true });
        expect(parseDuration("5 minuts")).toEqual({ error: "unknown unit 'minuts'" });
        expect(parseDuration("soon")).toHaveProperty("error");
        expect(parseDuration("1.5h")).toHaveProperty("error");
    });
});

describe("formatDuration", () => {
    it("shows the two largest units", () => {
        expect(formatDuration(5400)).toBe("1h 30m");
        expect(shortDuration(300)).toBe("5m");
        expect(formatDuration(-1)).toBe("disabled");
    });
});

describe("snapPoints", () => {
    it("includes both bounds and stays sorted", () => {
        const points = snapPoints(60, 604800);

        expect(points[0]).toBe(60);
        expect(points.at(-1)).toBe(604800);
        expect(points).toEqual([...points].sort((a, b) => a - b));
        expect(points).toContain(3600);
    });
});
