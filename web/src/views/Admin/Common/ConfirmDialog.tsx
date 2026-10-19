// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useState } from "react";

import { useTranslation } from "react-i18next";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@components/UI/Dialog";
import { Btn } from "@views/Admin/Common/ui";

export interface Props {
    open: boolean;
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    destructive?: boolean;
    children?: ReactNode;
    onConfirm: () => Promise<void> | void;
    onClose: () => void;
}

const ConfirmDialog = function (props: Props) {
    const { t: translate } = useTranslation("admin");
    const [busy, setBusy] = useState(false);

    const handleConfirm = async () => {
        setBusy(true);

        try {
            await props.onConfirm();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={props.open} onOpenChange={(open) => !open && !busy && props.onClose()}>
            <DialogContent className="adm dialog">
                <DialogHeader>
                    <DialogTitle>{translate(props.title)}</DialogTitle>
                    {props.description ? <DialogDescription>{props.description}</DialogDescription> : null}
                </DialogHeader>
                {props.children}
                <DialogFooter>
                    <Btn disabled={busy} onClick={props.onClose}>
                        {translate("Cancel")}
                    </Btn>
                    <Btn
                        id="admin-confirm-button"
                        variant={props.destructive ? "danger" : "primary"}
                        disabled={busy}
                        onClick={handleConfirm}
                    >
                        {translate(props.confirmLabel ?? "Confirm")}
                    </Btn>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ConfirmDialog;
