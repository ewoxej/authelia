// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, lazy, useEffect } from "react";

import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Route, Routes, useLocation } from "react-router";

import LogoutButton from "@components/LogoutButton";
import SwitchUserButton from "@components/SwitchUserButton";
import UserChip from "@components/UserChip";
import {
    SecondFactorPasswordSubRoute,
    SecondFactorPushSubRoute,
    SecondFactorTOTPSubRoute,
    SecondFactorWebAuthnSubRoute,
    SettingsRoute,
    SettingsTwoFactorAuthenticationSubRoute,
} from "@constants/Routes";
import { useLocalStorageMethodContext } from "@contexts/LocalStorageMethodContext";
import { useNotifications } from "@contexts/NotificationsContext";
import { useFlowPresent } from "@hooks/Flow";
import { getLoginMark, setLoginMark } from "@hooks/LoginMark";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import LoginLayout from "@layouts/LoginLayout";
import { Configuration } from "@models/Configuration";
import { SecondFactorMethod } from "@models/Methods";
import { UserInfo } from "@models/UserInfo";
import { AuthenticationLevel } from "@services/State";
import { setPreferred2FAMethod } from "@services/UserInfo";

const OneTimePasswordMethod = lazy(() => import("@views/LoginPortal/SecondFactor/OneTimePasswordMethod"));
const PushNotificationMethod = lazy(() => import("@views/LoginPortal/SecondFactor/PushNotificationMethod"));
const WebAuthnMethod = lazy(() => import("@views/LoginPortal/SecondFactor/WebAuthnMethod"));
const PasswordMethod = lazy(() => import("@views/LoginPortal/SecondFactor/PasswordMethod"));

export interface Props {
    authenticationLevel: AuthenticationLevel;
    factorKnowledge: boolean;
    userInfo: UserInfo;
    configuration: Configuration;
    duoSelfEnrollment: boolean;

    onMethodChanged: () => void;
    onAuthenticationSuccess: (_redirectURL: string | undefined) => void;
}

const SecondFactorForm = function (props: Props) {
    const { t: translate } = useTranslation();

    const navigate = useRouterNavigate();
    const flowPresent = useFlowPresent();
    const { localStorageMethodAvailable, setLocalStorageMethod } = useLocalStorageMethodContext();
    const { createErrorNotification } = useNotifications();

    const location = useLocation();
    const stateWebAuthnSupported = browserSupportsWebAuthn();

    useEffect(() => {
        if (getLoginMark() !== "joined") setLoginMark("idle");
    }, []);

    const handleSignInError = (err: Error) => {
        setLoginMark("error");
        createErrorNotification(err.message);
    };

    const handleMethodSelected = async (method: SecondFactorMethod) => {
        if (localStorageMethodAvailable) {
            setLocalStorageMethod(method);
        } else {
            await handleMethodSelectedFallback(method);
        }

        props.onMethodChanged();
    };

    const handleMethodSelectedFallback = async (method: SecondFactorMethod) => {
        try {
            await setPreferred2FAMethod(method);
        } catch (err) {
            console.error(err);
            createErrorNotification(translate("There was an issue updating preferred second factor method"));
        }
    };

    const showMethods = props.factorKnowledge && props.configuration.available_methods.size > 1;

    const tabs: { method: SecondFactorMethod; id: string; label: string; icon: ReactNode; route: string }[] = [];

    if (props.configuration.available_methods.has(SecondFactorMethod.TOTP)) {
        tabs.push({
            icon: <KeyRound size={15} strokeWidth={1.8} aria-hidden />,
            id: "one-time-password-option",
            label: translate("Code"),
            method: SecondFactorMethod.TOTP,
            route: SecondFactorTOTPSubRoute,
        });
    }

    if (props.configuration.available_methods.has(SecondFactorMethod.WebAuthn) && stateWebAuthnSupported) {
        tabs.push({
            icon: <Fingerprint size={15} strokeWidth={1.8} aria-hidden />,
            id: "webauthn-option",
            label: translate("Security Key"),
            method: SecondFactorMethod.WebAuthn,
            route: SecondFactorWebAuthnSubRoute,
        });
    }

    if (props.configuration.available_methods.has(SecondFactorMethod.MobilePush)) {
        tabs.push({
            icon: <Smartphone size={15} strokeWidth={1.8} aria-hidden />,
            id: "push-notification-option",
            label: translate("Push"),
            method: SecondFactorMethod.MobilePush,
            route: SecondFactorPushSubRoute,
        });
    }

    return (
        <LoginLayout
            id={"second-factor-stage"}
            title={translate("Confirm it's you")}
            userInfo={props.userInfo}
            lead={
                <UserChip name={props.userInfo.display_name}>
                    {flowPresent ? <SwitchUserButton /> : <LogoutButton />}
                </UserChip>
            }
        >
            {showMethods && tabs.length > 1 ? (
                <div className="l-tabs" role="tablist" aria-label={translate("Methods")} id="methods-tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            id={tab.id}
                            type="button"
                            role="tab"
                            className="l-tab"
                            aria-selected={location.pathname.endsWith(tab.route)}
                            onClick={() =>
                                location.pathname.endsWith(tab.route)
                                    ? undefined
                                    : handleMethodSelected(tab.method).catch(console.error)
                            }
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            ) : null}
            <Routes>
                <Route
                    path={SecondFactorPasswordSubRoute}
                    element={
                        <PasswordMethod
                            id="password-method"
                            authenticationLevel={props.authenticationLevel}
                            onAuthenticationSuccess={props.onAuthenticationSuccess}
                        />
                    }
                />
                <Route
                    path={SecondFactorTOTPSubRoute}
                    element={
                        <OneTimePasswordMethod
                            id={"one-time-password-method"}
                            authenticationLevel={props.authenticationLevel}
                            // Whether the user has a TOTP secret registered already
                            registered={props.userInfo.has_totp}
                            onRegisterClick={() => {
                                navigate(`${SettingsRoute}${SettingsTwoFactorAuthenticationSubRoute}`);
                            }}
                            onSignInError={handleSignInError}
                            onSignInSuccess={props.onAuthenticationSuccess}
                        />
                    }
                />
                <Route
                    path={SecondFactorWebAuthnSubRoute}
                    element={
                        <WebAuthnMethod
                            id={"webauthn-method"}
                            authenticationLevel={props.authenticationLevel}
                            // Whether the user has a WebAuthn device registered already
                            registered={props.userInfo.has_webauthn}
                            onRegisterClick={() => {
                                navigate(`${SettingsRoute}${SettingsTwoFactorAuthenticationSubRoute}`);
                            }}
                            onSignInError={handleSignInError}
                            onSignInSuccess={props.onAuthenticationSuccess}
                        />
                    }
                />
                <Route
                    path={SecondFactorPushSubRoute}
                    element={
                        <PushNotificationMethod
                            id={"push-notification-method"}
                            authenticationLevel={props.authenticationLevel}
                            duoSelfEnrollment={props.duoSelfEnrollment}
                            registered={props.userInfo.has_duo}
                            onSelectionClick={props.onMethodChanged}
                            onSignInError={handleSignInError}
                            onSignInSuccess={props.onAuthenticationSuccess}
                        />
                    }
                />
            </Routes>
        </LoginLayout>
    );
};

export default SecondFactorForm;
