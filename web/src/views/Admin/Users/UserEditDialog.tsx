// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@components/UI/Dialog";
import { AdminUser, createAdminUser, updateAdminUser } from "@services/Admin";
import { useAdmin, useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import { ListField, SwitchField, TextField } from "@views/Admin/Common/Fields";
import { Btn } from "@views/Admin/Common/ui";

export const emptyAdminUser: AdminUser = {
    disabled: false,
    display_name: "",
    email: "",
    family_name: "",
    given_name: "",
    groups: [],
    middle_name: "",
    nickname: "",
    phone_extension: "",
    phone_number: "",
    username: "",
    zoneinfo: "",
};

export interface Props {
    open: boolean;
    // When undefined a new user is created.
    user?: AdminUser;
    onClose: () => void;
    onSaved: (_username: string) => void;
}

const UserEditDialog = function (props: Props) {
    const { t: translate } = useTranslation("admin");
    const { overview } = useAdmin();
    const handleError = useAdminErrorHandler();

    const creating = !props.user;
    // The dialog is mounted when it's opened so the state is initialized from the props.
    const [user, setUser] = useState<AdminUser>(() => props.user ?? { ...emptyAdminUser, groups: [] });
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [busy, setBusy] = useState(false);

    const set =
        <K extends keyof AdminUser>(key: K) =>
        (value: AdminUser[K]) =>
            setUser((u) => ({ ...u, [key]: value }));

    const passwordMismatch = creating && passwordConfirm !== "" && password !== passwordConfirm;
    const invalid =
        (creating && (user.username.trim() === "" || password === "" || password !== passwordConfirm)) ||
        (!creating && user.display_name.trim() === "");

    const handleSave = async () => {
        setBusy(true);

        try {
            if (creating) {
                await createAdminUser(user, password);
            } else {
                await updateAdminUser(user);
            }

            props.onSaved(user.username);
        } catch (err) {
            handleError(err, creating ? "Failed to create the user" : "Failed to update the user");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={props.open} onOpenChange={(open) => !open && !busy && props.onClose()}>
            <DialogContent className="adm dialog max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {creating
                            ? translate("Add user")
                            : translate("Edit User {{username}}", { username: user.username })}
                    </DialogTitle>
                </DialogHeader>
                <div className="grid2">
                    <TextField
                        label="Username"
                        mono
                        value={user.username}
                        onChange={set("username")}
                        disabled={!creating}
                        autoComplete="off"
                    />
                    <TextField label="Display Name" value={user.display_name} onChange={set("display_name")} />
                    <TextField label="Email" type="email" value={user.email} onChange={set("email")} />
                    <TextField label="Phone Number" value={user.phone_number} onChange={set("phone_number")} />
                    <TextField label="Given Name" value={user.given_name} onChange={set("given_name")} />
                    <TextField label="Family Name" value={user.family_name} onChange={set("family_name")} />
                    <ListField
                        wide
                        label="Groups"
                        description={translate("Members of the '{{group}}' group can access the administration area.", {
                            group: overview.admin_group,
                        })}
                        value={user.groups}
                        onChange={set("groups")}
                        placeholder={translate("Add a group")}
                    />
                    {creating ? (
                        <>
                            <TextField
                                label="Password"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={setPassword}
                            />
                            <TextField
                                label="Confirm Password"
                                type="password"
                                autoComplete="new-password"
                                value={passwordConfirm}
                                onChange={setPasswordConfirm}
                                description={passwordMismatch ? "The passwords don't match" : undefined}
                            />
                        </>
                    ) : null}
                    <SwitchField
                        wide
                        label="Disabled"
                        text="Disabled users can't sign in."
                        value={user.disabled}
                        onChange={set("disabled")}
                    />
                </div>
                <DialogFooter>
                    <Btn disabled={busy} onClick={props.onClose}>
                        {translate("Cancel")}
                    </Btn>
                    <Btn id="admin-user-save" variant="primary" disabled={busy || invalid} onClick={handleSave}>
                        {translate(creating ? "Create" : "Save")}
                    </Btn>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default UserEditDialog;
