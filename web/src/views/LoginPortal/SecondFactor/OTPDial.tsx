// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useId, useState } from "react";

import { OTPField } from "@base-ui/react/otp-field";
import { useTranslation } from "react-i18next";

import Orb from "@components/Orb";
import { cn } from "@utils/Styles";

export interface Props {
    passcode: string;
    state: State;

    digits: number;
    period: number;

    onChange: (_passcode: string) => void;
}

export enum State {
    Idle = 1,
    InProgress = 2,
    Success = 3,
    Failure = 4,
    RateLimited = 5,
}

const ringLength = 50.27;

const remaining = (period: number) => period - (Math.floor(Date.now() / 1000) % period);

const OTPDial = function (props: Props) {
    const { t: translate } = useTranslation();
    const fieldId = useId();
    const disabled =
        props.state === State.InProgress || props.state === State.Success || props.state === State.RateLimited;

    const [left, setLeft] = useState(() => remaining(props.period));

    useEffect(() => {
        const timer = setInterval(() => setLeft(remaining(props.period)), 1000);

        return () => clearInterval(timer);
    }, [props.period]);

    if (props.state === State.Success) {
        return <Orb state="ok" />;
    }

    return (
        <div className="l-form" style={{ alignSelf: "stretch" }}>
            <span id="otp-input" className={cn("l-otp", props.state === State.Failure && "err")}>
                <label htmlFor={fieldId} className="sr-only">
                    {translate("Enter One-Time Password")}
                </label>
                <OTPField.Root
                    id={fieldId}
                    data-otp-root=""
                    length={props.digits}
                    value={props.passcode}
                    onValueChange={props.onChange}
                    disabled={disabled}
                    validationType="numeric"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                >
                    {Array.from({ length: props.digits }, (_item, index) => (
                        <OTPField.Input
                            key={index}
                            autoFocus={index === 0}
                            aria-invalid={props.state === State.Failure}
                        />
                    ))}
                </OTPField.Root>
            </span>
            <div className="l-timer">
                <svg className="l-ring" viewBox="0 0 20 20" aria-hidden>
                    <circle className="bgc" cx="10" cy="10" r="8" />
                    <circle
                        className="fg"
                        cx="10"
                        cy="10"
                        r="8"
                        strokeDasharray={ringLength}
                        strokeDashoffset={ringLength * (1 - left / props.period)}
                    />
                </svg>
                <span>
                    {translate("Codes refresh every {{period}} seconds", { period: props.period })} ·{" "}
                    <span className="mono">{left}s</span>
                </span>
            </div>
        </div>
    );
};

export default OTPDial;
