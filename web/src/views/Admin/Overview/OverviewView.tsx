// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

import { RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminActivitySubRoute, AdminRoute } from "@constants/Routes";
import { useNotifications } from "@contexts/NotificationsContext";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import {
    AdminAuthenticationLog,
    AdminStats,
    AdminStatsRange,
    getAdminAuthenticationLogs,
    getAdminStats,
    postAdminRestart,
} from "@services/Admin";
import { LogTable } from "@views/Admin/Activity/ActivityView";
import { useAdmin, useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import ConfirmDialog from "@views/Admin/Common/ConfirmDialog";
import { formatNumber } from "@views/Admin/Common/Format";
import { waitForRestart } from "@views/Admin/Common/Restart";
import { Badge, BadgeTone, Btn, Card, CardHeader, PageHeader, Seg, Stat } from "@views/Admin/Common/ui";

const componentTone: Record<string, BadgeTone> = { neutral: "neutral", ok: "accent", warn: "planned" };

const rangeLabels: Record<AdminStatsRange, string> = {
    "24h": "last 24 hours",
    "30d": "last 30 days",
    "7d": "last 7 days",
};

const OverviewView = function () {
    const { i18n, t: translate } = useTranslation("admin");
    const { overview } = useAdmin();
    const navigate = useRouterNavigate();
    const handleError = useAdminErrorHandler();
    const { createInfoNotification, createSuccessNotification } = useNotifications();

    const [range, setRange] = useState<AdminStatsRange>("24h");
    const [stats, setStats] = useState<AdminStats>();
    const [recent, setRecent] = useState<AdminAuthenticationLog[]>();
    const [restartOpen, setRestartOpen] = useState(false);

    useEffect(() => {
        getAdminStats(range)
            .then(setStats)
            .catch((err) => handleError(err, "Failed to load the statistics"));
    }, [range, handleError]);

    useEffect(() => {
        if (!overview.storage_supported) return;

        getAdminAuthenticationLogs({}, 0, 5)
            .then(setRecent)
            .catch((err) => handleError(err, "Failed to load the authentication log"));
    }, [overview.storage_supported, handleError]);

    const handleRestart = async () => {
        try {
            await postAdminRestart();
            setRestartOpen(false);
            createInfoNotification(translate("Janus is restarting"));

            if (await waitForRestart()) {
                createSuccessNotification(translate("Janus has restarted"));
                globalThis.location.reload();
            }
        } catch (err) {
            handleError(err, "Failed to restart Janus");
        }
    };

    const host = globalThis.location?.host || overview.host;
    const rangeLabel = translate(rangeLabels[range]);
    const locale = i18n.language;

    return (
        <section className="wrap">
            <ConfirmDialog
                open={restartOpen}
                title="Restart Janus"
                description={translate(
                    "All services will be stopped and started again with the current configuration files. Users stay signed in when the session storage is persistent (i.e. Redis).",
                )}
                confirmLabel="Restart"
                destructive
                onConfirm={handleRestart}
                onClose={() => setRestartOpen(false)}
            />

            <PageHeader
                title={translate("Overview")}
                description={
                    host ? (
                        <>
                            {translate("Instance health and authentication traffic for")}{" "}
                            <span className="mono">{host}</span>.
                        </>
                    ) : (
                        translate("Instance health and authentication traffic.")
                    )
                }
                actions={
                    <>
                        <Seg
                            label={translate("Range")}
                            value={range}
                            options={[
                                { label: "24h", value: "24h" },
                                { label: translate("7 days"), value: "7d" },
                                { label: translate("30 days"), value: "30d" },
                            ]}
                            onChange={setRange}
                        />
                        {overview.restart_enabled ? (
                            <Btn id="admin-restart" variant="danger" onClick={() => setRestartOpen(true)}>
                                <RotateCw size={14} strokeWidth={1.75} aria-hidden />
                                {translate("Restart")}
                            </Btn>
                        ) : null}
                    </>
                }
            />

            <div className="stats">
                <Stat
                    onCard
                    size="lg"
                    label={translate("Users")}
                    value={stats?.users_total ?? "—"}
                    sub={
                        stats?.users_total === null || stats?.users_total === undefined
                            ? translate("{{backend}} backend", { backend: overview.authentication_backend })
                            : translate("{{count}} disabled · {{backend}} backend", {
                                  backend: overview.authentication_backend,
                                  count: stats.users_disabled ?? 0,
                              })
                    }
                />
                <Stat
                    onCard
                    size="lg"
                    label={translate("Successful sign-ins")}
                    value={stats ? formatNumber(stats.successful, locale) : "—"}
                    sub={rangeLabel}
                />
                <Stat
                    onCard
                    size="lg"
                    label={translate("Failed sign-ins")}
                    value={stats ? formatNumber(stats.failed, locale) : "—"}
                    color="var(--a-out)"
                    sub={rangeLabel}
                />
                <Stat
                    onCard
                    size="lg"
                    label={translate("Active bans")}
                    value={stats ? stats.bans_users + stats.bans_ips : "—"}
                    color="var(--a-alert-tx)"
                    sub={
                        stats
                            ? translate("{{users}} user · {{ips}} IP", { ips: stats.bans_ips, users: stats.bans_users })
                            : undefined
                    }
                />
            </div>

            <div className="ov-grid">
                <Card>
                    <CardHeader title={translate("Components")} period={translate("from the configuration")} />
                    <div>
                        {(overview.components ?? []).map((component) => (
                            <div key={component.name} className="comp">
                                <div className="n">
                                    {translate(component.name)}
                                    <div className="d" title={component.detail}>
                                        {component.detail}
                                    </div>
                                </div>
                                <Badge tone={componentTone[component.status]}>{translate(component.label)}</Badge>
                            </div>
                        ))}
                    </div>
                </Card>
                {overview.storage_supported ? (
                    <Card flush className="wide">
                        <CardHeader
                            title={translate("Recent activity")}
                            period={translate("last 5 events")}
                            style={{ marginBottom: 14, padding: "18px 20px 0" }}
                            actions={
                                <button
                                    type="button"
                                    className="link"
                                    onClick={() => navigate(`${AdminRoute}${AdminActivitySubRoute}`)}
                                >
                                    {translate("All activity")} →
                                </button>
                            }
                        />
                        <div className="scroll" style={{ paddingBottom: 6 }}>
                            <LogTable logs={recent} />
                        </div>
                    </Card>
                ) : null}
            </div>
        </section>
    );
};

export default OverviewView;
