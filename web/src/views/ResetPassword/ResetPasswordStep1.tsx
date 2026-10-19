// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import ComponentWithTooltip from "@components/ComponentWithTooltip";
import { Button } from "@components/UI/Button";
import { Input } from "@components/UI/Input";
import { Label } from "@components/UI/Label";
import { Spinner } from "@components/UI/Spinner";
import { IndexRoute } from "@constants/Routes";
import { useNotifications } from "@contexts/NotificationsContext";
import MinimalLayout from "@layouts/MinimalLayout";
import { initiateResetPasswordProcess } from "@services/ResetPassword";

const ResetPasswordStep1 = function () {
    const [username, setUsername] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    const [rateLimited, setRateLimited] = useState(false);
    const timeoutRateLimitRef = useRef<null | ReturnType<typeof setTimeout>>(null);

    const { createErrorNotification, createInfoNotification } = useNotifications();
    const navigate = useNavigate();
    const { t: translate } = useTranslation();

    useEffect(() => {
        return () => {
            if (timeoutRateLimitRef.current !== null) {
                clearTimeout(timeoutRateLimitRef.current);
                timeoutRateLimitRef.current = null;
            }
        };
    }, []);

    const handleRateLimited = useCallback(
        (retryAfter: number) => {
            if (timeoutRateLimitRef.current) {
                clearTimeout(timeoutRateLimitRef.current);
            }

            setRateLimited(true);

            createErrorNotification(translate("You have made too many requests"));

            timeoutRateLimitRef.current = setTimeout(() => {
                setRateLimited(false);
                timeoutRateLimitRef.current = null;
            }, retryAfter * 1000);
        },
        [createErrorNotification, translate],
    );

    const doInitiateResetPasswordProcess = async () => {
        setError(false);
        setLoading(true);

        if (username === "") {
            setError(true);
            setLoading(false);
            createErrorNotification(translate("Username is required"));
            return;
        }

        try {
            const response = await initiateResetPasswordProcess(username);
            if (response?.limited === false) {
                createInfoNotification(translate("An email has been sent to your address to complete the process"));
                navigate(IndexRoute);
            } else if (response?.limited) {
                handleRateLimited(response.retryAfter);
            } else {
                createErrorNotification(translate("There was an issue initiating the password reset process"));
            }
        } catch {
            createErrorNotification(translate("There was an issue initiating the password reset process"));
        }
        setLoading(false);
    };

    const handleResetClick = () => {
        doInitiateResetPasswordProcess();
    };

    const handleCancelClick = () => {
        navigate(IndexRoute);
    };

    return (
        <MinimalLayout
            title={translate("Reset password")}
            subtitle={translate("Enter your username. If it has an email address, a link is sent there.")}
            id="reset-password-step1-stage"
            lead={
                <Button
                    id="cancel-button"
                    variant="ghost"
                    className="l-back"
                    disabled={loading}
                    onClick={handleCancelClick}
                >
                    <ChevronLeft size={16} strokeWidth={1.8} />
                    {translate("Back to sign in")}
                </Button>
            }
        >
            <div id={"form-reset-password-username"} className="l-form">
                <div className="l-fld">
                    <Label htmlFor="username-textfield">{translate("Username")}</Label>
                    <Input
                        id="username-textfield"
                        disabled={loading}
                        error={error}
                        value={username}
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(ev) => {
                            if (ev.key === "Enter") {
                                ev.preventDefault();
                                doInitiateResetPasswordProcess();
                            }
                        }}
                    />
                </div>
                <ComponentWithTooltip render={rateLimited} title={translate("You have made too many requests")}>
                    <Button
                        id="reset-button"
                        variant="default"
                        disabled={loading || rateLimited}
                        className="l-block"
                        onClick={handleResetClick}
                    >
                        {loading ? <Spinner size={16} className="h-4 w-4" /> : null}
                        {translate("Send reset link")}
                    </Button>
                </ComponentWithTooltip>
            </div>
        </MinimalLayout>
    );
};

export default ResetPasswordStep1;
