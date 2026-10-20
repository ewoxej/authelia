// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import {
    envQuery,
    filterEnvVariables,
    hasEnvTokens,
    hasOtherTemplates,
    parseEnvSegments,
    serializeEnvSegments,
} from "@views/Admin/Configuration/EnvTokens";

describe("parseEnvSegments", () => {
    it("splits text and environment variables", () => {
        expect(parseEnvSegments('https://idm.{{ env "DOMAIN" }}/{{env "PATH_PREFIX"}}')).toEqual([
            { kind: "text", text: "https://idm." },
            { kind: "env", name: "DOMAIN" },
            { kind: "text", text: "/" },
            { kind: "env", name: "PATH_PREFIX" },
        ]);
    });

    it.each([
        '{{ env "DOMAIN" | default "example.com" }}',
        '{{- env "DOMAIN" -}}',
        '{{ secret "/config/secret.txt" }}',
        "$DOMAIN",
        "^/api/.*$",
        "$argon2id$v=19$m=65536",
    ])("keeps %j as text", (value) => {
        expect(parseEnvSegments(value)).toEqual([{ kind: "text", text: value }]);
    });

    it("returns nothing for an empty value", () => {
        expect(parseEnvSegments("")).toEqual([]);
    });
});

describe("serializeEnvSegments", () => {
    it("writes the variables as template expressions", () => {
        expect(
            serializeEnvSegments([
                { kind: "text", text: "https://idm." },
                { kind: "env", name: "DOMAIN" },
            ]),
        ).toBe('https://idm.{{ env "DOMAIN" }}');
    });

    it("writes the plain form back unchanged", () => {
        const value = 'a{{ env "A" }}b{{ env "B" }}';

        expect(serializeEnvSegments(parseEnvSegments(value))).toBe(value);
    });
});

describe("hasEnvTokens and hasOtherTemplates", () => {
    it.each([
        ['{{ env "DOMAIN" }}', true, false],
        ["plain", false, false],
        [undefined, false, false],
        ['{{ env "A" }} {{ secret "/x" }}', true, true],
        ['{{ env "DOMAIN" | lower }}', false, true],
    ])("detects the templates of %j", (value, tokens, other) => {
        expect(hasEnvTokens(value)).toBe(tokens);
        expect(hasOtherTemplates(value)).toBe(other);
    });
});

describe("envQuery", () => {
    it.each([
        ["$", { length: 1, query: "" }],
        ["https://idm.$DOM", { length: 4, query: "DOM" }],
        ["a $app_url", { length: 8, query: "app_url" }],
        ["no dollar", null],
        ["$DOMAIN.", null],
        ["$DOMAIN ", null],
        ["^/api/.*$", null],
        ["price$", null],
        ["$argon2id$v", null],
        ["user=$U", { length: 2, query: "U" }],
        ["prefix_$D", { length: 2, query: "D" }],
    ])("finds the name typed in %j", (text, expected) => {
        expect(envQuery(text)).toEqual(expected);
    });
});

describe("filterEnvVariables", () => {
    const variables = [
        { name: "APP_DOMAIN", set: true, used: false },
        { name: "DOMAIN", set: true, used: false },
        { name: "DOMAIN_ALIAS", set: true, used: true },
        { name: "OTHER", set: true, used: true },
    ];

    it("puts the names starting with the query first and the used ones before the others", () => {
        expect(filterEnvVariables(variables, "dom").map((v) => v.name)).toEqual([
            "DOMAIN_ALIAS",
            "DOMAIN",
            "APP_DOMAIN",
        ]);
    });

    it("lists the used variables first without a query", () => {
        expect(filterEnvVariables(variables, "").map((v) => v.name)).toEqual([
            "DOMAIN_ALIAS",
            "OTHER",
            "APP_DOMAIN",
            "DOMAIN",
        ]);
    });

    it("limits the number of suggestions", () => {
        expect(filterEnvVariables(variables, "", 2)).toHaveLength(2);
    });
});
