// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect } from "react";

import { Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";

import Orb from "@components/Orb";
import { Button } from "@components/UI/Button";
import { useTimer } from "@hooks/Timer";
import { WebAuthnTouchState } from "@models/WebAuthn";

const touchTimeout = 30;

/** Waits for the security key with a pulsing visual and the time left, or offers to retry after a failure. */
const WebAuthnWait = function (props: { onRetryClick: () => void; webauthnTouchState: WebAuthnTouchState }) {
    const { t: translate } = useTranslation();
    const [timerPercent, triggerTimer, clearTimer] = useTimer(touchTimeout * 1000 - 500);

    useEffect(() => {
        triggerTimer();
    }, [triggerTimer]);

    if (props.webauthnTouchState === WebAuthnTouchState.Failure) {
        return (
            <>
                <Orb state="fail" />
                <Button
                    variant="outline"
                    className="l-block"
                    onClick={() => {
                        clearTimer();
                        triggerTimer();
                        props.onRetryClick();
                    }}
                >
                    {translate("Retry")}
                </Button>
            </>
        );
    }

    return (
        <>
            <Orb state="wait" icon={<Fingerprint size={30} strokeWidth={1.6} aria-hidden />} />
            <div className="l-progress" aria-hidden>
                <span style={{ width: `${Math.max(0, 100 - timerPercent)}%` }} />
            </div>
        </>
    );
};

export default WebAuthnWait;
