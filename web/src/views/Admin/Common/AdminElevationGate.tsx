// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { Fragment, ReactNode, useCallback, useEffect, useState } from "react";

import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import { useUserInfoGET } from "@hooks/UserInfo";
import { UserSessionElevation, getUserSessionElevation } from "@services/UserSessionElevation";
import { adminDevNoAuth } from "@views/Admin/Common/DevMode";
import { Card as AdminCard, CardHeader as AdminCardHeader, Spinner as AdminSpinner, Btn } from "@views/Admin/Common/ui";
import IdentityVerificationDialog from "@views/Settings/Common/IdentityVerificationDialog";
import SecondFactorDialog from "@views/Settings/Common/SecondFactorDialog";

export interface Props {
    // Increment to force the identity verification to be performed again (i.e. after the elevation has expired).
    generation: number;
    children: ReactNode;
}

type GateState = "checking" | "elevated" | "locked";

const isElevated = (elevation?: UserSessionElevation) =>
    !!elevation && (elevation.elevated || elevation.skip_second_factor);

const AdminElevationGate = function (props: Props) {
    const { t: translate } = useTranslation("admin");
    const { createErrorNotification } = useNotifications();

    const [userInfo, fetchUserInfo] = useUserInfoGET();
    // The result of the elevation check for a generation, a new generation requires a new check.
    const [checked, setChecked] = useState<{ generation: number; elevated: boolean }>();
    const [elevation, setElevation] = useState<UserSessionElevation>();
    const [dialogSFOpening, setDialogSFOpening] = useState(false);
    const [dialogIVOpening, setDialogIVOpening] = useState(false);

    const refresh = useCallback(async () => {
        const result = await getUserSessionElevation();
        setElevation(result);

        return result;
    }, []);

    useEffect(() => {
        if (!adminDevNoAuth) {
            fetchUserInfo();
        }
    }, [fetchUserInfo]);

    useEffect(() => {
        if (adminDevNoAuth) {
            return;
        }

        const generation = props.generation;

        refresh()
            .then((result) => setChecked({ elevated: isElevated(result), generation }))
            .catch((err) => {
                console.error(err);
                setChecked({ elevated: false, generation });
            });
    }, [refresh, props.generation]);

    const setElevated = () => setChecked({ elevated: true, generation: props.generation });

    let state: GateState = "locked";

    if (checked?.generation !== props.generation) {
        state = "checking";
    } else if (checked.elevated) {
        state = "elevated";
    }

    const handleStart = () => {
        refresh()
            .then((result) => {
                if (isElevated(result)) {
                    setElevated();
                } else {
                    setDialogSFOpening(true);
                }
            })
            .catch((err) => {
                console.error(err);
                createErrorNotification(translate("Failed to get the session elevation status"));
            });
    };

    const handleSFDialogClosed = (ok: boolean, changed: boolean) => {
        if (!ok) {
            setDialogSFOpening(false);

            return;
        }

        const next = changed ? refresh() : Promise.resolve(elevation);

        next.then((result) => {
            if (isElevated(result)) {
                setElevated();
            } else {
                setDialogIVOpening(true);
            }
        }).catch((err) => {
            console.error(err);
            createErrorNotification(translate("Failed to get the session elevation status"));
        });
    };

    const handleIVDialogClosed = (ok: boolean) => {
        setDialogIVOpening(false);

        if (ok) {
            setElevated();
        }
    };

    if (state === "elevated" || adminDevNoAuth) {
        return <Fragment>{props.children}</Fragment>;
    }

    return (
        <Fragment>
            <SecondFactorDialog
                info={userInfo}
                elevation={elevation}
                opening={dialogSFOpening}
                handleClosed={handleSFDialogClosed}
                handleOpened={() => setDialogSFOpening(false)}
            />
            <IdentityVerificationDialog
                opening={dialogIVOpening}
                elevation={elevation}
                handleClosed={handleIVDialogClosed}
                handleOpened={() => setDialogIVOpening(false)}
            />
            <div className="wrap" style={{ margin: "40px auto 0", maxWidth: 460 }}>
                <AdminCard>
                    <AdminCardHeader
                        title={
                            <div className="title-row">
                                <ShieldAlert size={18} strokeWidth={1.75} style={{ color: "var(--a-accent-tx)" }} />
                                <h2>{translate("Identity Verification Required")}</h2>
                            </div>
                        }
                        subtitle={translate(
                            "The administration area contains sensitive information. Verify your identity to continue.",
                        )}
                    />
                    {state === "checking" ? (
                        <AdminSpinner />
                    ) : (
                        <Btn
                            id="admin-verify-identity"
                            variant="primary"
                            style={{ width: "100%" }}
                            onClick={handleStart}
                        >
                            {translate("Verify Identity")}
                        </Btn>
                    )}
                </AdminCard>
            </div>
        </Fragment>
    );
};

export default AdminElevationGate;
