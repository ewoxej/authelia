// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { AdminEnvironmentVariable } from "@services/Admin";

/** A part of a value: text, or an environment variable which is written as a template expression. */
export type EnvSegment = { kind: "env"; name: string } | { kind: "text"; text: string };

// Only the plain form is shown as a token, expressions with functions or whitespace trimming stay text so nothing about
// them is lost when the value is written back.
const reEnvExpression = /\{\{\s*env\s+"([A-Za-z_][A-Za-z0-9_]*)"\s*\}\}/g;

// The name being typed after a dollar sign before the caret. The dollar sign has to start the value or follow a
// separator, so a regular expression ending with '.*$' or a password hash doesn't open the suggestions.
const reEnvQuery = /(?<=^|[\s/:.@=,'"(_-])\$([A-Za-z0-9_]*)$/;

export const envExpression = (name: string) => `{{ env "${name}" }}`;

/** Splits a value into text and the environment variables it references. */
export const parseEnvSegments = (value: string): EnvSegment[] => {
    const segments: EnvSegment[] = [];
    let last = 0;

    for (const match of value.matchAll(reEnvExpression)) {
        if (match.index > last) {
            segments.push({ kind: "text", text: value.slice(last, match.index) });
        }

        segments.push({ kind: "env", name: match[1] });
        last = match.index + match[0].length;
    }

    if (last < value.length) {
        segments.push({ kind: "text", text: value.slice(last) });
    }

    return segments;
};

/** Joins the segments into the value, with the environment variables written as template expressions. */
export const serializeEnvSegments = (segments: EnvSegment[]) =>
    segments.map((segment) => (segment.kind === "env" ? envExpression(segment.name) : segment.text)).join("");

/** True when the value references an environment variable which is shown as a token. */
export const hasEnvTokens = (value: string | undefined) =>
    !!value && parseEnvSegments(value).some((segment) => segment.kind === "env");

/** True when the value has template expressions which aren't shown as tokens. */
export const hasOtherTemplates = (value: string | undefined) =>
    !!value && value.replace(reEnvExpression, "").includes("{{");

/** Returns the name being typed when the text before the caret ends with a dollar sign and a partial name. */
export const envQuery = (textBeforeCaret: string): { query: string; length: number } | null => {
    const match = reEnvQuery.exec(textBeforeCaret);

    return match ? { length: match[0].length, query: match[1] } : null;
};

/** Returns the variables matching the query, the ones starting with it first and the ones in use before the others. */
export const filterEnvVariables = (variables: AdminEnvironmentVariable[], query: string, limit = 50) => {
    const needle = query.toUpperCase();

    return variables
        .filter((variable) => variable.name.toUpperCase().includes(needle))
        .sort((a, b) => {
            const prefix =
                Number(b.name.toUpperCase().startsWith(needle)) - Number(a.name.toUpperCase().startsWith(needle));

            if (prefix !== 0) return prefix;

            const used = Number(b.used) - Number(a.used);

            return used !== 0 ? used : a.name.localeCompare(b.name);
        })
        .slice(0, limit);
};
