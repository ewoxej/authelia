// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useId } from "react";

import { useTranslation } from "react-i18next";

import { Toggle, cx } from "@views/Admin/Common/ui";
import { TagInput } from "@views/Admin/Configuration/FormEngine";

interface FieldProps {
    label: string;
    description?: string;
    className?: string;
    wide?: boolean;
}

const FieldShell = function (props: FieldProps & { id: string; children: ReactNode }) {
    const { t: translate } = useTranslation("admin");

    return (
        <div className={cx("fld", props.wide && "span2", props.className)}>
            <div className="fld-head">
                <label className="fld-label" htmlFor={props.id}>
                    {translate(props.label)}
                </label>
            </div>
            {props.children}
            {props.description ? <span className="help">{translate(props.description)}</span> : null}
        </div>
    );
};

export const TextField = function (
    props: FieldProps & {
        value: string | undefined;
        onChange: (_value: string) => void;
        placeholder?: string;
        type?: string;
        disabled?: boolean;
        autoComplete?: string;
        mono?: boolean;
    },
) {
    const id = useId();

    return (
        <FieldShell {...props} id={id}>
            <input
                id={id}
                className={cx("inp", props.mono && "mono")}
                type={props.type ?? "text"}
                value={props.value ?? ""}
                placeholder={props.placeholder}
                disabled={props.disabled}
                autoComplete={props.autoComplete ?? "off"}
                onChange={(e) => props.onChange(e.target.value)}
            />
        </FieldShell>
    );
};

export const NumberField = function (
    props: FieldProps & {
        value: number | undefined;
        onChange: (_value: number | undefined) => void;
        min?: number;
        max?: number;
        placeholder?: string;
    },
) {
    const id = useId();

    return (
        <FieldShell {...props} id={id}>
            <input
                id={id}
                className="inp mono"
                type="number"
                min={props.min}
                max={props.max}
                placeholder={props.placeholder}
                value={props.value ?? ""}
                onChange={(e) => props.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            />
        </FieldShell>
    );
};

export const SwitchField = function (
    props: FieldProps & { value: boolean | undefined; onChange: (_value: boolean) => void; text?: string },
) {
    const { t: translate } = useTranslation("admin");
    const id = useId();

    return (
        <FieldShell {...props} description={undefined} id={id}>
            <div className="inline-box">
                <span style={{ color: "var(--a-tx2)", flex: 1, fontSize: 13 }}>
                    {translate(props.text ?? props.description ?? props.label)}
                </span>
                <Toggle id={id} checked={!!props.value} label={translate(props.label)} onChange={props.onChange} />
            </div>
        </FieldShell>
    );
};

/** Edits a list of strings as removable tags. */
export const ListField = function (
    props: FieldProps & {
        value: string[] | undefined;
        onChange: (_value: string[]) => void;
        placeholder?: string;
    },
) {
    const { t: translate } = useTranslation("admin");
    const id = useId();

    return (
        <FieldShell {...props} id={id}>
            <TagInput
                id={id}
                values={props.value ?? []}
                placeholder={props.placeholder ?? translate("Add a value")}
                onChange={props.onChange}
            />
        </FieldShell>
    );
};

/** Removes keys with empty values so the saved YAML only contains values which were set. */
export function compact<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => compact(item)) as T;
    }

    if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};

        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (item === undefined || item === null || item === "") {
                continue;
            }

            const compacted = compact(item);

            if (
                compacted &&
                typeof compacted === "object" &&
                !Array.isArray(compacted) &&
                Object.keys(compacted).length === 0
            ) {
                continue;
            }

            result[key] = compacted;
        }

        return result as T;
    }

    return value;
}
