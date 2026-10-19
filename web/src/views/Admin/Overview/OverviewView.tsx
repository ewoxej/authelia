// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { MouseEvent, useEffect, useState } from "react";

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
import { Badge, BadgeTone, Btn, Card, CardHeader, Dot, Note, PageHeader, Seg, Stat } from "@views/Admin/Common/ui";

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
    const average = stats && stats.buckets.length ? (stats.total / stats.buckets.length).toFixed(1) : "—";

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

            {overview.configuration_filters && overview.configuration_filters.length !== 0 ? (
                <Note tone="info">
                    {translate(
                        "The configuration files are processed by filters ({{filters}}). Template expressions are shown as text in the forms and are saved exactly as written.",
                        { filters: overview.configuration_filters.join(", ") },
                    )}
                </Note>
            ) : null}

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
                <Card className="wide">
                    <CardHeader
                        title={translate("Sign-ins")}
                        period={`${rangeLabel} · ${translate(range === "24h" ? "hourly" : "daily")}`}
                        style={{ alignItems: "flex-start", marginBottom: 18 }}
                        actions={
                            <div className="legend">
                                <span>
                                    <Dot color="var(--a-accent)" />
                                    {translate("successful")}
                                </span>
                                <span>
                                    <Dot color="var(--a-out)" />
                                    {translate("failed")}
                                </span>
                            </div>
                        }
                    />
                    <Chart stats={stats} locale={locale} />
                    <div
                        className="stats"
                        style={{ gap: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 18 }}
                    >
                        <Stat
                            label={translate("Total")}
                            size="sm"
                            value={stats ? formatNumber(stats.total, locale) : "—"}
                        />
                        <Stat
                            label={translate(range === "24h" ? "Hourly avg" : "Daily avg")}
                            size="sm"
                            value={average}
                        />
                        <Stat
                            label={translate("2FA share")}
                            size="sm"
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
                        />
                    </div>
                </Card>
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
            </div>

            {overview.storage_supported ? (
                <Card flush>
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
        </section>
    );
};

const Chart = function (props: { stats?: AdminStats; locale: string }) {
    const { t: translate } = useTranslation("admin");
    const [tip, setTip] = useState<{ x: number; y: number; index: number } | null>(null);

    const buckets = props.stats?.buckets ?? [];
    const hourly = props.stats?.range === "24h";
    const max = Math.max(1, ...buckets.map((b) => b.successful + b.failed));
    const every = Math.max(1, Math.ceil(buckets.length / 8));

    const label = (start: string) => {
        const date = new Date(start);

        return hourly
            ? date.toLocaleTimeString(props.locale, { hour: "2-digit", hour12: false })
            : date.toLocaleDateString(props.locale, { day: "2-digit", month: "short" });
    };

    const handleMove = (e: MouseEvent<HTMLDivElement>, index: number) =>
        setTip({ index, x: e.clientX + 12, y: e.clientY - 56 });

    const active = tip ? buckets[tip.index] : undefined;

    return (
        <>
            <div className="chart" onMouseLeave={() => setTip(null)}>
                {buckets.map((bucket, index) => (
                    <div
                        key={bucket.start}
                        className="bar"
                        style={{ height: `${((bucket.successful + bucket.failed) / max) * 100}%` }}
                        onMouseMove={(e) => handleMove(e, index)}
                    >
                        {bucket.successful ? <div className="ok" style={{ flex: bucket.successful }} /> : null}
                        {bucket.failed ? <div className="bad" style={{ flex: bucket.failed }} /> : null}
                    </div>
                ))}
            </div>
            <div className="chart-x">
                {buckets.map((bucket, index) => (
                    <span key={bucket.start}>{index % every === 0 ? label(bucket.start) : ""}</span>
                ))}
            </div>
            {tip && active ? (
                <div className="adm tip" style={{ left: tip.x, top: tip.y }}>
                    <span className="p">{label(active.start)}</span>
                    <span className="v">
                        {translate("{{count}} ok", { count: active.successful })}
                        {active.failed ? (
                            <>
                                {" · "}
                                <span style={{ color: "var(--a-out)" }}>
                                    {translate("{{count}} failed", { count: active.failed })}
                                </span>
                            </>
                        ) : null}
                    </span>
                </div>
            ) : null}
        </>
    );
};

export default OverviewView;
