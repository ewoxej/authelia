// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode } from "react";

import { cn } from "cn";
import { Check, X } from "lucide-react";

export interface Props {
    // 'wait' pulses while the user has to act, 'ok' and 'fail' show the outcome with a check or a cross.
    state: "fail" | "ok" | "wait";
    // The icon while waiting.
    icon?: ReactNode;
    className?: string;
}

/** The round status visual of the sign-in pages, i.e. while waiting for a security key or a push approval. */
const Orb = function (props: Props) {
    let icon = props.icon;

    if (props.state === "ok") {
        icon = <Check size={32} strokeWidth={2} aria-hidden />;
    } else if (props.state === "fail") {
        icon = <X size={30} strokeWidth={2} aria-hidden />;
    }

    return (
        <div className={cn("l-orb", props.state !== "wait" && props.state, props.className)} data-state={props.state}>
            {props.state === "wait" ? (
                <>
                    <span className="pulse" />
                    <span className="pulse b" />
                </>
            ) : null}
            <span className="core">{icon}</span>
        </div>
    );
};

export default Orb;
