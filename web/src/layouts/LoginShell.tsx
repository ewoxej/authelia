// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode } from "react";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";

import Brand from "@components/Brand";
import PrivacyPolicyDrawer from "@components/PrivacyPolicyDrawer";
import LoginMark from "@layouts/LoginMark";
import { getLogoOverride } from "@utils/Configuration";
import "@layouts/login.css";

const cardWidths: Record<string, number> = {
    lg: 880,
    md: 640,
    sm: 520,
    xl: 1100,
    xs: 400,
};

export interface Props {
    id?: string;
    title?: null | string;
    // A line under the title, i.e. 'to continue to app.example.com'.
    subtitle?: ReactNode;
    // Shown above the title, i.e. the signed in user.
    lead?: ReactNode;
    // The language and account menu.
    top?: ReactNode;
    maxWidth?: false | string;
    // Shows the footer with the privacy policy and the project link.
    footer?: boolean;
    children?: ReactNode;
}

/** The card every sign-in page is shown in: the logo, a title and the content, centred on the page. */
const LoginShell = function (props: Props) {
    const width = props.maxWidth === false ? undefined : (cardWidths[props.maxWidth ?? "xs"] ?? cardWidths.xs);

    return (
        <div className="auth-page">
            {props.top ? <div className="l-top">{props.top}</div> : null}
            <main className="l-stage">
                <div id={props.id} className="l-card" style={{ maxWidth: width ?? "none" }}>
                    {getLogoOverride() ? (
                        <div className="l-logo custom">
                            <img src="./static/media/logo.png" alt="Logo" />
                        </div>
                    ) : (
                        <LoginMark />
                    )}
                    {props.lead}
                    {props.title || props.subtitle ? (
                        <div className="l-head">
                            {props.title ? <h1>{props.title}</h1> : null}
                            {props.subtitle ? <p>{props.subtitle}</p> : null}
                        </div>
                    ) : null}
                    {props.children}
                    {props.footer === false ? null : <Brand />}
                </div>
                <PrivacyPolicyDrawer />
            </main>
        </div>
    );
};

export default LoginShell;
