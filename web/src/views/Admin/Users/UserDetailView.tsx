// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useCallback, useEffect, useState } from "react";

import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { AdminActivitySubRoute, AdminRoute, AdminUsersSubRoute } from "@constants/Routes";
import { useNotifications } from "@contexts/NotificationsContext";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import {
    AdminUserDetails,
    banAdminUser,
    deleteAdminUser,
    deleteAdminUserDuo,
    deleteAdminUserTOTP,
    deleteAdminUserWebAuthn,
    getAdminUser,
    revokeAdminUserBan,
    setAdminUserPassword,
} from "@services/Admin";
import { useAdmin, useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import ConfirmDialog from "@views/Admin/Common/ConfirmDialog";
import { NumberField, TextField } from "@views/Admin/Common/Fields";
import { formatRelative, formatShort } from "@views/Admin/Common/Format";
import { Avatar, Badge, Btn, Card, CardHeader, Dot, Spinner } from "@views/Admin/Common/ui";
import UserEditDialog from "@views/Admin/Users/UserEditDialog";

type PendingAction = {
    title: string;
    description?: string;
    confirmLabel: string;
    destructive?: boolean;
    run: () => Promise<void>;
    success: string;
    reload?: boolean;
} | null;

const UserDetailView = function () {
    const { i18n, t: translate } = useTranslation("admin");
    const { overview } = useAdmin();
    const params = useParams();
    const navigate = useRouterNavigate();
    const handleError = useAdminErrorHandler();
    const { createSuccessNotification } = useNotifications();

    const username = params.username ?? "";

    const [details, setDetails] = useState<AdminUserDetails>();
    const [notFound, setNotFound] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [banOpen, setBanOpen] = useState(false);
    const [pending, setPending] = useState<PendingAction>(null);

    const load = useCallback(async () => {
        try {
            setDetails(await getAdminUser(username));
            setNotFound(false);
        } catch (err) {
            if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
                setNotFound(true);

                return;
            }

            handleError(err, "Failed to load the user");
        }
    }, [username, handleError]);

    useEffect(() => {
        load().catch(console.error);
    }, [load]);

    const runPending = async () => {
        if (!pending) return;

        try {
            await pending.run();
            createSuccessNotification(translate(pending.success));
            setPending(null);

            if (pending.reload !== false) {
                await load();
            }
        } catch (err) {
            handleError(err, "The operation failed");
        }
    };

    const backToUsers = () => navigate(`${AdminRoute}${AdminUsersSubRoute}`);
    const locale = i18n.language;

    const back = (
        <div>
            <Btn size="sm" onClick={backToUsers}>
                <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
                {translate("Users")}
            </Btn>
        </div>
    );

    if (notFound) {
        return (
            <section className="wrap narrow">
                {back}
                <p className="tx3">{translate("The user does not exist.")}</p>
            </section>
        );
    }

    if (!details) {
        return <Spinner />;
    }

    const { second_factor: sf, user } = details;
    const editable = !details.read_only && overview.users_manageable;
    const me = user.username === overview.username;
    const banned = details.bans.length > 0;

    let status = { color: "var(--a-accent)", label: "Active" };

    if (user.disabled) status = { color: "var(--a-tx3)", label: "Disabled" };
    else if (banned) status = { color: "var(--a-alert)", label: "Banned" };

    return (
        <section className="wrap narrow">
            {editOpen ? (
                <UserEditDialog
                    open
                    user={user}
                    onClose={() => setEditOpen(false)}
                    onSaved={() => {
                        setEditOpen(false);
                        createSuccessNotification(translate("The user was updated"));
                        load().catch(console.error);
                    }}
                />
            ) : null}
            {passwordOpen ? (
                <PasswordDialog
                    username={user.username}
                    onClose={() => setPasswordOpen(false)}
                    onSaved={() => {
                        setPasswordOpen(false);
                        createSuccessNotification(translate("The password was changed"));
                    }}
                />
            ) : null}
            {banOpen ? (
                <BanDialog
                    username={user.username}
                    onClose={() => setBanOpen(false)}
                    onSaved={() => {
                        setBanOpen(false);
                        createSuccessNotification(translate("The user was banned"));
                        load().catch(console.error);
                    }}
                />
            ) : null}
            <ConfirmDialog
                open={!!pending}
                title={pending?.title ?? ""}
                description={
                    pending?.description ? translate(pending.description, { username: user.username }) : undefined
                }
                confirmLabel={pending?.confirmLabel}
                destructive={pending?.destructive}
                onConfirm={runPending}
                onClose={() => setPending(null)}
            />

            {back}

            <div className="ph">
                <div className="cell-user" style={{ flex: 1, gap: 16, minWidth: 260 }}>
                    <Avatar name={user.display_name || user.username} me={me} size={52} />
                    <div className="ph-text" style={{ gap: 4 }}>
                        <h1>{user.display_name || user.username}</h1>
                        <span className="mono tx3">{user.username}</span>
                    </div>
                </div>
                {editable ? (
                    <>
                        <Btn id="admin-user-edit" onClick={() => setEditOpen(true)}>
                            {translate("Edit")}
                        </Btn>
                        <Btn id="admin-user-password" onClick={() => setPasswordOpen(true)}>
                            {translate("Set password")}
                        </Btn>
                    </>
                ) : null}
                <Btn id="admin-user-ban" variant="danger" disabled={me} onClick={() => setBanOpen(true)}>
                    {translate("Ban")}
                </Btn>
                {editable ? (
                    <Btn
                        id="admin-user-delete"
                        variant="danger"
                        disabled={me}
                        onClick={() =>
                            setPending({
                                confirmLabel: "Delete",
                                description:
                                    "The user {{username}} will be removed from the user database. Their second factor registrations are kept in the storage.",
                                destructive: true,
                                reload: false,
                                run: async () => {
                                    await deleteAdminUser(user.username);
                                    backToUsers();
                                },
                                success: "The user was deleted",
                                title: "Delete User",
                            })
                        }
                    >
                        {translate("Delete")}
                    </Btn>
                ) : null}
            </div>

            <Card>
                <CardHeader title={translate("Profile")} />
                <dl
                    style={{
                        display: "grid",
                        gap: "10px 24px",
                        gridTemplateColumns: "max-content 1fr",
                        margin: 0,
                    }}
                >
                    <Row label={translate("Status")}>
                        <span className="status">
                            <Dot color={status.color} />
                            {translate(status.label)}
                        </span>
                    </Row>
                    <Row label={translate("Email")}>{user.email || "—"}</Row>
                    <Row label={translate("Groups")}>
                        {user.groups.length ? (
                            <div className="tags">
                                {user.groups.map((group) => (
                                    <span
                                        key={group}
                                        className={group === overview.admin_group ? "tag plain admin" : "tag plain"}
                                    >
                                        {group}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            "—"
                        )}
                    </Row>
                    {user.given_name || user.family_name ? (
                        <Row label={translate("Name")}>{[user.given_name, user.family_name].join(" ")}</Row>
                    ) : null}
                    {user.phone_number ? <Row label={translate("Phone Number")}>{user.phone_number}</Row> : null}
                </dl>
            </Card>

            <Card>
                <CardHeader
                    title={translate("Second factor")}
                    subtitle={
                        <>
                            {translate("Preferred method")}: <span className="mono">{sf.preferred_method || "—"}</span>
                        </>
                    }
                />
                <div className="rows">
                    <FactorRow
                        title={translate("One-Time Password")}
                        badge={
                            sf.totp ? (
                                <Badge tone="accent">totp</Badge>
                            ) : (
                                <Badge tone="planned">{translate("not set")}</Badge>
                            )
                        }
                        detail={
                            sf.totp
                                ? `${sf.totp.algorithm} · ${sf.totp.digits} / ${sf.totp.period}s · ${translate("added")} ${formatShort(sf.totp.created_at, locale)} · ${translate("last used")} ${sf.totp.last_used_at ? formatRelative(sf.totp.last_used_at, locale) : translate("never")}`
                                : undefined
                        }
                        onRemove={
                            sf.totp
                                ? () =>
                                      setPending({
                                          confirmLabel: "Remove",
                                          description:
                                              "The one-time password of {{username}} will be removed. They'll need to register it again.",
                                          destructive: true,
                                          run: () => deleteAdminUserTOTP(user.username),
                                          success: "The one-time password was removed",
                                          title: "Remove One-Time Password",
                                      })
                                : undefined
                        }
                    />
                    {sf.webauthn.length === 0 ? (
                        <FactorRow title="WebAuthn" badge={<Badge tone="planned">{translate("not set")}</Badge>} />
                    ) : (
                        sf.webauthn.map((c) => (
                            <FactorRow
                                key={c.id}
                                title={c.description}
                                badge={<Badge tone="accent">{c.discoverable ? "passkey" : "webauthn"}</Badge>}
                                detail={`${c.rpid} · ${translate("added")} ${formatShort(c.created_at, locale)} · ${translate("last used")} ${c.last_used_at ? formatRelative(c.last_used_at, locale) : translate("never")}${c.clone_warning ? ` · ${translate("clone warning")}` : ""}`}
                                onRemove={() =>
                                    setPending({
                                        confirmLabel: "Remove",
                                        description: "The WebAuthn credential will be removed.",
                                        destructive: true,
                                        run: () => deleteAdminUserWebAuthn(user.username, c.id),
                                        success: "The WebAuthn credential was removed",
                                        title: "Remove WebAuthn Credential",
                                    })
                                }
                            />
                        ))
                    )}
                    {sf.duo ? (
                        <FactorRow
                            title={sf.duo.device}
                            badge={<Badge tone="accent">duo</Badge>}
                            detail={sf.duo.method}
                            onRemove={() =>
                                setPending({
                                    confirmLabel: "Remove",
                                    destructive: true,
                                    run: () => deleteAdminUserDuo(user.username),
                                    success: "The Duo device was removed",
                                    title: "Remove Duo Device",
                                })
                            }
                        />
                    ) : null}
                </div>
            </Card>

            <Card>
                <CardHeader
                    title={translate("Bans")}
                    actions={
                        <button
                            type="button"
                            className="link"
                            onClick={() =>
                                navigate(
                                    `${AdminRoute}${AdminActivitySubRoute}?username=${encodeURIComponent(user.username)}`,
                                )
                            }
                        >
                            {translate("Sign in history")} →
                        </button>
                    }
                />
                <div className="rows">
                    {details.bans.length === 0 ? (
                        <div className="empty">{translate("The user is not banned.")}</div>
                    ) : null}
                    {details.bans.map((ban) => (
                        <FactorRow
                            key={ban.id}
                            title={`${translate("Banned")} ${formatShort(ban.time, locale)}`}
                            badge={
                                <Badge tone={ban.source === "regulation" ? "planned" : "alert"}>
                                    {ban.source === "admin" ? translate("manual") : ban.source}
                                </Badge>
                            }
                            detail={`${translate("Expires")}: ${ban.expires ? formatRelative(ban.expires, locale) : translate("never")}${ban.reason ? ` · ${ban.reason}` : ""}`}
                            removeLabel="Unban"
                            onRemove={() =>
                                setPending({
                                    confirmLabel: "Unban",
                                    run: () => revokeAdminUserBan(ban.id),
                                    success: "The ban was lifted",
                                    title: "Lift Ban",
                                })
                            }
                        />
                    ))}
                </div>
            </Card>
        </section>
    );
};

const Row = function (props: { label: string; children: ReactNode }) {
    return (
        <>
            <dt className="tx3" style={{ fontSize: 12.5 }}>
                {props.label}
            </dt>
            <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{props.children}</dd>
        </>
    );
};

const FactorRow = function (props: {
    title: string;
    badge?: ReactNode;
    detail?: string;
    removeLabel?: string;
    onRemove?: () => void;
}) {
    const { t: translate } = useTranslation("admin");

    return (
        <div className="row">
            <div className="row-h" style={{ padding: "10px 12px 10px 16px" }}>
                {props.badge}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{props.title}</div>
                    {props.detail ? (
                        <div className="cell-sub" style={{ whiteSpace: "normal" }}>
                            {props.detail}
                        </div>
                    ) : null}
                </div>
                {props.onRemove ? (
                    <Btn size="sm" onClick={props.onRemove}>
                        {translate(props.removeLabel ?? "Remove")}
                    </Btn>
                ) : null}
            </div>
        </div>
    );
};

const PasswordDialog = function (props: { username: string; onClose: () => void; onSaved: () => void }) {
    const { t: translate } = useTranslation("admin");
    const handleError = useAdminErrorHandler();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");

    return (
        <ConfirmDialog
            open
            title="Set password"
            confirmLabel="Set password"
            onClose={props.onClose}
            onConfirm={async () => {
                if (password === "" || password !== confirm) {
                    handleError(new Error(translate("The passwords don't match")));

                    return;
                }

                try {
                    await setAdminUserPassword(props.username, password);
                    props.onSaved();
                } catch (err) {
                    handleError(err, "Failed to set the password");
                }
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <TextField
                    label="New Password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={setPassword}
                />
                <TextField
                    label="Confirm Password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={setConfirm}
                />
            </div>
        </ConfirmDialog>
    );
};

const BanDialog = function (props: { username: string; onClose: () => void; onSaved: () => void }) {
    const handleError = useAdminErrorHandler();
    const [hours, setHours] = useState<number | undefined>(24);
    const [reason, setReason] = useState("");

    return (
        <ConfirmDialog
            open
            title="Ban User"
            confirmLabel="Ban"
            destructive
            onClose={props.onClose}
            onConfirm={async () => {
                try {
                    await banAdminUser(props.username, Math.max(0, Math.round((hours ?? 0) * 3600)), reason);
                    props.onSaved();
                } catch (err) {
                    handleError(err, "Failed to ban the user");
                }
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <NumberField
                    label="Duration (hours)"
                    description="Use 0 for a permanent ban."
                    min={0}
                    value={hours}
                    onChange={setHours}
                />
                <TextField label="Reason" value={reason} onChange={setReason} />
            </div>
        </ConfirmDialog>
    );
};

export default UserDetailView;
