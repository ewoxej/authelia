// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { Fragment } from "react";

import { useTranslation } from "react-i18next";

import PrivacyPolicyLink from "@components/PrivacyPolicyLink";
import { EncodedName, EncodedURL } from "@constants/constants";
import { getPrivacyPolicyEnabled } from "@utils/Configuration";

export interface Props {}

const Brand = function () {
    const { t: translate } = useTranslation();

    const privacyEnabled = getPrivacyPolicyEnabled();

    return (
        <div className="l-foot">
            {privacyEnabled ? (
                <Fragment>
                    <PrivacyPolicyLink />
                    <span aria-hidden>·</span>
                </Fragment>
            ) : null}
            <a href={atob(String.fromCodePoint(...EncodedURL))} target="_blank" rel="noopener noreferrer">
                {translate("Powered by {{authelia}}", { authelia: atob(String.fromCodePoint(...EncodedName)) })}
            </a>
        </div>
    );
};

export default Brand;
