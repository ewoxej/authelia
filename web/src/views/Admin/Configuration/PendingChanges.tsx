// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";

import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import {
    AdminPendingChange,
    AdminPendingChangeStatus,
    cancelAdminPendingChange,
    getAdminPendingChanges,
} from "@services/Admin";
import { useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import { formatDateTime } from "@views/Admin/Common/Format";
import { Btn, IconBtn, Note } from "@views/Admin/Common/ui";

// How often the changes are checked while one waits for a confirmation.
export const pendingPollInterval = 4000;

/**
 * Shows the configuration changes which wait for a confirmation on the server with the command which confirms them,
 * and reports when one is confirmed, rejected or expires.
 */
const PendingChanges = function (props: {
    // Incremented when a change was submitted so the list is loaded again.
    refresh: number;
    onApplied: () => void;
}) {
    const { t: translate } = useTranslation("admin");
    const handleError = useAdminErrorHandler();
    const { createErrorNotification, createInfoNotification, createSuccessNotification } = useNotifications();
    const [changes, setChanges] = useState<AdminPendingChange[]>([]);
    const knownRef = useRef(new Map<string, AdminPendingChangeStatus>());
    // The reports use the latest callbacks without loading the changes again when they change.
    const reportRef = useRef({
        createErrorNotification,
        createInfoNotification,
        createSuccessNotification,
        translate,
        ...props,
    });

    reportRef.current = {
        createErrorNotification,
        createInfoNotification,
        createSuccessNotification,
        translate,
        ...props,
    };

    const load = useCallback(async () => {
        let list: AdminPendingChange[];

        try {
            list = await getAdminPendingChanges();
        } catch {
            return;
        }

        const report = reportRef.current;

        for (const change of list) {
            if (knownRef.current.get(change.id) === "pending") {
                switch (change.status) {
                    case "applied":
                        report.createSuccessNotification(report.translate("The change was confirmed on the server"));
                        report.onApplied();
                        break;
                    case "rejected":
                        report.createErrorNotification(report.translate("The change was rejected on the server"));
                        break;
                    case "expired":
                        report.createInfoNotification(report.translate("The change expired before it was confirmed"));
                        break;
                }
            }

            knownRef.current.set(change.id, change.status);
        }

        setChanges(list.filter((change) => change.status === "pending"));
    }, []);

    useEffect(() => {
        load();
    }, [load, props.refresh]);

    useEffect(() => {
        if (changes.length === 0) return;

        const timer = setInterval(load, pendingPollInterval);

        return () => clearInterval(timer);
    }, [changes.length, load]);

    const handleWithdraw = async (id: string) => {
        try {
            await cancelAdminPendingChange(id);
            knownRef.current.set(id, "cancelled");
            setChanges((current) => current.filter((change) => change.id !== id));
            createInfoNotification(translate("The change was withdrawn"));
        } catch (err) {
            handleError(err, "Failed to withdraw the change");
        }
    };

    const handleCopy = async (command: string) => {
        try {
            await navigator.clipboard.writeText(command);
            createInfoNotification(translate("The command was copied"));
        } catch {
            createErrorNotification(translate("The command couldn't be copied"));
        }
    };

    return (
        <>
            {changes.map((change) => (
                <Note key={change.id} tone="warn" className="pending-change">
                    <span className="pending-change-body">
                        <b>{translate("A change waits for a confirmation on the server")}</b>
                        <span className="tx2">
                            {translate("Submitted by {{username}} on {{time}}, it expires on {{expires}}.", {
                                expires: formatDateTime(change.expires),
                                time: formatDateTime(change.created),
                                username: change.username,
                            })}
                        </span>
                        <span className="tx2">{translate("It has to be confirmed as it:")}</span>
                        <ul className="pending-change-reasons">
                            {change.reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                            ))}
                        </ul>
                        <span className="tx2">
                            {translate(
                                "Run this on the server to review and apply it, in Docker with 'docker exec -it <container>' before it:",
                            )}
                        </span>
                        <span className="pending-change-command">
                            <code className="mono">{change.command}</code>
                            <IconBtn
                                aria-label={translate("Copy the command")}
                                onClick={() => handleCopy(change.command)}
                            >
                                <Copy size={14} strokeWidth={1.75} aria-hidden />
                            </IconBtn>
                        </span>
                        <span>
                            <Btn size="sm" onClick={() => handleWithdraw(change.id)}>
                                {translate("Withdraw")}
                            </Btn>
                        </span>
                    </span>
                </Note>
            ))}
        </>
    );
};

export default PendingChanges;
