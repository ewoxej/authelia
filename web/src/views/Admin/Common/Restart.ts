// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import axios from "axios";

import { getBasePath } from "@utils/BasePath";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function healthy() {
    try {
        const res = await axios.get(getBasePath() + "/api/health", { timeout: 2000, validateStatus: () => true });

        return res.status === 200;
    } catch {
        return false;
    }
}

/**
 * Waits for Authelia to go down and come back up after a restart was requested. Returns true when it's back up.
 */
export async function waitForRestart(timeout = 60000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    let wentDown = false;

    while (Date.now() < deadline) {
        await sleep(1000);

        const up = await healthy();

        if (!up) {
            wentDown = true;
        } else if (wentDown || Date.now() > deadline - timeout + 5000) {
            return true;
        }
    }

    return false;
}
