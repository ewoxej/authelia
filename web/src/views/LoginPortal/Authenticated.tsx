// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useTranslation } from "react-i18next";

import Orb from "@components/Orb";

const Authenticated = function () {
    const { t: translate } = useTranslation();

    return (
        <div id="authenticated-stage" className="l-wait">
            <Orb state="ok" />
            <p>{translate("Authenticated")}</p>
        </div>
    );
};

export default Authenticated;
