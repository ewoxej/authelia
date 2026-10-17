// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from "react";

import { ShieldX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router";

import {
    AdminActivitySubRoute,
    AdminBansSubRoute,
    AdminConfigurationSubRoute,
    AdminUsersSubRoute,
    IndexRoute,
    SettingsRoute,
} from "@constants/Routes";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import { useAutheliaState } from "@hooks/State";
import { AdminOverview, AdminRequestError, getAdminOverview } from "@services/Admin";
import { AuthenticationLevel } from "@services/State";
import ActivityView from "@views/Admin/Activity/ActivityView";
import AdminLayout from "@views/Admin/AdminLayout";
import BansView from "@views/Admin/Bans/BansView";
import { AdminContext, AdminContextValue } from "@views/Admin/Common/AdminContext";
import AdminElevationGate from "@views/Admin/Common/AdminElevationGate";
import { adminDevNoAuth } from "@views/Admin/Common/DevMode";
import { Btn, Card, CardHeader, Spinner } from "@views/Admin/Common/ui";
import ConfigurationView from "@views/Admin/Configuration/ConfigurationView";
import OverviewView from "@views/Admin/Overview/OverviewView";
import UserDetailView from "@views/Admin/Users/UserDetailView";
import UsersView from "@views/Admin/Users/UsersView";

const AdminRouter = function () {
    const navigate = useRouterNavigate();
    const [state, fetchState, , fetchStateError] = useAutheliaState();
    const [overview, setOverview] = useState<AdminOverview>();

    useEffect(() => {
        if (!adminDevNoAuth) {
            fetchState();
        }
    }, [fetchState]);

    useEffect(() => {
        if (adminDevNoAuth) {
            return;
        }

        if (fetchStateError || (state && state.authentication_level < AuthenticationLevel.OneFactor)) {
            navigate(IndexRoute);
        }
    }, [state, fetchStateError, navigate]);

    const [generation, setGeneration] = useState(0);

    const requireElevation = useCallback(() => setGeneration((g) => g + 1), []);

    return (
        <AdminLayout overview={overview}>
            <AdminElevationGate generation={generation}>
                <AdminOverviewLoader
                    generation={generation}
                    requireElevation={requireElevation}
                    onOverview={setOverview}
                />
            </AdminElevationGate>
        </AdminLayout>
    );
};

const AdminOverviewLoader = function (props: {
    generation: number;
    requireElevation: () => void;
    onOverview: (_overview: AdminOverview) => void;
}) {
    const { t: translate } = useTranslation("admin");
    const navigate = useRouterNavigate();
    const { onOverview, requireElevation } = props;

    const [overview, setOverview] = useState<AdminOverview>();
    const [error, setError] = useState<AdminRequestError>();

    const refreshOverview = useCallback(async () => {
        try {
            const result = await getAdminOverview();

            setOverview(result);
            onOverview(result);
            setError(undefined);
        } catch (err) {
            if (err instanceof AdminRequestError && (err.elevation || err.secondFactor)) {
                requireElevation();

                return;
            }

            setError(err instanceof AdminRequestError ? err : new AdminRequestError(String(err), 0));
        }
    }, [onOverview, requireElevation]);

    useEffect(() => {
        refreshOverview().catch(console.error);
    }, [refreshOverview, props.generation]);

    const value = useMemo<AdminContextValue | null>(
        () => (overview ? { overview, refreshOverview, requireElevation } : null),
        [overview, refreshOverview, requireElevation],
    );

    if (error) {
        return (
            <div className="wrap" style={{ margin: "0 auto", maxWidth: 440 }}>
                <Card>
                    <CardHeader
                        title={
                            <div className="title-row">
                                <ShieldX size={18} strokeWidth={1.75} style={{ color: "var(--a-alert-tx)" }} />
                                <h2>{translate("Access Denied")}</h2>
                            </div>
                        }
                        subtitle={
                            error.status === 404
                                ? translate("The administration area is disabled.")
                                : translate(error.message)
                        }
                    />
                    <Btn style={{ width: "100%" }} onClick={() => navigate(SettingsRoute)}>
                        {translate("Back to Settings")}
                    </Btn>
                </Card>
            </div>
        );
    }

    if (!value) {
        return <Spinner />;
    }

    return (
        <AdminContext value={value}>
            <Routes>
                <Route path={IndexRoute} element={<OverviewView />} />
                <Route path={AdminUsersSubRoute} element={<UsersView />} />
                <Route path={`${AdminUsersSubRoute}/:username`} element={<UserDetailView />} />
                <Route path={AdminConfigurationSubRoute} element={<ConfigurationView />} />
                <Route path={`${AdminConfigurationSubRoute}/:section`} element={<ConfigurationView />} />
                <Route path={AdminActivitySubRoute} element={<ActivityView />} />
                <Route path={AdminBansSubRoute} element={<BansView />} />
            </Routes>
        </AdminContext>
    );
};

export default AdminRouter;
