// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { csvCell, downloadCSV, toCSV } from "@views/Admin/Common/CSV";

describe("csvCell", () => {
    it.each([
        ["john", '"john"'],
        ["2026-10-19T20:00:00Z", '"2026-10-19T20:00:00Z"'],
        ['say "hi"', '"say ""hi"""'],
        ["", '""'],
        ["john=admin", '"john=admin"'],
        ["/api/firstfactor?a=-1", '"/api/firstfactor?a=-1"'],
    ])("keeps %j", (value, expected) => {
        expect(csvCell(value)).toBe(expected);
    });

    it.each([
        ['=HYPERLINK("https://evil.example","x")', '"\'=HYPERLINK(""https://evil.example"",""x"")"'],
        ["+1+cmd|' /C calc'!A0", "\"'+1+cmd|' /C calc'!A0\""],
        ["-2+3", '"\'-2+3"'],
        ["@SUM(A1:A2)", '"\'@SUM(A1:A2)"'],
        ["  =1+1", '"\'  =1+1"'],
        ["\t=1+1", '"\'\t=1+1"'],
        ["\r=1+1", '"\'\r=1+1"'],
        ["＝1+1", '"\'＝1+1"'],
    ])("neutralizes the formula %j", (value, expected) => {
        expect(csvCell(value)).toBe(expected);
    });
});

describe("toCSV", () => {
    it("joins the cells and rows", () => {
        expect(
            toCSV([
                ["username", "remote_ip"],
                ["=1+1", "192.0.2.1"],
            ]),
        ).toBe('"username","remote_ip"\n"\'=1+1","192.0.2.1"');
    });
});

describe("downloadCSV", () => {
    it("downloads the neutralized rows", async () => {
        let blob: Blob | undefined;

        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
            blob = value as Blob;

            return "blob:test";
        });
        const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

        downloadCSV("activity.csv", [["username"], ["@cmd"]]);

        expect(click).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
        expect(await blob?.text()).toBe('"username"\n"\'@cmd"');

        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
        click.mockRestore();
    });
});
