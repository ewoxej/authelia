// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode } from "react";

import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import Authenticated from "@views/LoginPortal/Authenticated";

export enum State {
    ALREADY_AUTHENTICATED = 1,
    NOT_REGISTERED = 2,
    METHOD = 3,
}

export interface Props {
    id: string;
    title: string;
    duoSelfEnrollment: boolean;
    registered: boolean;
    explanation: string;
    state: State;
    children: ReactNode;

    onRegisterClick?: () => void;
    onSelectClick?: () => void;
}

const DefaultMethodContainer = function (props: Props) {
    const { t: translate } = useTranslation();

    let registerMessage;
    if (props.registered) {
        registerMessage = props.title === translate("Push Notification") ? "" : translate("Manage devices");
    } else {
        registerMessage = translate("Register device");
    }

    let container: ReactNode;
    let stateClass: string = "";
    switch (props.state) {
        case State.ALREADY_AUTHENTICATED:
            container = <Authenticated />;
            stateClass = "state-already-authenticated";
            break;
        case State.NOT_REGISTERED:
            container = <NotRegisteredContainer title={props.title} duoSelfEnrollment={props.duoSelfEnrollment} />;
            stateClass = "state-not-registered";
            break;
        case State.METHOD:
            container = <MethodContainer explanation={props.explanation}>{props.children}</MethodContainer>;
            stateClass = "state-method";
            break;
    }

    const showSelect = props.onSelectClick && props.registered;
    const showRegister =
        (props.onRegisterClick && props.title !== "Push Notification") ||
        (props.onRegisterClick && props.title === "Push Notification" && props.duoSelfEnrollment);

    return (
        <div id={props.id}>
            <h2 className="sr-only">{props.title}</h2>
            <div id={"2fa-container"} className={stateClass}>
                {container}
            </div>
            {showSelect || (showRegister && registerMessage) ? (
                <div className="l-links">
                    {showSelect ? (
                        <button id={"selection-link"} type="button" className="l-link" onClick={props.onSelectClick}>
                            {translate("Select a Device")}
                        </button>
                    ) : (
                        <span />
                    )}
                    {showRegister && registerMessage ? (
                        <button id={"register-link"} type="button" className="l-link" onClick={props.onRegisterClick}>
                            {registerMessage}
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

interface NotRegisteredContainerProps {
    readonly title: string;
    readonly duoSelfEnrollment: boolean;
}

function NotRegisteredContainer(props: NotRegisteredContainerProps) {
    const { t: translate } = useTranslation();
    let infoText;
    if (props.title === translate("Push Notification")) {
        infoText = props.duoSelfEnrollment
            ? translate("Register your first device by clicking on the link below")
            : translate("Contact your administrator to register a device");
    } else {
        infoText = translate("Register your first device by clicking on the link below");
    }

    return (
        <div className="l-alert info">
            <Info size={16} strokeWidth={1.8} aria-hidden />
            <span>
                <span>{translate("The resource you're attempting to access requires two-factor authentication")}</span>
                {". "}
                <span>{infoText}</span>.
            </span>
        </div>
    );
}

interface MethodContainerProps {
    readonly explanation: string;
    readonly children: ReactNode;
}

function MethodContainer(props: MethodContainerProps) {
    return (
        <div className="l-wait">
            {props.children}
            {props.explanation ? <p>{props.explanation}</p> : null}
        </div>
    );
}

export default DefaultMethodContainer;
