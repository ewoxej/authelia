// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";

import { useTranslation } from "react-i18next";

type DiffLine = { kind: "-" | " " | "+"; text: string };

const maxCells = 4_000_000;
const context = 3;

export function diffLines(before: string, after: string): DiffLine[] | null {
    const a = before.split("\n");
    const b = after.split("\n");

    // Trim the common prefix and suffix to keep the LCS table small.
    let start = 0;

    while (start < a.length && start < b.length && a[start] === b[start]) start++;

    let endA = a.length;
    let endB = b.length;

    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }

    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);

    if ((midA.length + 1) * (midB.length + 1) > maxCells) {
        return null;
    }

    const n = midA.length;
    const m = midB.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }

    const result: DiffLine[] = a.slice(0, start).map((text) => ({ kind: " ", text }));

    let i = 0;
    let j = 0;

    while (i < n && j < m) {
        if (midA[i] === midB[j]) {
            result.push({ kind: " ", text: midA[i] });
            i++;
            j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            result.push({ kind: "-", text: midA[i++] });
        } else {
            result.push({ kind: "+", text: midB[j++] });
        }
    }

    while (i < n) result.push({ kind: "-", text: midA[i++] });
    while (j < m) result.push({ kind: "+", text: midB[j++] });

    for (const text of a.slice(endA)) result.push({ kind: " ", text });

    return result;
}

const DiffView = function (props: { before: string; after: string }) {
    const { t: translate } = useTranslation("admin");

    const lines = useMemo(() => diffLines(props.before, props.after), [props.before, props.after]);

    if (lines === null) {
        return <p className="tx3">{translate("The change is too large to display.")}</p>;
    }

    if (!lines.some((line) => line.kind !== " ")) {
        return <p className="tx3">{translate("There are no changes.")}</p>;
    }

    // Only show the changed lines with some context around them.
    const visible = lines.map((_line, index) =>
        lines.slice(Math.max(0, index - context), index + context + 1).some((l) => l.kind !== " "),
    );

    return (
        <pre className="diff">
            {lines.map((line, index) => {
                if (!visible[index]) {
                    return index > 0 && visible[index - 1] ? (
                        // eslint-disable-next-line @eslint-react/no-array-index-key
                        <div key={index} className="tx3">
                            ⋯
                        </div>
                    ) : null;
                }

                return (
                    <div
                        // eslint-disable-next-line @eslint-react/no-array-index-key
                        key={index}
                        className={line.kind === "+" ? "add" : line.kind === "-" ? "del" : undefined}
                    >
                        {line.kind} {line.text}
                    </div>
                );
            })}
        </pre>
    );
};

export default DiffView;
