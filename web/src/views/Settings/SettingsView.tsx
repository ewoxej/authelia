// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect } from "react";

import { useTranslation } from "react-i18next";

import { Button } from "@components/UI/Button";
import { Card, CardContent } from "@components/UI/Card";
import { AdminRoute } from "@constants/Routes";
import { useConfiguration } from "@hooks/Configuration";
import { useRouterNavigate } from "@hooks/RouterNavigate";

const SettingsView = function () {
    const { t: translate } = useTranslation(["settings", "admin"]);
    const navigate = useRouterNavigate();
    const [configuration, fetchConfiguration] = useConfiguration();

    useEffect(() => {
        fetchConfiguration();
    }, [fetchConfiguration]);

    return (
        <Card>
            <CardContent className="p-6">
                <h4 className="text-2xl font-semibold text-center mb-2">{translate("User Settings")}</h4>
                <p className="text-center my-2">
                    {translate(
                        "This is the user settings area at the present time it's very minimal but will include new features in the near future",
                    )}
                </p>
                <p className="text-center my-2">
                    {translate("To view the currently available options select the menu icon at the top left")}
                </p>
                {configuration?.administrator ? (
                    <div className="flex justify-center mt-4">
                        <Button id="administration-button" onClick={() => navigate(AdminRoute)}>
                            {translate("Administration", { ns: "admin" })}
                        </Button>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
};

export default SettingsView;
