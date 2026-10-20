// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { SecondFactorMethod } from "@models/Methods";

export interface Configuration {
    available_methods: Set<SecondFactorMethod>;
    password_change_disabled: boolean;
    password_reset_disabled: boolean;
    administrator?: boolean;
    // Where the administration area is when it's only available on its own endpoint.
    administration_url?: string;
}

export interface SecuritySettingsConfiguration {
    disable: boolean;
}
