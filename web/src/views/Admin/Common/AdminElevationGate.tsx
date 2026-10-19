// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { Fragment, ReactNode, useCallback, useEffect, useState } from "react";

import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import { useUserInfoGET } from "@hooks/UserInfo";
import { AdminSession, getAdminSession } from "@services/Admin";
import { UserSessionElevation } from "@services/UserSessionElevation";
import { Card as AdminCard, CardHeader as AdminCardHeader, Spinner as AdminSpinner, Btn } from "@views/Admin/Common/ui";
import SecondFactorDialog from "@views/Settings/Common/SecondFactorDialog";
import "@layouts/login.css";
import "@layouts/settings.css";

export interface Props {
    // Increment to force the second factor to be confirmed again (i.e. after the confirmation has expired).
    generation: number;
    children: ReactNode;
}

type GateState = "checking" | "confirmed" | "locked";

/**
 * Opens the administration area once the administrator has confirmed their second factor recently. Signing in with the
 * second factor counts as a confirmation, after it has expired the second factor is asked for again.
 */
const AdminElevationGate = function (props: Props) {
    const { t: translate } = useTranslation("admin");
    const { createErrorNotification } = useNotifications();

    const [userInfo, fetchUserInfo] = useUserInfoGET();
    // The result of the confirmation check for a generation, a new generation requires a new check.
    const [checked, setChecked] = useState<{ generation: number; confirmed: boolean }>();
    // What the second factor dialog needs to know about the session, i.e. a passkey sign in confirms with the password.
    const [elevation, setElevation] = useState<UserSessionElevation>();
    const [dialogOpening, setDialogOpening] = useState(false);

    const applySession = useCallback((session: AdminSession) => {
        setElevation({
            can_skip_second_factor: false,
            elevated: session.confirmed,
            expires: session.expires,
            factor_knowledge: session.factor_knowledge,
            require_second_factor: true,
            skip_second_factor: false,
        });
    }, []);

    useEffect(() => {
        fetchUserInfo();
    }, [fetchUserInfo]);

    useEffect(() => {
        const generation = props.generation;

        getAdminSession()
            .then((result) => {
                applySession(result);
                setChecked({ confirmed: result.confirmed, generation });
                setDialogOpening(!result.confirmed);
            })
            .catch((err) => {
                console.error(err);
                setChecked({ confirmed: false, generation });
            });
    }, [applySession, props.generation]);

    const handleClosed = useCallback(
        (ok: boolean) => {
            setDialogOpening(false);

            if (!ok) {
                return;
            }

            getAdminSession()
                .then((result) => {
                    applySession(result);
                    setChecked({ confirmed: result.confirmed, generation: props.generation });

                    if (!result.confirmed) {
                        createErrorNotification(translate("Failed to confirm the second factor"));
                    }
                })
                .catch((err) => {
                    console.error(err);
                    createErrorNotification(translate("Failed to confirm the second factor"));
                });
        },
        [applySession, createErrorNotification, props.generation, translate],
    );

    let state: GateState = "locked";

    if (checked?.generation !== props.generation) {
        state = "checking";
    } else if (checked.confirmed) {
        state = "confirmed";
    }

    const locked = state !== "confirmed";

    // The second factor dialog is shared with the user settings, it uses their design while the gate is locked.
    useEffect(() => {
        if (!locked) {
            return;
        }

        document.documentElement.dataset.portalSkin = "";

        return () => {
            delete document.documentElement.dataset.portalSkin;
        };
    }, [locked]);

    if (!locked) {
        return <Fragment>{props.children}</Fragment>;
    }

    return (
        <Fragment>
            <SecondFactorDialog
                confirm
                description={translate("Confirm your second factor to open the administration area.")}
                info={userInfo}
                elevation={elevation}
                opening={dialogOpening && !!elevation}
                handleClosed={handleClosed}
                handleOpened={() => setDialogOpening(false)}
            />
            <div className="wrap" style={{ margin: "40px auto 0", maxWidth: 460 }}>
                <AdminCard>
                    <AdminCardHeader
                        title={
                            <div className="title-row">
                                <ShieldAlert size={18} strokeWidth={1.75} style={{ color: "var(--a-accent-tx)" }} />
                                <h2>{translate("Confirm Your Second Factor")}</h2>
                            </div>
                        }
                        subtitle={translate(
                            "The administration area contains sensitive information. Confirm your second factor to continue.",
                        )}
                    />
                    {state === "checking" ? (
                        <AdminSpinner />
                    ) : (
                        <Btn
                            id="admin-verify-identity"
                            variant="primary"
                            style={{ width: "100%" }}
                            onClick={() => setDialogOpening(true)}
                        >
                            {translate("Confirm")}
                        </Btn>
                    )}
                </AdminCard>
            </div>
        </Fragment>
    );
};

export default AdminElevationGate;
