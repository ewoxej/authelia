// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useEffect } from "react";

import { LogOut, Shield, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";

import JanusLogo from "@components/JanusLogo";
import JanusWordmark from "@components/JanusWordmark";
import { BrandName } from "@constants/constants";
import {
    AdminRoute,
    SecuritySubRoute,
    SettingsRoute,
    SettingsTwoFactorAuthenticationSubRoute,
} from "@constants/Routes";
import { useConfiguration } from "@hooks/Configuration";
import { setSignedIn } from "@hooks/LoginMark";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import { useSignOut } from "@hooks/SignOut";
import { Key, PageHeader, useAdminTheme } from "@views/Admin/Common/ui";
import "@layouts/login.css";
import "@layouts/settings.css";
import "@views/Admin/admin.css";

export interface Props {
    children?: ReactNode;
    // Kept for compatibility, the navigation is always visible.
    drawerWidth?: number;
}

interface NavItem {
    keyname: string;
    text: string;
    pathname: string;
    icon: ReactNode;
}

const iconProps = { "aria-hidden": true, size: 18, strokeWidth: 1.75 } as const;

const navItems: NavItem[] = [
    {
        icon: <Shield {...iconProps} />,
        keyname: "security",
        pathname: `${SettingsRoute}${SecuritySubRoute}`,
        text: "Security",
    },
    {
        icon: <ShieldCheck {...iconProps} />,
        keyname: "twofactor",
        pathname: `${SettingsRoute}${SettingsTwoFactorAuthenticationSubRoute}`,
        text: "Two-Factor Authentication",
    },
];

/** The user settings in the look of the administration area: a top bar, the navigation on the left and the content. */
const SettingsLayout = function (props: Props) {
    const { t: translate } = useTranslation(["settings", "admin", "portal"]);
    const location = useLocation();
    const navigate = useRouterNavigate();
    const signOut = useSignOut();

    const [configuration, fetchConfiguration] = useConfiguration();

    useAdminTheme(undefined);

    useEffect(() => {
        fetchConfiguration();
    }, [fetchConfiguration]);

    useEffect(() => {
        setSignedIn(true);
    }, []);

    // Lets the shared components, dialogs included, use the colours of the administration area.
    useEffect(() => {
        document.documentElement.dataset.portalSkin = "";

        return () => {
            delete document.documentElement.dataset.portalSkin;
        };
    }, []);

    useEffect(() => {
        document.title = translate("Settings - {{authelia}}", { authelia: BrandName });
    }, [translate]);

    // The administration area may only be available on its own endpoint, which is another site to go to.
    const openAdministration = (url?: string) => {
        if (url && new URL(url).host !== globalThis.location.host) {
            globalThis.location.assign(url);
        } else {
            navigate(AdminRoute);
        }
    };

    const current = (pathname: string) => location.pathname === pathname || location.pathname === pathname + "/";
    const active = navItems.find((item) => current(item.pathname));

    return (
        <div className="adm app settings">
            <header className="topbar">
                <button type="button" className="brand" onClick={() => navigate(SettingsRoute)}>
                    <span className="brand-mark">
                        <JanusLogo size={32} />
                    </span>
                    <JanusWordmark className="brand-name" />
                    <Key>{translate("Settings")}</Key>
                </button>
                <div className="spacer" />
                <span className="mono tx3 host" style={{ fontSize: 12 }}>
                    {globalThis.location?.host}
                </span>
            </header>
            <div className="body">
                <nav className="side" aria-label={translate("Settings")}>
                    {navItems.map((item) => (
                        <button
                            key={item.keyname}
                            id={`settings-menu-${item.keyname}`}
                            type="button"
                            className="nav"
                            aria-current={current(item.pathname) ? "page" : undefined}
                            onClick={() => (current(item.pathname) ? undefined : navigate(item.pathname))}
                        >
                            {item.icon}
                            {translate(item.text)}
                        </button>
                    ))}
                    {configuration?.administrator ? (
                        <>
                            <div className="divider" style={{ margin: "8px 4px" }} />
                            <button
                                id="settings-menu-administration"
                                type="button"
                                className="nav"
                                onClick={() => openAdministration(configuration.administration_url)}
                            >
                                <SlidersHorizontal {...iconProps} />
                                {translate("Administration", { ns: "admin" })}
                            </button>
                        </>
                    ) : null}
                    <div className="side-foot">
                        <div className="divider" style={{ margin: "0 4px 10px" }} />
                        <button id="settings-menu-logout" type="button" className="nav" onClick={() => signOut(false)}>
                            <LogOut {...iconProps} />
                            {translate("Logout", { ns: "portal" })}
                        </button>
                    </div>
                </nav>
                <main className="main">
                    <div className="wrap settings-wrap">
                        {active ? <PageHeader title={translate(active.text)} /> : null}
                        {props.children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default SettingsLayout;
