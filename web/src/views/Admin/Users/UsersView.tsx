// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminRoute, AdminUsersSubRoute } from "@constants/Routes";
import { useNotifications } from "@contexts/NotificationsContext";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import { AdminUserListItem, getAdminUsers } from "@services/Admin";
import { useAdmin, useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import { formatRelative, formatShort } from "@views/Admin/Common/Format";
import { Avatar, Badge, Btn, Card, IconBtn, Note, PageHeader, SearchBox, Seg, Spinner } from "@views/Admin/Common/ui";
import UserEditDialog from "@views/Admin/Users/UserEditDialog";

export const adminUserPath = (username: string) => `${AdminRoute}${AdminUsersSubRoute}/${encodeURIComponent(username)}`;

const rowsPerPage = 20;

type Filter = "active" | "all" | "banned" | "disabled";

type Status = "Active" | "Banned" | "Disabled";

const statusOf = (user: AdminUserListItem): Status => {
    if (user.disabled) return "Disabled";
    if (user.banned) return "Banned";

    return "Active";
};

const statusColor: Record<Status, string> = {
    Active: "var(--a-accent)",
    Banned: "var(--a-alert)",
    Disabled: "var(--a-tx3)",
};

export const SecondFactorBadge = function (props: { factor: AdminUserListItem["second_factor"] }) {
    const { t: translate } = useTranslation("admin");
    const { factor } = props;

    if (!factor.has_totp && !factor.has_webauthn && !factor.has_duo) {
        return <Badge tone="planned">{translate("not set")}</Badge>;
    }

    const methods = [factor.has_webauthn && "webauthn", factor.has_totp && "totp", factor.has_duo && "duo"].filter(
        Boolean,
    ) as string[];

    const preferred = methods.includes(factor.method) ? factor.method : methods[0];

    return <Badge tone="accent">{methods.length > 1 ? `${preferred} +${methods.length - 1}` : preferred}</Badge>;
};

const UsersView = function () {
    const { i18n, t: translate } = useTranslation("admin");
    const { overview } = useAdmin();
    const navigate = useRouterNavigate();
    const handleError = useAdminErrorHandler();
    const { createSuccessNotification } = useNotifications();

    const [users, setUsers] = useState<AdminUserListItem[]>();
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [page, setPage] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);
    const [lookup, setLookup] = useState("");

    const load = useCallback(async () => {
        if (!overview.users_manageable) return;

        try {
            setUsers(await getAdminUsers());
        } catch (err) {
            handleError(err, "Failed to load the users");
        }
    }, [overview.users_manageable, handleError]);

    useEffect(() => {
        load().catch(console.error);
    }, [load]);

    const counts = useMemo(() => {
        const all = users ?? [];

        return {
            active: all.filter((u) => statusOf(u) === "Active").length,
            all: all.length,
            banned: all.filter((u) => statusOf(u) === "Banned").length,
            disabled: all.filter((u) => statusOf(u) === "Disabled").length,
        };
    }, [users]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return (users ?? []).filter(
            (u) =>
                (filter === "all" || statusOf(u).toLowerCase() === filter) &&
                (!q || [u.username, u.display_name, u.email, ...u.groups].some((v) => v.toLowerCase().includes(q))),
        );
    }, [users, search, filter]);

    const pages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
    const current = Math.min(page, pages - 1);
    const visible = filtered.slice(current * rowsPerPage, (current + 1) * rowsPerPage);

    const handleExport = () => {
        const rows = [
            ["username", "display_name", "email", "groups", "status", "second_factor", "last_sign_in"],
            ...filtered.map((u) => [
                u.username,
                u.display_name,
                u.email,
                u.groups.join(" "),
                statusOf(u),
                u.second_factor.method,
                u.last_sign_in ?? "",
            ]),
        ];
        const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");

        link.href = url;
        link.download = "authelia-users.csv";
        link.click();

        URL.revokeObjectURL(url);
    };

    const handleLookup = (e: FormEvent) => {
        e.preventDefault();

        if (lookup.trim() !== "") {
            navigate(adminUserPath(lookup.trim()));
        }
    };

    const file = overview.components?.find((c) => c.name === "Authentication backend")?.detail;

    if (!overview.users_manageable) {
        return (
            <section className="wrap">
                <PageHeader
                    title={translate("Users")}
                    description={translate("Users are managed by the LDAP directory.")}
                />
                <Card>
                    <Note tone="info">
                        {translate(
                            "Users are managed by the LDAP directory. Enter a username to view the user and manage their second factors and bans.",
                        )}
                    </Note>
                    <form style={{ display: "flex", gap: 10, marginTop: 16 }} onSubmit={handleLookup}>
                        <input
                            className="inp mono"
                            value={lookup}
                            placeholder={translate("Username")}
                            onChange={(e) => setLookup(e.target.value)}
                        />
                        <Btn type="submit" variant="primary">
                            {translate("Open")}
                        </Btn>
                    </form>
                </Card>
            </section>
        );
    }

    return (
        <section className="wrap">
            {createOpen ? (
                <UserEditDialog
                    open
                    onClose={() => setCreateOpen(false)}
                    onSaved={(username) => {
                        setCreateOpen(false);
                        createSuccessNotification(translate("The user {{username}} was created", { username }));
                        load().catch(console.error);
                    }}
                />
            ) : null}

            <PageHeader
                title={translate("Users")}
                description={
                    <>
                        {translate("{{count}} users in the file backend", { count: counts.all })}{" "}
                        {file ? <span className="mono tx3">· {file.replace(/^file · /, "")}</span> : null}
                    </>
                }
                actions={
                    <>
                        <Btn disabled={!filtered.length} onClick={handleExport}>
                            {translate("Export")}
                        </Btn>
                        <Btn id="admin-user-create" variant="primary" onClick={() => setCreateOpen(true)}>
                            {translate("Add user")}
                        </Btn>
                    </>
                }
            />

            <Card flush>
                <div className="toolbar">
                    <SearchBox
                        id="admin-users-filter"
                        value={search}
                        placeholder={translate("Search by username, name, email or group")}
                        style={{ flex: "1 1 280px", maxWidth: 380 }}
                        onChange={(value) => {
                            setSearch(value);
                            setPage(0);
                        }}
                    />
                    <Seg
                        label={translate("Status filter")}
                        value={filter}
                        options={[
                            { label: `${translate("All")} · ${counts.all}`, value: "all" },
                            { label: `${translate("Active")} · ${counts.active}`, value: "active" },
                            { label: `${translate("Banned")} · ${counts.banned}`, value: "banned" },
                            { label: `${translate("Disabled")} · ${counts.disabled}`, value: "disabled" },
                        ]}
                        onChange={(value) => {
                            setFilter(value);
                            setPage(0);
                        }}
                    />
                    <div className="spacer" />
                    <span className="mono tx3" style={{ fontSize: 11.5 }}>
                        {filtered.length
                            ? translate("{{from}}–{{to}} of {{total}}", {
                                  from: current * rowsPerPage + 1,
                                  to: current * rowsPerPage + visible.length,
                                  total: filtered.length,
                              })
                            : ""}
                    </span>
                </div>
                <div className="scroll">
                    {users ? (
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>{translate("User")}</th>
                                    <th>{translate("Email")}</th>
                                    <th>{translate("Groups")}</th>
                                    <th>2FA</th>
                                    <th>{translate("Last sign-in")}</th>
                                    <th>{translate("Status")}</th>
                                    <th>
                                        <span className="sr">{translate("Actions")}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.length === 0 ? (
                                    <tr className="none">
                                        <td colSpan={7}>{translate("No users match.")}</td>
                                    </tr>
                                ) : null}
                                {visible.map((user) => {
                                    const status = statusOf(user);
                                    const me = user.username === overview.username;

                                    return (
                                        <tr
                                            key={user.username}
                                            className="clickable"
                                            onClick={() => navigate(adminUserPath(user.username))}
                                        >
                                            <td>
                                                <div className="cell-user">
                                                    <Avatar name={user.display_name || user.username} me={me} />
                                                    <div>
                                                        <div style={{ fontWeight: 500 }}>
                                                            {user.display_name || user.username}
                                                        </div>
                                                        <div className="cell-sub">{user.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={user.email ? "tx2" : "tx3"}>{user.email || "—"}</td>
                                            <td>
                                                <div className="tags">
                                                    {user.groups.map((group) => (
                                                        <span
                                                            key={group}
                                                            className={
                                                                group === overview.admin_group
                                                                    ? "tag plain admin"
                                                                    : "tag plain"
                                                            }
                                                        >
                                                            {group}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                <SecondFactorBadge factor={user.second_factor} />
                                            </td>
                                            <td>
                                                {user.last_sign_in ? (
                                                    <>
                                                        <div className="mono" style={{ fontSize: 12.5 }}>
                                                            {formatShort(user.last_sign_in, i18n.language)}
                                                        </div>
                                                        <div className="tx3" style={{ fontSize: 11.5, marginTop: 2 }}>
                                                            {formatRelative(user.last_sign_in, i18n.language)}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className="tx3">{translate("never")}</span>
                                                )}
                                            </td>
                                            <td>
                                                <span
                                                    className="status"
                                                    style={
                                                        status === "Disabled" ? { color: "var(--a-tx3)" } : undefined
                                                    }
                                                >
                                                    <span className="dot" style={{ background: statusColor[status] }} />
                                                    {translate(status)}
                                                </span>
                                            </td>
                                            <td>
                                                <IconBtn
                                                    aria-label={translate("Actions for {{username}}", {
                                                        username: user.username,
                                                    })}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(adminUserPath(user.username));
                                                    }}
                                                >
                                                    <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
                                                </IconBtn>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <Spinner />
                    )}
                </div>
                <div className="cardfoot">
                    <span>
                        {translate("Rows per page")} <span className="mono tx2">{rowsPerPage}</span>
                    </span>
                    <div className="spacer" />
                    <Btn size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                        {translate("Previous")}
                    </Btn>
                    <Btn size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                        {translate("Next")}
                    </Btn>
                </div>
            </Card>
        </section>
    );
};

export default UsersView;
