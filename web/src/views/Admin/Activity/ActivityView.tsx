// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { useNotifications } from "@contexts/NotificationsContext";
import {
    AdminAuthenticationLog,
    AdminConsent,
    AdminLogKind,
    AdminStats,
    getAdminAuthenticationLogs,
    getAdminConsents,
    getAdminStats,
    revokeAdminConsent,
} from "@services/Admin";
import { useAdmin, useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import ConfirmDialog from "@views/Admin/Common/ConfirmDialog";
import { downloadCSV } from "@views/Admin/Common/CSV";
import { formatDateTime, formatNumber, formatShort, formatTime } from "@views/Admin/Common/Format";
import {
    Badge,
    BadgeTone,
    Btn,
    Card,
    CardHeader,
    Note,
    PageHeader,
    SearchBox,
    Seg,
    Spinner,
    Stat,
} from "@views/Admin/Common/ui";

const pageSize = 50;

type EventKind = "2fa" | "banned" | "failed" | "sign-in";

const eventTone: Record<EventKind, BadgeTone> = {
    "2fa": "neutral",
    banned: "alert",
    failed: "high",
    "sign-in": "accent",
};

export function logEvent(log: AdminAuthenticationLog): EventKind {
    if (log.banned) return "banned";
    if (!log.successful) return "failed";

    return log.type === "1FA" || log.type === "Passkey" ? "sign-in" : "2fa";
}

function logTarget(log: AdminAuthenticationLog): string {
    if (!log.request_uri) return "—";

    try {
        return new URL(log.request_uri).host || log.request_uri;
    } catch {
        return log.request_uri;
    }
}

function logDetails(log: AdminAuthenticationLog, translate: (_key: string) => string): string {
    const method = log.type === "1FA" ? translate("password") : log.type.toLowerCase();

    if (log.banned) return `${translate("rejected while banned")} · ${method}`;
    if (!log.successful) return `${translate("failed")} · ${method}`;

    return method;
}

export const LogTable = function (props: { logs?: AdminAuthenticationLog[] }) {
    const { i18n, t: translate } = useTranslation("admin");

    if (!props.logs) {
        return <Spinner />;
    }

    return (
        <table className="tbl">
            <thead>
                <tr>
                    <th>{translate("Time")}</th>
                    <th>{translate("Event")}</th>
                    <th>{translate("User")}</th>
                    <th>IP</th>
                    <th>{translate("Target")}</th>
                    <th>{translate("Details")}</th>
                </tr>
            </thead>
            <tbody>
                {props.logs.length === 0 ? (
                    <tr className="none">
                        <td colSpan={6}>{translate("No events match.")}</td>
                    </tr>
                ) : null}
                {props.logs.map((log) => {
                    const event = logEvent(log);

                    return (
                        <tr key={log.id}>
                            <td>
                                <span className="mono" style={{ fontSize: 12.5 }}>
                                    {formatTime(log.time, i18n.language)}
                                </span>
                                <span className="mono tx3" style={{ fontSize: 11, marginLeft: 8 }}>
                                    {formatShort(log.time, i18n.language).split(" · ")[0]}
                                </span>
                            </td>
                            <td>
                                <Badge tone={eventTone[event]}>{event}</Badge>
                            </td>
                            <td>{log.username || "—"}</td>
                            <td className="mono tx2" style={{ fontSize: 12.5 }}>
                                {log.remote_ip || "—"}
                            </td>
                            <td className="mono tx2" style={{ fontSize: 12.5 }} title={log.request_uri}>
                                {logTarget(log)}
                            </td>
                            <td className="tx2" style={{ fontSize: 12.5 }}>
                                {logDetails(log, translate)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

function useDebounced<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);

        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

const ActivityView = function () {
    const { i18n, t: translate } = useTranslation("admin");
    const { overview } = useAdmin();
    const handleError = useAdminErrorHandler();
    const [searchParams] = useSearchParams();

    const [kind, setKind] = useState<AdminLogKind>("");
    const [search, setSearch] = useState(searchParams.get("username") ?? "");
    const [stats, setStats] = useState<AdminStats>();
    const [logs, setLogs] = useState<AdminAuthenticationLog[]>();
    const [page, setPage] = useState(0);
    const [more, setMore] = useState(false);

    const query = useDebounced(search.trim());

    useEffect(() => {
        getAdminStats("24h")
            .then(setStats)
            .catch((err) => handleError(err, "Failed to load the statistics"));
    }, [handleError]);

    const load = useCallback(
        async (next: number) => {
            try {
                const result = await getAdminAuthenticationLogs({ kind, q: query }, next, pageSize);

                setLogs((current) => (next === 0 ? result : [...(current ?? []), ...result]));
                setMore(result.length === pageSize);
                setPage(next);
            } catch (err) {
                setLogs((current) => current ?? []);
                handleError(err, "Failed to load the authentication log");
            }
        },
        [kind, query, handleError],
    );

    useEffect(() => {
        load(0).catch(console.error);
    }, [load]);

    const handleExport = () => {
        downloadCSV("authelia-activity.csv", [
            ["time", "event", "username", "remote_ip", "auth_type", "request_method", "request_uri"],
            ...(logs ?? []).map((log) => [
                log.time,
                logEvent(log),
                log.username,
                log.remote_ip,
                log.type,
                log.request_method,
                log.request_uri,
            ]),
        ]);
    };

    const locale = i18n.language;

    return (
        <section className="wrap">
            <PageHeader
                title={translate("Activity")}
                description={translate("Sign-ins, second factor checks and bans.")}
                actions={
                    <Btn disabled={!logs?.length} onClick={handleExport}>
                        {translate("Export CSV")}
                    </Btn>
                }
            />

            {!overview.storage_supported ? (
                <Note tone="warn">
                    {translate("The configured storage backend does not support the activity views.")}
                </Note>
            ) : null}

            <div className="stats">
                <Stat
                    onCard
                    label={translate("Events today")}
                    value={stats ? formatNumber(stats.total, locale) : "—"}
                    sub={translate("last 24 hours")}
                />
                <Stat
                    onCard
                    label={translate("Failed sign-ins")}
                    value={stats ? formatNumber(stats.failed, locale) : "—"}
                    color="var(--a-out)"
                    sub={stats ? translate("{{count}} rejected while banned", { count: stats.banned }) : undefined}
                />
                <Stat
                    onCard
                    label={translate("Unique IPs")}
                    value={stats ? formatNumber(stats.unique_ips, locale) : "—"}
                    sub={translate("last 24 hours")}
                />
                <Stat
                    onCard
                    label={translate("Second factor share")}
                    value={
                        stats ? (
                            <>
                                {stats.second_factor_share}
                                <small>%</small>
                            </>
                        ) : (
                            "—"
                        )
                    }
                    sub={translate("of successful sign-ins")}
                />
            </div>

            <Card flush>
                <div className="toolbar">
                    <Seg
                        label={translate("Event filter")}
                        value={kind}
                        options={[
                            { label: translate("All"), value: "" },
                            { label: translate("Sign-ins"), value: "sign-in" },
                            { label: translate("Failures"), value: "failed" },
                            { label: translate("Second factor"), value: "2fa" },
                            { label: translate("Bans"), value: "banned" },
                        ]}
                        onChange={setKind}
                    />
                    <div className="spacer" />
                    <SearchBox
                        value={search}
                        placeholder={translate("User or IP")}
                        style={{ flex: "0 1 280px" }}
                        onChange={setSearch}
                    />
                </div>
                <div className="scroll">
                    <LogTable logs={logs} />
                </div>
                <div className="cardfoot">
                    <span className="mono">{translate("{{count}} events shown", { count: logs?.length ?? 0 })}</span>
                    <div className="spacer" />
                    <Btn size="sm" disabled={!more} onClick={() => load(page + 1)}>
                        {translate("Load more")}
                    </Btn>
                </div>
            </Card>

            <ConsentsCard username={query} />
        </section>
    );
};

const ConsentsCard = function (props: { username: string }) {
    const { t: translate } = useTranslation("admin");
    const handleError = useAdminErrorHandler();
    const { createSuccessNotification } = useNotifications();
    const [consents, setConsents] = useState<AdminConsent[]>();
    const [revoking, setRevoking] = useState<AdminConsent | null>(null);

    const load = useCallback(async () => {
        try {
            setConsents(await getAdminConsents(props.username, 0, 100));
        } catch (err) {
            setConsents([]);
            handleError(err, "Failed to load the consents");
        }
    }, [props.username, handleError]);

    useEffect(() => {
        load().catch(console.error);
    }, [load]);

    return (
        <Card flush>
            <ConfirmDialog
                open={!!revoking}
                title="Revoke Consent"
                description={translate(
                    "The user will be asked for consent again the next time the client {{client}} requests access.",
                    { client: revoking?.client_id },
                )}
                confirmLabel="Revoke"
                destructive
                onClose={() => setRevoking(null)}
                onConfirm={async () => {
                    if (!revoking) return;

                    try {
                        await revokeAdminConsent(revoking.id);
                        setRevoking(null);
                        createSuccessNotification(translate("The consent was revoked"));
                        await load();
                    } catch (err) {
                        handleError(err, "Failed to revoke the consent");
                    }
                }}
            />
            <CardHeader
                title={translate("OpenID Connect consents")}
                subtitle={translate("Remembered consents skip the consent screen until they expire.")}
                style={{ marginBottom: 14, padding: "18px 20px 0" }}
            />
            <div className="scroll">
                {consents ? (
                    <table className="tbl">
                        <thead>
                            <tr>
                                <th>{translate("User")}</th>
                                <th>{translate("Client")}</th>
                                <th>{translate("Scopes")}</th>
                                <th>{translate("Granted")}</th>
                                <th>{translate("Expires")}</th>
                                <th>
                                    <span className="sr">{translate("Actions")}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {consents.length === 0 ? (
                                <tr className="none">
                                    <td colSpan={6}>{translate("No remembered consents.")}</td>
                                </tr>
                            ) : null}
                            {consents.map((consent) => (
                                <tr key={consent.id}>
                                    <td>{consent.username}</td>
                                    <td className="mono">{consent.client_id}</td>
                                    <td>
                                        <div className="tags">
                                            {(consent.scopes ?? []).map((scope) => (
                                                <span key={scope} className="tag plain">
                                                    {scope}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="mono tx2" style={{ fontSize: 12.5 }}>
                                        {formatDateTime(consent.created_at)}
                                    </td>
                                    <td className="mono tx2" style={{ fontSize: 12.5 }}>
                                        {consent.expires_at ? formatDateTime(consent.expires_at) : translate("never")}
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                        <Btn size="sm" onClick={() => setRevoking(consent)}>
                                            {translate("Revoke")}
                                        </Btn>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <Spinner />
                )}
            </div>
        </Card>
    );
};

export default ActivityView;
