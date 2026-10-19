// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useCallback, useEffect, useState } from "react";

import { useTranslation } from "react-i18next";

import AppBarLoginPortal from "@components/AppBarLoginPortal";
import { BrandName } from "@constants/constants";
import { useLanguageContext } from "@contexts/LanguageContext";
import LoginShell from "@layouts/LoginShell";
import { Language } from "@models/LocaleInformation";
import { UserInfo } from "@models/UserInfo";
import { getLocaleInformation } from "@services/LocaleInformation";

export interface Props {
    id?: string;
    children?: ReactNode;
    title?: null | string;
    titleTooltip?: null | string;
    subtitle?: ReactNode;
    subtitleTooltip?: null | string;
    // Shown above the title, i.e. the signed in user.
    lead?: ReactNode;
    userInfo?: UserInfo;
    maxWidth?: false | string;
}

const LoginLayout = function (props: Props) {
    const { t: translate } = useTranslation();
    const { locale, setLocale } = useLanguageContext();

    const [localeList, setLocaleList] = useState<Language[]>([]);

    const handleChangeLanguage = (locale: string) => {
        setLocale(locale);
    };

    const fetchLocaleInformation = useCallback(async () => {
        try {
            const data = await getLocaleInformation();
            setLocaleList(data.languages);

            return data;
        } catch (err) {
            console.error("could not get locale list:", err);
        }
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            await fetchLocaleInformation();
        };
        void fetchData();
    }, [fetchLocaleInformation]);

    useEffect(() => {
        document.title = translate("Login - {{authelia}}", { authelia: BrandName });
    }, [translate]);

    return (
        <LoginShell
            id={props.id}
            title={props.title}
            subtitle={props.subtitle}
            lead={props.lead}
            maxWidth={props.maxWidth}
            top={
                <AppBarLoginPortal
                    userInfo={props.userInfo}
                    onLocaleChange={handleChangeLanguage}
                    localeList={localeList}
                    localeCurrent={locale}
                />
            }
        >
            {props.children}
        </LoginShell>
    );
};

export default LoginLayout;
