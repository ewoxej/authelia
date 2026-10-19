// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

// Spreadsheet applications run a cell which starts with one of these as a formula. Usernames and request URIs in the
// activity come from whoever tried to sign in, so a value like '=HYPERLINK(...)' would run when the export is opened.
// Some spreadsheets also accept the full width forms of the characters and ignore leading spaces.
const reFormula = /^\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r]/;

/** Returns the cell quoted for CSV, with a leading apostrophe when a spreadsheet would read it as a formula. */
export const csvCell = (value: string) => {
    const cell = reFormula.test(value) ? `'${value}` : value;

    return `"${cell.replaceAll('"', '""')}"`;
};

/** Returns the rows as CSV. */
export const toCSV = (rows: string[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\n");

/** Downloads the rows as a CSV file. */
export const downloadCSV = (name: string, rows: string[][]) => {
    const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");

    link.href = url;
    link.download = name;
    link.click();

    URL.revokeObjectURL(url);
};
