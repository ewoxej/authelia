// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from "react";

import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import {
    AdminBan,
    AdminBans,
    banAdminIP,
    banAdminUser,
    getAdminBans,
    revokeAdminIPBan,
    revokeAdminUserBan,
} from "@services/Admin";
import { adminConfigurationPath } from "@views/Admin/AdminLayout";
import { useAdmin, useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import ConfirmDialog from "@views/Admin/Common/ConfirmDialog";
import { formatRelative, formatSeconds, formatShort } from "@views/Admin/Common/Format";
import {
    Avatar,
    Badge,
    BadgeTone,
    Btn,
    Card,
    CardHeader,
    PageHeader,
    SearchBox,
    Seg,
    Spinner,
    Stat,
} from "@views/Admin/Common/ui";
import { adminUserPath } from "@views/Admin/Users/UsersView";

type Kind = "ip" | "user";

interface Row extends AdminBan {
    kind: Kind;
}

const sourceTone: Record<string, BadgeTone> = { admin: "alert", cli: "neutral", regulation: "planned" };

const BansView = function () {
    const { i18n, t: translate } = useTranslation("admin");
    const { overview } = useAdmin();
    const navigate = useRouterNavigate();
    const handleError = useAdminErrorHandler();
    const { createSuccessNotification } = useNotifications();

    const [history, setHistory] = useState(false);
    const [bans, setBans] = useState<AdminBans>();
    const [counts, setCounts] = useState<{ active: number; history: number }>();
    const [search, setSearch] = useState("");
    const [revoking, setRevoking] = useState<null | Row>(null);
    const [banOpen, setBanOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const [active, all] = await Promise.all([getAdminBans(false), getAdminBans(true).catch(() => null)]);

            setCounts({
                active: active.users.length + active.ips.length,
                history: all ? all.users.length + all.ips.length : 0,
            });
            setBans(history && all ? all : active);
        } catch (err) {
            handleError(err, "Failed to load the bans");
        }
    }, [history, handleError]);

    useEffect(() => {
        load().catch(console.error);
    }, [load]);

    const rows = useMemo<Row[]>(() => {
        if (!bans) return [];

        const q = search.trim().toLowerCase();

        return [
            ...bans.users.map((ban) => ({ ...ban, kind: "user" as Kind })),
            ...bans.ips.map((ban) => ({ ...ban, kind: "ip" as Kind })),
        ]
            .filter((ban) => !q || ban.value.toLowerCase().includes(q) || ban.reason.toLowerCase().includes(q))
            .sort((a, b) => b.time.localeCompare(a.time));
    }, [bans, search]);

    const regulation = overview.regulation;
    const findTime = formatSeconds(regulation.find_time);
    const banTime = formatSeconds(regulation.ban_time);
    const locale = i18n.language;

    return (
        <section className="wrap">
            <ConfirmDialog
                open={!!revoking}
                title="Lift Ban"
                description={translate("The ban of {{value}} will be lifted.", { value: revoking?.value })}
                confirmLabel="Unban"
                onClose={() => setRevoking(null)}
                onConfirm={async () => {
                    if (!revoking) return;

                    try {
                        await (revoking.kind === "user"
                            ? revokeAdminUserBan(revoking.id)
                            : revokeAdminIPBan(revoking.id));
                        setRevoking(null);
                        createSuccessNotification(translate("The ban was lifted"));
                        await load();
                    } catch (err) {
                        handleError(err, "Failed to lift the ban");
                    }
                }}
            />
            {banOpen ? (
                <BanDialog
                    onClose={() => setBanOpen(false)}
                    onSaved={() => {
                        setBanOpen(false);
                        createSuccessNotification(translate("The ban was added"));
                        load().catch(console.error);
                    }}
                />
            ) : null}

            <PageHeader
                title={translate("Bans")}
                description={translate("Users and IPs blocked by regulation or by hand.")}
                actions={
                    <Btn variant="primary" onClick={() => setBanOpen(true)}>
                        {translate("Ban user or IP")}
                    </Btn>
                }
            />

            <Card>
                <CardHeader
                    title={translate("Regulation")}
                    subtitle={translate("Automatic bans after repeated failed sign-ins.")}
                    actions={
                        <button
                            type="button"
                            className="link"
                            onClick={() => navigate(adminConfigurationPath("security"))}
                        >
                            {translate("Edit in Configuration")} →
                        </button>
                    }
                />
                <div className="stats" style={{ gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                    <Stat
                        label={translate("Max retries")}
                        value={regulation.max_retries || translate("off")}
                        sub={translate("failed attempts")}
                    />
                    <Stat
                        label={translate("Find time")}
                        value={
                            <>
                                {findTime.value}
                                <small>{findTime.unit}</small>
                            </>
                        }
                        sub={translate("window for the retries")}
                    />
                    <Stat
                        label={translate("Ban time")}
                        value={
                            <>
                                {banTime.value}
                                <small>{banTime.unit}</small>
                            </>
                        }
                        sub={translate("then lifted automatically")}
                    />
                    <Stat
                        label={translate("Modes")}
                        size="sm"
                        value={(regulation.modes ?? ["user"]).join(" · ")}
                        sub={translate("what gets banned")}
                    />
                </div>
            </Card>

            <Card flush>
                <div className="toolbar">
                    <Seg
                        label={translate("Ban list")}
                        value={history ? "history" : "active"}
                        options={[
                            { label: `${translate("Active")} · ${counts?.active ?? "…"}`, value: "active" },
                            { label: `${translate("History")} · ${counts?.history ?? "…"}`, value: "history" },
                        ]}
                        onChange={(value) => setHistory(value === "history")}
                    />
                    <div className="spacer" />
                    <SearchBox
                        value={search}
                        placeholder={translate("User or IP")}
                        style={{ flex: "0 1 260px" }}
                        onChange={setSearch}
                    />
                </div>
                <div className="scroll">
                    {bans ? (
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>{translate("Target")}</th>
                                    <th>{translate("Type")}</th>
                                    <th>{translate("Source")}</th>
                                    <th>{translate("Reason")}</th>
                                    <th>{translate("Banned")}</th>
                                    <th>{translate("Expires")}</th>
                                    <th>
                                        <span className="sr">{translate("Actions")}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr className="none">
                                        <td colSpan={7}>{translate(history ? "No bans yet." : "No active bans")}</td>
                                    </tr>
                                ) : null}
                                {rows.map((ban) => (
                                    <tr key={`${ban.kind}-${ban.id}`}>
                                        <td>
                                            {ban.kind === "user" ? (
                                                <button
                                                    type="button"
                                                    className="cell-user"
                                                    style={{
                                                        background: "none",
                                                        border: 0,
                                                        color: "inherit",
                                                        cursor: "pointer",
                                                        gap: 10,
                                                        padding: 0,
                                                    }}
                                                    onClick={() => navigate(adminUserPath(ban.value))}
                                                >
                                                    <Avatar name={ban.value} size={26} />
                                                    <span className="mono">{ban.value}</span>
                                                </button>
                                            ) : (
                                                <span className="mono">{ban.value}</span>
                                            )}
                                        </td>
                                        <td>
                                            <Badge>{ban.kind}</Badge>
                                        </td>
                                        <td>
                                            <Badge tone={sourceTone[ban.source] ?? "neutral"}>
                                                {ban.source === "admin" ? translate("manual") : ban.source}
                                            </Badge>
                                        </td>
                                        <td className="tx2" style={{ fontSize: 12.5 }}>
                                            {ban.reason || "—"}
                                        </td>
                                        <td className="mono tx2" style={{ fontSize: 12.5 }}>
                                            {formatShort(ban.time, locale)}
                                        </td>
                                        <td>
                                            <span
                                                className="mono"
                                                style={{
                                                    color: ban.active && ban.expires ? "var(--a-out)" : "var(--a-tx2)",
                                                    fontSize: 12.5,
                                                }}
                                            >
                                                {!ban.active
                                                    ? translate("lifted or expired")
                                                    : ban.expires
                                                      ? formatRelative(ban.expires, locale)
                                                      : translate("never")}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: "right" }}>
                                            {ban.active ? (
                                                <Btn size="sm" onClick={() => setRevoking(ban)}>
                                                    {translate("Unban")}
                                                </Btn>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <Spinner />
                    )}
                </div>
                <div className="cardfoot">{translate("Expired and lifted bans are listed in History.")}</div>
            </Card>
        </section>
    );
};

const BanDialog = function (props: { onClose: () => void; onSaved: () => void }) {
    const { t: translate } = useTranslation("admin");
    const handleError = useAdminErrorHandler();
    const [kind, setKind] = useState<Kind>("user");
    const [target, setTarget] = useState("");
    const [hours, setHours] = useState("24");
    const [reason, setReason] = useState("");

    return (
        <ConfirmDialog
            open
            title="Ban user or IP"
            confirmLabel="Ban"
            destructive
            onClose={props.onClose}
            onConfirm={async () => {
                const duration = Math.max(0, Math.round(Number(hours || 0) * 3600));

                if (target.trim() === "") {
                    handleError(new Error(translate("Enter a username or an IP address.")));

                    return;
                }

                try {
                    await (kind === "user"
                        ? banAdminUser(target.trim(), duration, reason)
                        : banAdminIP(target.trim(), duration, reason));
                    props.onSaved();
                } catch (err) {
                    handleError(err, "Failed to add the ban");
                }
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Seg
                    label={translate("Type")}
                    value={kind}
                    options={[
                        { label: translate("User"), value: "user" },
                        { label: "IP", value: "ip" },
                    ]}
                    onChange={setKind}
                />
                <div className="fld">
                    <div className="fld-head">
                        <label className="fld-label" htmlFor="ban-target">
                            {translate(kind === "user" ? "Username" : "IP address")}
                        </label>
                    </div>
                    <input
                        id="ban-target"
                        className="inp mono"
                        value={target}
                        placeholder={kind === "user" ? "john" : "203.0.113.7"}
                        onChange={(e) => setTarget(e.target.value)}
                    />
                </div>
                <div className="fld">
                    <div className="fld-head">
                        <label className="fld-label" htmlFor="ban-hours">
                            {translate("Duration (hours)")}
                        </label>
                    </div>
                    <input
                        id="ban-hours"
                        className="inp mono"
                        type="number"
                        min={0}
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                    />
                    <span className="help">{translate("Use 0 for a permanent ban.")}</span>
                </div>
                <div className="fld">
                    <div className="fld-head">
                        <label className="fld-label" htmlFor="ban-reason">
                            {translate("Reason")}
                        </label>
                    </div>
                    <input id="ban-reason" className="inp" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
            </div>
        </ConfirmDialog>
    );
};

export default BansView;
