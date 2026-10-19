// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@components/UI/Dialog";
import { AdminValidationResult } from "@services/Admin";
import { Btn } from "@views/Admin/Common/ui";
import DiffView from "@views/Admin/Configuration/Diff";

export interface PendingSave {
    before: string;
    after: string;
    validation: AdminValidationResult;
    save: () => Promise<boolean>;
}

const row = { alignItems: "flex-start", display: "flex", fontSize: 12.5, gap: 8, lineHeight: 1.45 } as const;

export const ValidationResult = function (props: { validation: AdminValidationResult }) {
    const { t: translate } = useTranslation("admin");
    const { validation } = props;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {validation.valid ? (
                <p style={{ ...row, color: "var(--a-accent-tx)" }}>
                    <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden />
                    {translate("The configuration is valid.")}
                </p>
            ) : null}
            {validation.errors.map((error) => (
                <p key={error} style={{ ...row, color: "var(--a-alert-tx)" }}>
                    <XCircle size={16} strokeWidth={1.75} aria-hidden style={{ marginTop: 1 }} />
                    <span style={{ overflowWrap: "anywhere" }}>{error}</span>
                </p>
            ))}
            {validation.warnings.map((warning) => (
                <p key={warning} style={{ ...row, color: "var(--a-planned-tx)" }}>
                    <AlertTriangle size={16} strokeWidth={1.75} aria-hidden style={{ marginTop: 1 }} />
                    <span style={{ overflowWrap: "anywhere" }}>{warning}</span>
                </p>
            ))}
        </div>
    );
};

const SaveDialog = function (props: { pending: null | PendingSave; onClose: () => void }) {
    const { t: translate } = useTranslation("admin");
    const [busy, setBusy] = useState(false);
    const { pending } = props;

    const handleSave = async () => {
        if (!pending) return;

        setBusy(true);

        try {
            if (await pending.save()) {
                props.onClose();
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={!!pending} onOpenChange={(open) => !open && !busy && props.onClose()}>
            <DialogContent className="adm dialog max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{translate("Review changes")}</DialogTitle>
                </DialogHeader>
                {pending ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <ValidationResult validation={pending.validation} />
                        <DiffView before={pending.before} after={pending.after} />
                    </div>
                ) : null}
                <DialogFooter>
                    <Btn disabled={busy} onClick={props.onClose}>
                        {translate("Cancel")}
                    </Btn>
                    <Btn
                        id="admin-config-save-confirm"
                        variant="primary"
                        disabled={busy || !pending?.validation.valid || pending.before === pending.after}
                        onClick={handleSave}
                    >
                        {translate("Save")}
                    </Btn>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SaveDialog;
