// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

import { AdminEnvironmentVariable, getAdminEnvironment } from "@services/Admin";

let cached: Promise<AdminEnvironmentVariable[]> | undefined;
const listeners = new Set<(_variables: AdminEnvironmentVariable[]) => void>();

const load = () => {
    cached ??= getAdminEnvironment().catch(() => {
        cached = undefined;

        return [];
    });

    return cached;
};

/** Loads the environment variables again, i.e. after a change made one of them used by the configuration. */
export const refreshEnvironment = () => {
    cached = undefined;

    load().then((variables) => listeners.forEach((listener) => listener(variables)));
};

/** The environment variables the configuration can reference, loaded once for all fields. */
export const useEnvironment = () => {
    const [variables, setVariables] = useState<AdminEnvironmentVariable[]>([]);

    useEffect(() => {
        let active = true;

        load().then((loaded) => active && setVariables(loaded));
        listeners.add(setVariables);

        return () => {
            active = false;
            listeners.delete(setVariables);
        };
    }, []);

    return variables;
};
