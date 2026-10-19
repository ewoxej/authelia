// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useEffect, useState } from "react";

import { Activity, Ban, ChevronRight, LayoutGrid, SlidersHorizontal, User, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";

import JanusLogo from "@components/JanusLogo";
import JanusWordmark from "@components/JanusWordmark";
import { BrandName } from "@constants/constants";
import {
    AdminActivitySubRoute,
    AdminBansSubRoute,
    AdminConfigurationSubRoute,
    AdminRoute,
    AdminUsersSubRoute,
    SettingsRoute,
} from "@constants/Routes";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import { AdminOverview } from "@services/Admin";
import { adminDevNoAuth } from "@views/Admin/Common/DevMode";
import { Avatar, Key, useAdminTheme } from "@views/Admin/Common/ui";
import { sections, wholeFileSection } from "@views/Admin/Configuration/Sections";

export const adminConfigurationPath = (section: string) => `${AdminRoute}${AdminConfigurationSubRoute}/${section}`;

const iconProps = { "aria-hidden": true, size: 18, strokeWidth: 1.75 } as const;

const AdminLayout = function (props: { overview?: AdminOverview; children: ReactNode }) {
    const { t: translate } = useTranslation("admin");
    useAdminTheme(props.overview?.theme);
    const location = useLocation();
    const navigate = useRouterNavigate();

    const configurationBase = `${AdminRoute}${AdminConfigurationSubRoute}`;
    const inConfiguration = location.pathname.startsWith(configurationBase);
    const [configurationOpen, setConfigurationOpen] = useState(inConfiguration);

    // Opening a configuration page from elsewhere (i.e. a link) expands the configuration menu.
    const [lastInConfiguration, setLastInConfiguration] = useState(inConfiguration);

    if (inConfiguration !== lastInConfiguration) {
        setLastInConfiguration(inConfiguration);

        if (inConfiguration) {
            setConfigurationOpen(true);
        }
    }

    useEffect(() => {
        document.title = translate("Administration - {{authelia}}", {
            authelia: BrandName,
        });
    }, [translate]);

    const current = (path: string) =>
        path === AdminRoute
            ? location.pathname === AdminRoute || location.pathname === AdminRoute + "/"
            : location.pathname === path || location.pathname.startsWith(path + "/");

    const nav = (path: string, label: string, icon: ReactNode, id: string) => (
        <button
            id={`admin-menu-${id}`}
            type="button"
            className="nav"
            aria-current={current(path) ? "page" : undefined}
            onClick={() => navigate(path)}
        >
            {icon}
            {translate(label)}
        </button>
    );

    const configurationSection = location.pathname.slice(configurationBase.length + 1) || sections[0].id;
    // The domain the administration area is opened on, which is the one that matters with several cookie domains.
    const host = globalThis.location?.host || props.overview?.host;
    const user = props.overview?.display_name || props.overview?.username || "";

    return (
        <div className={adminDevNoAuth ? "adm app has-devbar" : "adm app"}>
            <header className="topbar">
                <button type="button" className="brand" onClick={() => navigate(AdminRoute)}>
                    <span className="brand-mark">
                        <JanusLogo size={32} tone={adminDevNoAuth ? "dev" : "accent"} />
                    </span>
                    <JanusWordmark className="brand-name" />
                    <Key>admin</Key>
                </button>
                <div className="spacer" />
                {host ? (
                    <span className="mono tx3 host" style={{ fontSize: 12 }}>
                        {host}
                    </span>
                ) : null}
                {user ? <Avatar name={user} me size={32} /> : null}
            </header>

            {adminDevNoAuth ? (
                <div className="devbar" role="status">
                    <span className="dot" style={{ background: "var(--a-alert)" }} />
                    <b>{translate("Development mode")}</b>
                    <span>{translate("Authentication is disabled. Do not expose this instance.")}</span>
                </div>
            ) : null}

            <div className="body">
                <nav className="side" aria-label={translate("Administration")}>
                    {nav(AdminRoute, "Overview", <LayoutGrid {...iconProps} />, "overview")}
                    {nav(`${AdminRoute}${AdminUsersSubRoute}`, "Users", <Users {...iconProps} />, "users")}
                    <button
                        id="admin-menu-configuration"
                        type="button"
                        className={inConfiguration ? "nav parent" : "nav"}
                        aria-expanded={configurationOpen}
                        onClick={() => {
                            setConfigurationOpen(!configurationOpen);

                            if (!configurationOpen && !inConfiguration) {
                                navigate(adminConfigurationPath(sections[0].id));
                            }
                        }}
                    >
                        <SlidersHorizontal {...iconProps} />
                        {translate("Configuration")}
                        <ChevronRight className="chev" size={14} strokeWidth={1.75} aria-hidden />
                    </button>
                    {configurationOpen ? (
                        <div className="subnav">
                            {[...sections, wholeFileSection].map((section) => (
                                <button
                                    key={section.id}
                                    id={`admin-config-section-${section.id}`}
                                    type="button"
                                    className="sub"
                                    aria-current={
                                        inConfiguration && configurationSection === section.id ? "page" : undefined
                                    }
                                    onClick={() => navigate(adminConfigurationPath(section.id) + location.search)}
                                >
                                    {translate(section.title)}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {nav(`${AdminRoute}${AdminActivitySubRoute}`, "Activity", <Activity {...iconProps} />, "activity")}
                    {nav(`${AdminRoute}${AdminBansSubRoute}`, "Bans", <Ban {...iconProps} />, "bans")}
                    <div className="side-foot">
                        <div className="divider" style={{ margin: "0 4px 10px" }} />
                        {nav(SettingsRoute, "My Settings", <User {...iconProps} />, "settings")}
                        {props.overview ? (
                            <span className="mono tx3" style={{ fontSize: 11, padding: "8px 12px 0" }}>
                                {props.overview.version} · fork {props.overview.fork_version}
                            </span>
                        ) : null}
                    </div>
                </nav>
                <main className="main">{props.children}</main>
            </div>
        </div>
    );
};

export default AdminLayout;
