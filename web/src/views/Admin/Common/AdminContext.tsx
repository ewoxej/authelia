// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { createContext, use, useCallback } from "react";

import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import { AdminOverview, AdminRequestError } from "@services/Admin";

export interface AdminContextValue {
    overview: AdminOverview;
    refreshOverview: () => Promise<void>;
    requireElevation: () => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
    const value = use(AdminContext);

    if (!value) {
        throw new Error("useAdmin must be used within the AdminContext provider");
    }

    return value;
}

/**
 * Returns a function which reports an error from an administration API call, asking for identity verification again
 * when the elevation has expired.
 */
export function useAdminErrorHandler() {
    const { t: translate } = useTranslation("admin");
    const { createErrorNotification } = useNotifications();
    const { requireElevation } = useAdmin();

    return useCallback(
        (err: unknown, fallback?: string) => {
            if (err instanceof AdminRequestError && (err.elevation || err.secondFactor)) {
                requireElevation();

                return;
            }

            console.error(err);

            const message = err instanceof Error && err.message ? err.message : "";

            createErrorNotification(
                fallback ? `${translate(fallback)}${message ? `: ${translate(message)}` : ""}` : translate(message),
            );
        },
        [createErrorNotification, requireElevation, translate],
    );
}
