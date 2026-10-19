// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { BrandName } from "@constants/constants";
import "@components/janus.css";

export interface Props {
    className?: string;
}

/** The name set the Roman way, JANVS, with the V in the accent colour. */
const JanusWordmark = function (props: Props) {
    return (
        <span className={props.className ? `janus-wordmark ${props.className}` : "janus-wordmark"}>
            <span className="janus-sr">{BrandName}</span>
            <span aria-hidden>
                JAN<em>V</em>S
            </span>
        </span>
    );
};

export default JanusWordmark;
