// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode } from "react";

export interface Props {
    name: string;
    // The action next to the name, i.e. signing out.
    children?: ReactNode;
}

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter((part) => part !== "")
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?";

/** The signed in user above the title of a sign-in page, with an action to sign in as someone else. */
const UserChip = function (props: Props) {
    return (
        <div className="l-who">
            <span className="l-ava" aria-hidden>
                {initials(props.name)}
            </span>
            <span className="n">{props.name}</span>
            {props.children}
        </div>
    );
};

export default UserChip;
