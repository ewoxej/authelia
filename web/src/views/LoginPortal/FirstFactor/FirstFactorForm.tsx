// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BroadcastChannel } from "broadcast-channel";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Button } from "@components/UI/Button";
import { Checkbox } from "@components/UI/Checkbox";
import { Spinner } from "@components/UI/Spinner";
import { ResetPasswordStep1Route } from "@constants/Routes";
import { RedirectionURL, RequestMethod } from "@constants/SearchParams";
import { useNotifications } from "@contexts/NotificationsContext";
import { useFlow } from "@hooks/Flow";
import { useUserCode } from "@hooks/OpenIDConnect";
import { usePasswordVisibility } from "@hooks/PasswordVisibility";
import { useQueryParam } from "@hooks/QueryParam";
import LoginLayout from "@layouts/LoginLayout";
import { IsCapsLockModified } from "@services/CapsLock";
import { postFirstFactor } from "@services/Password";
import PasskeyForm from "@views/LoginPortal/FirstFactor/PasskeyForm";

export interface Props {
    disabled: boolean;
    passkeyLogin: boolean;
    rememberMe: boolean;
    resetPassword: boolean;
    resetPasswordCustomURL: string;

    onAuthenticationStart: () => void;
    onAuthenticationStop: () => void;
    onAuthenticationSuccess: (_redirectURL: string | undefined) => void;
    onChannelStateChange: () => void;
}

const FirstFactorForm = function (props: Props) {
    const { t: translate } = useTranslation();

    const navigate = useNavigate();
    const redirectionURL = useQueryParam(RedirectionURL);
    const requestMethod = useQueryParam(RequestMethod);
    const { flow, id: flowID, subflow } = useFlow();
    const userCode = useUserCode();
    const { createErrorNotification } = useNotifications();
    const { showPassword, toggleProps } = usePasswordVisibility();

    const loginChannel = useMemo(() => new BroadcastChannel<boolean>("login"), []);

    const [rememberMe, setRememberMe] = useState(false);
    const [username, setUsername] = useState("");
    const [usernameError, setUsernameError] = useState(false);
    const [password, setPassword] = useState("");
    const [passwordCapsLock, setPasswordCapsLock] = useState(false);
    const [passwordCapsLockPartial, setPasswordCapsLockPartial] = useState(false);
    const [passwordError, setPasswordError] = useState(false);
    const [loading, setLoading] = useState(false);

    const usernameRef = useRef<HTMLInputElement | null>(null);
    const passwordRef = useRef<HTMLInputElement | null>(null);

    const focusUsername = useCallback(() => {
        if (usernameRef.current === null) return;

        usernameRef.current.focus();
    }, [usernameRef]);

    const focusPassword = useCallback(() => {
        if (passwordRef.current === null) return;

        passwordRef.current.focus();
    }, [passwordRef]);

    useEffect(() => {
        const timeout = setTimeout(() => focusUsername(), 10);
        return () => clearTimeout(timeout);
    }, [focusUsername]);

    useEffect(() => {
        const handleMessage = (authenticated: boolean) => {
            if (authenticated) {
                props.onChannelStateChange();
            }
        };

        loginChannel.addEventListener("message", handleMessage);

        return () => {
            loginChannel.removeEventListener("message", handleMessage);
        };
    }, [loginChannel, redirectionURL, props]);

    const disabled = props.disabled;

    const handleRememberMeChange = () => {
        setRememberMe(!rememberMe);
    };

    const handleSignIn = useCallback(async () => {
        if (loading) {
            return;
        }

        if (username === "" || password === "") {
            if (username === "") {
                setUsernameError(true);
            }

            if (password === "") {
                setPasswordError(true);
            }
            return;
        }

        setLoading(true);

        props.onAuthenticationStart();

        try {
            const res = await postFirstFactor(
                username,
                password,
                rememberMe,
                redirectionURL,
                requestMethod,
                flowID,
                flow,
                subflow,
                userCode,
            );

            setLoading(false);

            await loginChannel.postMessage(true);
            props.onAuthenticationSuccess(res ? res.redirect : undefined);
        } catch (err) {
            console.error(err);
            createErrorNotification(translate("Incorrect username or password"));
            setLoading(false);
            props.onAuthenticationStop();
            setPassword("");
            focusPassword();
        }
    }, [
        loading,
        username,
        password,
        props,
        rememberMe,
        redirectionURL,
        requestMethod,
        flowID,
        flow,
        subflow,
        userCode,
        loginChannel,
        createErrorNotification,
        translate,
        focusPassword,
    ]);

    const handleResetPasswordClick = () => {
        if (props.resetPassword) {
            if (props.resetPasswordCustomURL) {
                window.open(props.resetPasswordCustomURL);
            } else {
                navigate(ResetPasswordStep1Route);
            }
        }
    };

    const handleUsernameKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                if (!username.length) {
                    setUsernameError(true);
                } else if (username.length && password.length) {
                    handleSignIn().catch(console.error);
                } else {
                    setUsernameError(false);
                    focusPassword();
                }
                event.preventDefault();
            }
        },
        [focusPassword, handleSignIn, password.length, username.length],
    );

    const handlePasswordKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                if (!username.length) {
                    focusUsername();
                } else if (!password.length) {
                    focusPassword();
                }
                handleSignIn().catch(console.error);
                event.preventDefault();
            }
        },
        [focusPassword, focusUsername, handleSignIn, password.length, username.length],
    );

    const handlePasswordKeyUp = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (password.length <= 1) {
                setPasswordCapsLock(false);
                setPasswordCapsLockPartial(false);

                if (password.length === 0) {
                    return;
                }
            }

            const modified = IsCapsLockModified(event);

            if (modified === null) return;

            if (modified) {
                setPasswordCapsLock(true);
            } else {
                setPasswordCapsLockPartial(true);
            }
        },
        [password.length],
    );

    const handleRememberMeKeyDown = useCallback(
        (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === "Enter") {
                if (!username.length) {
                    focusUsername();
                } else if (!password.length) {
                    focusPassword();
                }
                handleSignIn().catch(console.error);
            }
        },
        [focusPassword, focusUsername, handleSignIn, password.length, username.length],
    );

    let redirectHost: string | undefined;

    try {
        redirectHost = redirectionURL ? new URL(redirectionURL).host : undefined;
    } catch {
        redirectHost = undefined;
    }

    return (
        <LoginLayout
            id="first-factor-stage"
            title={translate("Sign in")}
            subtitle={
                redirectHost ? (
                    <>
                        {translate("to continue to")} <span className="mono">{redirectHost}</span>
                    </>
                ) : undefined
            }
        >
            <form id={"form-login"} className="l-form" onSubmit={(e) => e.preventDefault()}>
                <div className="l-fld">
                    <label htmlFor="username-textfield">{translate("Username")}</label>
                    <input
                        ref={usernameRef}
                        id="username-textfield"
                        className="l-inp"
                        required
                        value={username}
                        aria-invalid={usernameError}
                        disabled={disabled}
                        onChange={(v) => setUsername(v.target.value)}
                        onFocus={() => setUsernameError(false)}
                        autoCapitalize="none"
                        autoComplete="username webauthn"
                        spellCheck={false}
                        onKeyDown={handleUsernameKeyDown}
                    />
                </div>
                <div className="l-fld">
                    <div className="l-fld-head">
                        <label htmlFor="password-textfield">{translate("Password")}</label>
                        {props.resetPassword ? (
                            <button
                                id="reset-password-button"
                                type="button"
                                className="l-link"
                                onClick={handleResetPasswordClick}
                            >
                                {translate("Reset password?")}
                            </button>
                        ) : null}
                    </div>
                    <div className="l-inp-wrap">
                        <input
                            ref={passwordRef}
                            id="password-textfield"
                            className="l-inp pw"
                            required
                            disabled={disabled}
                            value={password}
                            aria-invalid={passwordError}
                            onChange={(v) => setPassword(v.target.value)}
                            onFocus={() => setPasswordError(false)}
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            onKeyDown={handlePasswordKeyDown}
                            onKeyUp={handlePasswordKeyUp}
                        />
                        <button
                            type="button"
                            className="l-eye"
                            aria-label={translate("Toggle password visibility")}
                            {...toggleProps}
                        >
                            {showPassword ? (
                                <EyeOff size={18} strokeWidth={1.8} aria-hidden />
                            ) : (
                                <Eye size={18} strokeWidth={1.8} aria-hidden />
                            )}
                        </button>
                    </div>
                    {passwordCapsLock ? (
                        <span className="l-caps" role="alert">
                            {passwordCapsLockPartial
                                ? translate("The password was partially entered with Caps Lock")
                                : translate("The password was entered with Caps Lock")}
                        </span>
                    ) : null}
                </div>
                {props.rememberMe ? (
                    <div className="l-check">
                        <Checkbox
                            id="remember-checkbox"
                            disabled={disabled}
                            checked={rememberMe}
                            onCheckedChange={handleRememberMeChange}
                            onKeyDown={handleRememberMeKeyDown}
                        />
                        <label htmlFor="remember-checkbox">{translate("Remember me")}</label>
                    </div>
                ) : null}
                <Button
                    id="sign-in-button"
                    type="submit"
                    variant="default"
                    className="l-block"
                    disabled={disabled || loading}
                    onClick={handleSignIn}
                >
                    {loading ? <Spinner size={16} className="h-4 w-4" /> : null}
                    {translate("Sign in")}
                </Button>
                {props.passkeyLogin ? (
                    <PasskeyForm
                        disabled={disabled || loading}
                        rememberMe={props.rememberMe}
                        onAuthenticationError={(err) => createErrorNotification(err.message)}
                        onAuthenticationStart={() => {
                            setUsername("");
                            setPassword("");
                            setLoading(true);
                            props.onAuthenticationStart();
                        }}
                        onAuthenticationStop={() => {
                            setLoading(false);
                            props.onAuthenticationStop();
                        }}
                        onAuthenticationSuccess={(url) => {
                            setLoading(false);
                            props.onAuthenticationSuccess(url);
                        }}
                    />
                ) : null}
            </form>
        </LoginLayout>
    );
};

export default FirstFactorForm;
