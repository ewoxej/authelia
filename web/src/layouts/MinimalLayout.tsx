// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useEffect } from "react";

import { useTranslation } from "react-i18next";

import AppBarLoginPortal from "@components/AppBarLoginPortal";
import { BrandName } from "@constants/constants";
import LoginShell from "@layouts/LoginShell";
import { UserInfo } from "@models/UserInfo";

export interface Props {
    id?: string;
    children?: ReactNode;
    title?: null | string;
    subtitle?: ReactNode;
    // Shown above the title, i.e. the signed in user.
    lead?: ReactNode;
    userInfo?: UserInfo;
}

const MinimalLayout = function (props: Props) {
    const { t: translate } = useTranslation();

    useEffect(() => {
        document.title = translate("Login - {{authelia}}", { authelia: BrandName });
    }, [translate]);

    return (
        <LoginShell
            id={props.id}
            title={props.title}
            subtitle={props.subtitle}
            lead={props.lead}
            footer={false}
            top={<AppBarLoginPortal userInfo={props.userInfo} />}
        >
            {props.children}
        </LoginShell>
    );
};

export default MinimalLayout;
