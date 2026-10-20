// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import JanusLogo from "@components/JanusLogo";
import { isSignedIn } from "@hooks/LoginMark";

export interface Props {
    message: string;
    // Shows the keyhole of the coin whole, defaults to whether the user is known to be signed in.
    joined?: boolean;
}

/** A coin spinning around its horizontal axis while the page loads. */
const BaseLoadingPage = function (props: Props) {
    const joined = props.joined ?? isSignedIn();

    return (
        <div className="grid min-h-screen items-center justify-center">
            <div className="inline-block text-center">
                <div className="janus-coin p-4" data-joined={joined}>
                    <JanusLogo size={56} joined={joined} />
                </div>
                <div className="p-4">
                    <p>{props.message}...</p>
                </div>
            </div>
        </div>
    );
};

export default BaseLoadingPage;
