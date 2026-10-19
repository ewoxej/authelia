// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

import { getAdminFiles } from "@services/Admin";

let cached: Promise<string[]> | undefined;

/** The directories the file browser is allowed to open, loaded once. */
const loadRoots = () => {
    cached ??= getAdminFiles("")
        .then((listing) => listing.entries.map((entry) => entry.name))
        .catch(() => {
            cached = undefined;

            return [];
        });

    return cached;
};

export const useFileRoots = () => {
    const [roots, setRoots] = useState<string[]>([]);

    useEffect(() => {
        let active = true;

        loadRoots()
            .then((result) => active && setRoots(result))
            .catch(console.error);

        return () => {
            active = false;
        };
    }, []);

    return roots;
};

/** Shows a path from the allowed directory it is in, i.e. '/config/secrets/a' as 'config/secrets/a' for the root '/config'. */
export const fromRoot = (path: string, roots: string[]) => {
    const root = roots
        .filter((r) => path === r || path.startsWith(r.endsWith("/") ? r : `${r}/`))
        .sort((a, b) => b.length - a.length)[0];

    if (!root) {
        return path;
    }

    const trimmed = root.replace(/\/+$/, "");
    const base = trimmed.slice(trimmed.lastIndexOf("/") + 1);

    return base + path.slice(trimmed.length);
};
