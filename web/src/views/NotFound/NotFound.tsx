// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useTranslation } from "react-i18next";

import { Button } from "@components/UI/Button";
import { SettingsRoute } from "@constants/Routes";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import MinimalLayout from "@layouts/MinimalLayout";

/** Tells there's nothing at the address, i.e. the administration area for someone who isn't an administrator. */
const NotFound = function () {
    const { t: translate } = useTranslation();
    const navigate = useRouterNavigate();

    return (
        <MinimalLayout
            id="not-found"
            title={translate("Page not found")}
            subtitle={translate("There's nothing at this address")}
        >
            <div className="l-form">
                <Button id="not-found-settings" className="l-block" onClick={() => navigate(SettingsRoute)}>
                    {translate("Go to your settings")}
                </Button>
            </div>
        </MinimalLayout>
    );
};

export default NotFound;
