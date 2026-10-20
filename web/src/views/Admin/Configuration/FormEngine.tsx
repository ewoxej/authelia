// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { Fragment, KeyboardEvent, ReactNode, useId, useState } from "react";

import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    FileKey,
    FolderOpen,
    LucideIcon,
    Plus,
    RotateCcw,
    Trash2,
    Type,
    X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminEnvironmentVariable } from "@services/Admin";
import { useAdmin } from "@views/Admin/Common/AdminContext";
import ConfirmDialog from "@views/Admin/Common/ConfirmDialog";
import { useEnvironment } from "@views/Admin/Common/Environment";
import FileBrowserDialog, { FileBrowserMode } from "@views/Admin/Common/FileBrowserDialog";
import { Badge, BadgeTone, Btn, Card, CardHeader, IconBtn, Note, Seg, Toggle, cx } from "@views/Admin/Common/ui";
import { DurationInput, DurationSpecial } from "@views/Admin/Configuration/DurationInput";
import EnvTokenInput from "@views/Admin/Configuration/EnvTokenInput";
import { hasOtherTemplates, parseEnvSegments } from "@views/Admin/Configuration/EnvTokens";

export type Value = Record<string, unknown>;

type Translate = (_key: string, _options?: Record<string, unknown>) => string;

interface BaseField {
    // Dot separated path relative to the current object, i.e. 'smtp.address'.
    path: string;
    label: string;
    description?: string;
    placeholder?: string;
    wide?: boolean;
    // The value is shown but can't be changed from the administration area.
    locked?: boolean;
}

/** A boolean in the configuration which switches a group on or off. With invert the group is on while it's false or unset. */
export interface ToggleDef {
    path: string;
    invert?: boolean;
    // A second boolean which must be on too. Turning the group on turns it on as well, turning the group off leaves it.
    also?: { path: string; invert?: boolean };
}

const isOn = (value: Value, def: { path: string; invert?: boolean }) =>
    def.invert ? getPath(value, def.path) !== true : getPath(value, def.path) === true;

const setOn = (value: Value, def: { path: string; invert?: boolean }, on: boolean) =>
    setPath(value, def.path, def.invert ? (on ? undefined : true) : on);

export interface TabDef {
    value: string;
    label: string;
    fields: FieldDef[];
}

export interface HeadingPart {
    text: string;
    key?: boolean;
    tone?: BadgeTone;
}

export type FieldDef =
    | {
          // Chooses a value for path, each choice has its own fields shown in the tab.
          kind: "tabs";
          path: string;
          label: string;
          description?: string;
          defaultValue?: string;
          tabs: TabDef[];
      }
    | {
          kind: "array";
          path: string;
          label: string;
          description?: string;
          addLabel?: string;
          splitDurations?: boolean;
          itemTitle: (_item: Value, _index: number) => string;
          itemBadge?: (_item: Value) => { label: string; tone: BadgeTone } | undefined;
          itemMeta?: (_item: Value) => string | undefined;
          // A sentence replacing the badge and the title, parts flagged `key` are highlighted.
          itemHeading?: (_item: Value, _translate: Translate) => HeadingPart[];
          fields: FieldDef[];
          newItem: () => Value;
      }
    | {
          kind: "group";
          label: string;
          description?: string;
          // The key shown next to the title.
          keyName?: string;
          // When set the group can be switched off, which removes this path from the configuration.
          togglePath?: string;
          offNote?: string;
          // Another group which can't be used together with this one. Turning this group on asks for a
          // confirmation, then removes the other group.
          replaces?: { path: string; label: string }[];
          // The group is switched by a boolean value instead of by the presence of togglePath.
          toggle?: ToggleDef;
          fields: FieldDef[];
      }
    // With invert the switch is on while the value is false or unset, for options named 'disable_*'.
    | (BaseField & { kind: "bool"; invert?: boolean })
    // With choices the values are picked from the pills instead of typed.
    | (BaseField & {
          kind: "duration";
          min: number;
          max: number;
          defaultValue?: string;
          // Values which aren't durations, i.e. '-1' or 'always'.
          specials?: DurationSpecial[];
      })
    // A logarithmic slider between min and max seconds, which snaps to round values and writes i.e. '5m'.
    | (BaseField & { kind: "list"; choices?: string[] })
    | (BaseField & { kind: "number"; min?: number; max?: number })
    // The value is a secret which can be read from a file with a template expression.
    | (BaseField & { kind: "password" })
    | (BaseField & {
          kind: "select";
          options: string[];
          defaultValue?: string;
          // Short lists of up to three options are shown as a segmented control unless 'select' is set.
          display?: "seg" | "select";
          // Shown in the segmented control in place of the option values.
          optionLabels?: Record<string, string>;
          // CSS backgrounds of the swatches shown before the option labels, i.e. theme colors.
          optionSwatches?: Record<string, string>;
          optionIcons?: Record<string, LucideIcon>;
      })
    // With picker a button opens the file picker of the server to fill in a path.
    | (BaseField & { kind: "text"; picker?: FileBrowserMode })
    // With secret the value can be read from a file.
    | (BaseField & { kind: "textarea"; secret?: boolean });

export interface SectionDef {
    id: string;
    title: string;
    description: string;
    // The top level configuration keys this section edits.
    keys: string[];
    // The title and description of the card holding the fields which aren't in a group or array.
    mainTitle?: string;
    mainDescription?: string;
    // Cards which sit side by side in a row, by group or array label. The fields which aren't in a group are 'main'.
    columns?: string[][];
    // Puts the durations in a column on the right and the other fields in one on the left.
    splitDurations?: boolean;
    // Picks which one of several groups is used, by group label. Only the chosen group is shown, without its header.
    choose?: { label: string; groups: string[] };
    fields: FieldDef[];
}

export function getPath(obj: unknown, path: string): unknown {
    let current: unknown = obj;

    for (const part of path.split(".")) {
        if (current === null || typeof current !== "object" || Array.isArray(current)) {
            return undefined;
        }

        current = (current as Value)[part];
    }

    return current;
}

export function setPath(obj: Value, path: string, value: unknown): Value {
    const [head, ...rest] = path.split(".");
    const result: Value = { ...obj };

    if (rest.length === 0) {
        if (value === undefined) {
            delete result[head];
        } else {
            result[head] = value;
        }

        return result;
    }

    const child = result[head];
    const childObj = child && typeof child === "object" && !Array.isArray(child) ? (child as Value) : {};

    result[head] = setPath(childObj, rest.join("."), value);

    return result;
}

const asString = (value: unknown): string | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value as boolean | number | string);
};

const reSecretCall = /secret\s+"(?:[^"\\]|\\.)*"/;

/** The expression which reads a secret from a file. A path replaces the one in an existing expression, keeping its functions. */
// The indentation of mindent is worked out when the configuration is written, from the position of the key.
const secretExpression = (path: string, existing: string | undefined) =>
    existing && reSecretCall.test(existing)
        ? existing.replace(reSecretCall, `secret ${JSON.stringify(path)}`)
        : `{{ secret ${JSON.stringify(path)} | mindent auto "|" | msquote }}`;

const reSecretOnly = /^\{\{\s*secret\s+("(?:[^"\\]|\\.)*")[^}]*\}\}$/;

/** The path of the file when the whole value is a template expression which reads a secret from a file. */
const secretFilePath = (value: string | undefined) => {
    const match = value ? reSecretOnly.exec(value.trim()) : null;

    if (!match) {
        return undefined;
    }

    try {
        return JSON.parse(match[1]) as string;
    } catch {
        return undefined;
    }
};

const isTemplate = (value: unknown) => typeof value === "string" && value.includes("{{");

const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Counts the leaf values which differ between two values. */
export function countChanges(a: unknown, b: unknown): number {
    const isObject = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);

    if (isObject(a) || isObject(b)) {
        const left = isObject(a) ? (a as Value) : {};
        const right = isObject(b) ? (b as Value) : {};

        return [...new Set([...Object.keys(left), ...Object.keys(right)])].reduce(
            (sum, key) => sum + countChanges(left[key], right[key]),
            0,
        );
    }

    return same(a, b) ? 0 : 1;
}

interface RenderProps {
    value: Value;
    initial: Value;
    onChange: (_value: Value) => void;
    // The prefix removed from the paths shown next to the labels.
    keyPrefix: string;
    disabled?: boolean;
}

const fieldKey = (field: FieldDef) => `${field.kind}-${"path" in field ? field.path : field.label}`;

/** Lays out fields in a grid, or with the durations on the right when asked to and there are both kinds. */
const FieldGrid = function (props: {
    fields: FieldDef[];
    split?: boolean;
    className?: string;
    // Shown above the fields in the left column and centres the right column against both.
    lead?: ReactNode;
    render: (_field: FieldDef) => ReactNode;
}) {
    const times = props.fields.filter((f) => f.kind === "duration");
    const others = props.fields.filter((f) => f.kind !== "duration");

    if (props.split && times.length !== 0 && others.length !== 0) {
        return (
            <div className={cx("split", props.lead ? "centered" : undefined, props.className)}>
                <div className="split-col">
                    {props.lead}
                    {others.map(props.render)}
                </div>
                <div className="split-col">{times.map(props.render)}</div>
            </div>
        );
    }

    return (
        <>
            {props.lead}
            <div className={cx("grid2", props.className)}>{props.fields.map(props.render)}</div>
        </>
    );
};

type GroupDef = Extract<FieldDef, { kind: "group" }>;

/** Picks one of several mutually exclusive groups, removing the others from the configuration. */
const ChooseGroup = function (props: RenderProps & { label: string; groups: GroupDef[] }) {
    const { t: translate } = useTranslation("admin");
    const { groups, value } = props;

    const selected = groups.find((g) => g.togglePath && getPath(value, g.togglePath) !== undefined);

    const apply = (target: GroupDef) => {
        const cleared = groups
            .filter((g) => g !== target && g.togglePath)
            .reduce((v, g) => setPath(v, g.togglePath ?? "", undefined), value);

        props.onChange(
            getPath(cleared, target.togglePath ?? "") === undefined
                ? setPath(cleared, target.togglePath ?? "", {})
                : cleared,
        );
    };

    const handleChoose = (label: string) => {
        const target = groups.find((g) => g.label === label);

        if (!target || target === selected) {
            return;
        }

        apply(target);
    };

    return (
        <div className="fld inline beside">
            <div className="fld-head">
                <span className="fld-title">
                    <span className="fld-label">{translate(props.label)}</span>
                </span>
            </div>
            <Seg
                label={translate(props.label)}
                value={selected?.label ?? ""}
                options={groups.map((g) => ({ label: translate(g.label), value: g.label }))}
                onChange={handleChoose}
            />
        </div>
    );
};

/** Renders the fields of a section: loose fields in a main card, groups and arrays in their own cards. */
export const SectionForm = function (props: { section: SectionDef } & Omit<RenderProps, "keyPrefix">) {
    const { t: translate } = useTranslation("admin");
    const { section } = props;
    const keyPrefix = section.keys.length === 1 ? section.keys[0] : "";

    const loose = section.fields.filter((f) => f.kind !== "group" && f.kind !== "array");
    const render = { ...props, keyPrefix };

    const choice = section.choose
        ? section.fields.filter(
              (f): f is GroupDef => f.kind === "group" && (section.choose?.groups.includes(f.label) ?? false),
          )
        : [];
    const chosen = choice.find((g) => g.togglePath && getPath(props.value, g.togglePath) !== undefined);
    const chooser =
        section.choose && choice.length !== 0 ? (
            <ChooseGroup {...render} label={section.choose.label} groups={choice} />
        ) : null;

    const main =
        loose.length === 0 && !chooser ? null : section.mainTitle === "" ? (
            <Card>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {chooser}
                    {loose.length === 0 ? null : (
                        <div className="grid2">
                            {loose.map((field) => (
                                <FieldRenderer key={fieldKey(field)} field={field} {...render} />
                            ))}
                        </div>
                    )}
                </div>
            </Card>
        ) : (
            <Card>
                <CardHeader
                    title={translate(section.mainTitle ?? "Settings")}
                    subtitle={section.mainDescription ? translate(section.mainDescription) : undefined}
                    style={{ alignItems: "flex-start", marginBottom: 18 }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {section.splitDurations ? null : chooser}
                    <FieldGrid
                        fields={loose}
                        lead={section.splitDurations ? chooser : undefined}
                        split={section.splitDurations}
                        render={(field) => <FieldRenderer key={fieldKey(field)} field={field} {...render} />}
                    />
                </div>
            </Card>
        );

    // The cards in the order they appear, each with the name the layout refers to it by.
    const items: { name: string; node: ReactNode }[] = [];

    if (main) {
        items.push({ name: "main", node: main });
    }

    for (const field of section.fields) {
        if (field.kind === "group") {
            if (choice.includes(field)) {
                if (field === chosen) {
                    items.push({
                        name: field.label,
                        node: <GroupCard key={fieldKey(field)} field={field} bare {...render} />,
                    });
                }

                continue;
            }

            items.push({ name: field.label, node: <GroupCard key={fieldKey(field)} field={field} {...render} /> });
        } else if (field.kind === "array") {
            items.push({
                name: field.label,
                node: (
                    <Card key={fieldKey(field)}>
                        <ArrayEditor field={field} {...render} />
                    </Card>
                ),
            });
        }
    }

    const placed = new Set<string>();
    const content: ReactNode[] = [];

    for (const item of items) {
        if (placed.has(item.name)) {
            continue;
        }

        const row = section.columns?.find((names) => names.includes(item.name));

        if (!row) {
            placed.add(item.name);
            content.push(<div key={item.name}>{item.node}</div>);

            continue;
        }

        const members = row.flatMap((name) => items.filter((i) => i.name === name));

        members.forEach((member) => placed.add(member.name));
        content.push(
            <div key={row.join("|")} className="cols2">
                {members.map((member) => (
                    <div key={member.name}>{member.node}</div>
                ))}
            </div>,
        );
    }

    return <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>{content}</div>;
};

const GroupCard = function (props: RenderProps & { field: GroupDef; bare?: boolean }) {
    const { t: translate } = useTranslation("admin");
    const { field } = props;
    const [confirmReplace, setConfirmReplace] = useState(false);

    const toggle = field.toggle;
    const hasToggle = toggle !== undefined || field.togglePath !== undefined;
    const toggled = toggle
        ? isOn(props.value, toggle) && (toggle.also ? isOn(props.value, toggle.also) : true)
        : field.togglePath
          ? getPath(props.value, field.togglePath) !== undefined
          : true;
    const replaced = (field.replaces ?? []).filter((other) => getPath(props.value, other.path) !== undefined);

    const handleToggle = (on: boolean) => {
        if (toggle) {
            const next = setOn(props.value, toggle, on);

            props.onChange(on && toggle.also ? setOn(next, toggle.also, true) : next);

            return;
        }

        if (on && replaced.length !== 0) {
            setConfirmReplace(true);

            return;
        }

        props.onChange(setPath(props.value, field.togglePath ?? "", on ? {} : undefined));
    };

    if (props.bare) {
        return (
            <Card>
                <div className="grid2">
                    {field.fields.map((f) =>
                        f.kind === "group" ? (
                            <div key={fieldKey(f)} className="span2">
                                <SubGroup {...props} field={f} />
                            </div>
                        ) : (
                            <FieldRenderer key={fieldKey(f)} {...props} field={f} />
                        ),
                    )}
                </div>
            </Card>
        );
    }

    return (
        <Card>
            {replaced.length !== 0 ? (
                <ConfirmDialog
                    open={confirmReplace}
                    title={translate("Turn on {{name}}?", { name: translate(field.label) })}
                    description={translate(
                        "{{name}} can't be used together with {{other}}. Turning it on removes the {{other}} settings from the configuration when you save. Nothing is deleted from the disk, and Reset brings them back before saving.",
                        {
                            name: translate(field.label),
                            other: replaced.map((other) => translate(other.label)).join(", "),
                        },
                    )}
                    confirmLabel={translate("Turn on {{name}}", { name: translate(field.label) })}
                    destructive
                    onClose={() => setConfirmReplace(false)}
                    onConfirm={() => {
                        setConfirmReplace(false);
                        props.onChange(
                            setPath(
                                replaced.reduce((value, other) => setPath(value, other.path, undefined), props.value),
                                field.togglePath ?? "",
                                {},
                            ),
                        );
                    }}
                />
            ) : null}
            <CardHeader
                title={
                    <div className="title-row" style={{ gap: 8 }}>
                        <h2>{translate(field.label)}</h2>
                    </div>
                }
                subtitle={field.description ? translate(field.description) : undefined}
                style={{ alignItems: "flex-start", marginBottom: 18 }}
                actions={
                    hasToggle ? (
                        <Toggle checked={toggled} label={translate(field.label)} onChange={handleToggle} />
                    ) : undefined
                }
            />
            {!toggled && field.offNote ? (
                <div>
                    <Note tone="warn">{translate(field.offNote)}</Note>
                </div>
            ) : null}
            {toggled && field.fields.length !== 0 ? (
                <div className="grid2">
                    {field.fields.map((f) =>
                        f.kind === "group" ? (
                            <div key={fieldKey(f)} className="span2">
                                <SubGroup {...props} field={f} />
                            </div>
                        ) : (
                            <FieldRenderer key={fieldKey(f)} {...props} field={f} />
                        ),
                    )}
                </div>
            ) : null}
        </Card>
    );
};

/** A group nested in a group card, i.e. the parameters of a password hashing algorithm. */
const SubGroup = function (props: RenderProps & { field: Extract<FieldDef, { kind: "group" }> }) {
    const { t: translate } = useTranslation("admin");
    const [open, setOpen] = useState(false);

    return (
        <div className={cx("row", open && "open")}>
            <div className="row-h">
                <IconBtn className="exp" aria-expanded={open} onClick={() => setOpen(!open)}>
                    <ChevronRight className="chev" size={16} strokeWidth={1.75} aria-hidden />
                </IconBtn>
                <span className="dom" style={{ fontFamily: "var(--a-font-sans)", fontWeight: 600 }}>
                    {translate(props.field.label)}
                </span>
            </div>
            {open ? (
                <div className="row-b grid2">
                    {props.field.fields.map((f) => (
                        <FieldRenderer key={fieldKey(f)} {...props} field={f} />
                    ))}
                </div>
            ) : null}
        </div>
    );
};

/** Tabs, one per choice of a value, showing the fields of the choice. The configured choice is marked. */
const TabsField = function (props: RenderProps & { field: Extract<FieldDef, { kind: "tabs" }> }) {
    const { t: translate } = useTranslation("admin");
    const { field, initial, onChange, value } = props;

    const configured = asString(getPath(value, field.path)) ?? field.defaultValue;
    const [viewed, setViewed] = useState(configured ?? field.tabs[0].value);
    const tab = field.tabs.find((t) => t.value === viewed) ?? field.tabs[0];
    const inUse = tab.value === configured;
    const changed = !same(getPath(value, field.path), getPath(initial, field.path));

    return (
        <div className="fld">
            <div className="fld-head" data-tip={field.description ? translate(field.description) : undefined}>
                <span className="fld-label">{translate(field.label)}</span>
            </div>
            <div className={cx("tabs", changed && "changed")} role="tablist" aria-label={translate(field.label)}>
                {field.tabs.map((t) => (
                    <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={t.value === tab.value}
                        className="tab"
                        onClick={() => setViewed(t.value)}
                    >
                        {translate(t.label)}
                        {t.value === configured ? <span className="dot" title={translate("In use")} /> : null}
                    </button>
                ))}
            </div>
            <div className="tab-panel" role="tabpanel">
                {inUse ? null : (
                    <div className="tab-use">
                        <span className="help">
                            {translate("Not in use. New passwords are hashed with {{algorithm}}.", {
                                algorithm: translate(field.tabs.find((t) => t.value === configured)?.label ?? ""),
                            })}
                        </span>
                        <Btn size="sm" onClick={() => onChange(setPath(value, field.path, tab.value))}>
                            {translate("Use {{algorithm}}", { algorithm: translate(tab.label) })}
                        </Btn>
                    </div>
                )}
                <div className="grid2">
                    {tab.fields.map((f) => (
                        <FieldRenderer key={fieldKey(f)} {...props} field={f} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const FieldShell = function (props: {
    id?: string;
    label: string;
    path: string;
    keyPrefix: string;
    description?: string;
    wide?: boolean;
    kind?: string;
    // When set a reset button is shown next to the label which removes the value so the default applies.
    onReset?: () => void;
    children: ReactNode;
}) {
    const { t: translate } = useTranslation("admin");

    return (
        <div
            className={cx("fld", "inline", props.kind && `k-${props.kind}`, props.wide && "span2")}
            data-tip={props.description ? translate(props.description) : undefined}
        >
            <div className="fld-head">
                <span className="fld-title">
                    <label className="fld-label" htmlFor={props.id}>
                        {translate(props.label)}
                    </label>
                    {props.onReset ? (
                        <button
                            type="button"
                            className="fld-reset"
                            title={translate("Reset to the default")}
                            aria-label={translate("Reset {{label}} to the default", {
                                label: translate(props.label),
                            })}
                            onClick={props.onReset}
                        >
                            <RotateCcw size={12} strokeWidth={2} aria-hidden />
                        </button>
                    ) : null}
                </span>
            </div>
            {props.children}
        </div>
    );
};

export const FieldRenderer = function (props: RenderProps & { field: FieldDef }) {
    const { t: translate } = useTranslation("admin");
    const id = useId();
    const { overview } = useAdmin();
    const variables = useEnvironment();
    const [browsing, setBrowsing] = useState(false);
    const { field, initial, onChange, value } = props;
    // Environment variables are referenced with template expressions, which need the template filter.
    const templates = (overview.configuration_filters ?? []).includes("template");

    if (field.kind === "group") {
        return <SubGroup {...props} field={field} />;
    }

    if (field.kind === "array") {
        return (
            <div className="span2">
                <ArrayEditor {...props} field={field} />
            </div>
        );
    }

    if (field.kind === "tabs") {
        return (
            <div className="span2">
                <TabsField {...props} field={field} />
            </div>
        );
    }

    const disabled = props.disabled || field.locked;
    const current = getPath(value, field.path);
    const changed = !same(current, getPath(initial, field.path));
    const set = (v: unknown) => onChange(setPath(value, field.path, v));

    const resettable = (field.kind === "select" || field.kind === "duration") && current !== undefined && !disabled;

    const shell = (children: ReactNode, wide = field.wide) => (
        <FieldShell
            id={id}
            label={field.label}
            path={field.path}
            keyPrefix={props.keyPrefix}
            description={field.description}
            wide={wide}
            kind={field.kind}
            onReset={resettable ? () => set(undefined) : undefined}
        >
            {children}
        </FieldShell>
    );

    // Secrets are read from a file with a template expression, which needs the template filter.
    const secretFiles =
        (field.kind === "password" || (field.kind === "textarea" && field.secret)) &&
        (overview.configuration_filters ?? []).includes("template");
    const pickerMode: FileBrowserMode | undefined =
        field.kind === "text" ? field.picker : secretFiles ? "file" : undefined;
    const currentText = asString(current);
    const secretPath = secretFiles ? secretFilePath(currentText) : undefined;
    const pickerValue = secretFiles ? (secretPath ?? /secret\s+"([^"]+)"/.exec(currentText ?? "")?.[1]) : currentText;

    const pickerDialog = pickerMode ? (
        <FileBrowserDialog
            open={browsing}
            mode={pickerMode}
            title={secretFiles ? "Choose the file with the secret" : field.label}
            value={pickerValue}
            generateSecret={secretFiles ? `${field.path.split(".").pop()}.txt` : undefined}
            onClose={() => setBrowsing(false)}
            onSelect={(path) => {
                setBrowsing(false);
                set(secretFiles ? secretExpression(path, currentText) : path);
            }}
        />
    ) : null;

    const withButton = (input: ReactNode) => {
        if (!pickerMode) {
            return input;
        }

        // A secret read from a file shows the path of the file, which is changed by picking another file.
        if (secretPath !== undefined) {
            return (
                <div className="field-with-button">
                    <div style={{ position: "relative" }}>
                        <input
                            id={id}
                            readOnly
                            className={cx("inp mono", changed && "changed")}
                            value={secretPath.split("/").pop() || secretPath}
                            title={`${secretPath}\n${translate("Choose another file")}`}
                            disabled={disabled}
                            style={{ cursor: "pointer", paddingRight: 64 }}
                            onClick={() => setBrowsing(true)}
                        />
                        <span style={{ position: "absolute", right: 8, top: 9 }}>
                            <Badge tone="accent">{translate("file")}</Badge>
                        </span>
                    </div>
                    <Btn disabled={disabled} onClick={() => set(undefined)}>
                        <Type size={14} strokeWidth={1.75} aria-hidden />
                        {translate("From text")}
                    </Btn>
                    {pickerDialog}
                </div>
            );
        }

        return (
            <div className="field-with-button">
                {input}
                <Btn disabled={disabled} onClick={() => setBrowsing(true)}>
                    {secretFiles ? (
                        <FileKey size={14} strokeWidth={1.75} aria-hidden />
                    ) : (
                        <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
                    )}
                    {translate(secretFiles ? "From file" : "Browse")}
                </Btn>
                {pickerDialog}
            </div>
        );
    };

    const textField = () => {
        if (current !== undefined && current !== null && typeof current === "object") {
            return shell(<ComplexValue value={current} />, true);
        }

        if (templates && field.kind === "text" && !hasOtherTemplates(asString(current))) {
            return shell(
                withButton(
                    <EnvTokenInput
                        id={id}
                        className={cx("inp mono", changed && "changed")}
                        placeholder={field.placeholder}
                        ariaLabel={translate(field.label)}
                        disabled={disabled}
                        value={asString(current) ?? ""}
                        variables={variables}
                        onChange={(v) => set(v === "" ? undefined : v)}
                    />,
                ),
            );
        }

        const template = isTemplate(current);

        return shell(
            withButton(
                <div style={{ position: "relative" }}>
                    <input
                        id={id}
                        className={cx("inp mono", changed && "changed")}
                        // Template expressions only reference a secret, so they're shown as text.
                        type={field.kind === "password" && !template ? "password" : "text"}
                        autoComplete={field.kind === "password" ? "new-password" : "off"}
                        placeholder={field.placeholder}
                        disabled={disabled}
                        value={asString(current) ?? ""}
                        style={template ? { color: "var(--a-tx2)", paddingRight: 92 } : undefined}
                        onChange={(e) => set(e.target.value === "" ? undefined : e.target.value)}
                    />
                    {template ? (
                        <span style={{ position: "absolute", right: 8, top: 9 }}>
                            <Badge tone="accent">template</Badge>
                        </span>
                    ) : null}
                </div>,
            ),
        );
    };

    switch (field.kind) {
        case "bool":
            return (
                <div
                    className={cx("fld", field.wide && "span2")}
                    data-tip={field.description ? translate(field.description) : undefined}
                >
                    <div className={cx("toggle-row", changed && "changed")}>
                        <label className="fld-label" htmlFor={id}>
                            {translate(field.label)}
                        </label>
                        <Toggle
                            id={id}
                            checked={field.invert ? current !== true : current === true}
                            label={translate(field.label)}
                            disabled={disabled}
                            onChange={(on) => set(field.invert ? (on ? undefined : true) : on)}
                        />
                    </div>
                </div>
            );
        case "number":
            return shell(
                <input
                    id={id}
                    className={cx("inp mono", changed && "changed")}
                    type="number"
                    min={field.min}
                    max={field.max}
                    placeholder={field.placeholder}
                    disabled={disabled}
                    value={asString(current) ?? ""}
                    onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
                />,
            );
        case "select": {
            const text = asString(current);
            const effective = text ?? field.defaultValue;

            const asSeg =
                field.display === "seg" ||
                (field.display === undefined &&
                    field.options.length <= 3 &&
                    (effective === undefined || field.options.includes(effective)));

            if (asSeg) {
                return shell(
                    <div style={{ alignSelf: "flex-start" }}>
                        <Seg
                            label={translate(field.label)}
                            className={cx(
                                (field.optionIcons || field.optionSwatches) && "tiles",
                                text === undefined && "is-default",
                                changed && "changed",
                            )}
                            value={effective ?? ""}
                            options={field.options.map((o) => {
                                const Icon = field.optionIcons?.[o];
                                const swatch = field.optionSwatches?.[o];

                                return {
                                    label: (
                                        <>
                                            {swatch ? <span className="swatch" style={{ background: swatch }} /> : null}
                                            {Icon ? <Icon size={17} strokeWidth={1.6} aria-hidden /> : null}
                                            {field.optionLabels?.[o] ?? o}
                                        </>
                                    ),
                                    value: o,
                                };
                            })}
                            onChange={set}
                        />
                    </div>,
                );
            }

            return shell(
                <div className="sel">
                    <select
                        id={id}
                        className={cx("inp", !text && "is-default", changed && "changed")}
                        disabled={disabled}
                        value={effective ?? ""}
                        onChange={(e) => set(e.target.value)}
                    >
                        {effective === undefined ? (
                            <option value="" disabled hidden>
                                {translate("Not set")}
                            </option>
                        ) : null}
                        {field.options.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                        {effective && !field.options.includes(effective) ? (
                            <option value={effective}>{effective}</option>
                        ) : null}
                    </select>
                    <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
                </div>,
            );
        }
        case "list":
            if (current !== undefined && typeof current !== "string" && !isStringList(current)) {
                return shell(<ComplexValue value={current} />, true);
            }

            if (field.choices) {
                return shell(
                    <ChoiceInput
                        id={id}
                        choices={field.choices}
                        label={translate(field.label)}
                        values={typeof current === "string" ? [current] : ((current as string[] | undefined) ?? [])}
                        changed={changed}
                        disabled={disabled}
                        onChange={(v) => set(v.length === 0 ? undefined : v)}
                    />,
                );
            }

            return shell(
                <TagInput
                    id={id}
                    values={typeof current === "string" ? [current] : ((current as string[] | undefined) ?? [])}
                    placeholder={field.placeholder ? translate(field.placeholder) : translate("Add a value")}
                    changed={changed}
                    disabled={disabled}
                    variables={templates ? variables : undefined}
                    onChange={(v) => set(v.length === 0 ? undefined : v)}
                />,
            );
        case "textarea":
            if (current !== undefined && current !== null && typeof current === "object") {
                return shell(<ComplexValue value={current} />, true);
            }

            return shell(
                withButton(
                    <textarea
                        id={id}
                        spellCheck={false}
                        rows={Math.min(12, Math.max(3, (asString(current) ?? "").split("\n").length + 1))}
                        className={cx("inp mono", changed && "changed")}
                        placeholder={field.placeholder}
                        disabled={disabled}
                        value={asString(current) ?? ""}
                        onChange={(e) => set(e.target.value === "" ? undefined : e.target.value)}
                    />,
                ),
                true,
            );
        case "duration":
            if (!isTemplate(current) && (current === undefined || typeof current !== "object")) {
                return shell(
                    <DurationInput
                        id={id}
                        label={field.label}
                        value={asString(current)}
                        defaultValue={field.defaultValue}
                        min={field.min}
                        max={field.max}
                        specials={field.specials}
                        changed={changed}
                        disabled={disabled}
                        onChange={set}
                    />,
                );
            }

            return textField();
        default:
            return textField();
    }
};

const ComplexValue = function (props: { value: unknown }) {
    const { t: translate } = useTranslation("admin");

    return (
        <>
            <pre className="complex">{JSON.stringify(props.value, null, 2)}</pre>
            <span className="help">{translate("This value is complex, edit it with the YAML editor.")}</span>
        </>
    );
};

/** The picked values as removable tags followed by a plus button which lists the values still available. */
const ChoiceInput = function (props: {
    id?: string;
    label: string;
    choices: string[];
    values: string[];
    changed?: boolean;
    disabled?: boolean;
    onChange: (_values: string[]) => void;
}) {
    const { t: translate } = useTranslation("admin");
    const [open, setOpen] = useState(false);

    const available = props.choices.filter((choice) => !props.values.includes(choice));

    return (
        <div className="choice">
            <div className="tag-input bare">
                {props.values.map((item) => (
                    <span key={item} className={cx("tag", props.changed && "changed")}>
                        {item}
                        <button
                            type="button"
                            aria-label={translate("Remove {{value}}", { value: item })}
                            disabled={props.disabled}
                            onClick={() => props.onChange(props.values.filter((v) => v !== item))}
                        >
                            <X size={12} strokeWidth={1.75} aria-hidden />
                        </button>
                    </span>
                ))}
                <button
                    id={props.id}
                    type="button"
                    className="tag-add"
                    aria-expanded={open}
                    aria-label={translate("Add {{label}}", { label: props.label })}
                    disabled={props.disabled || available.length === 0}
                    onClick={() => setOpen(!open)}
                >
                    <Plus size={14} strokeWidth={2} aria-hidden />
                </button>
            </div>
            {open && available.length !== 0 ? (
                <div className="pills">
                    {available.map((choice) => (
                        <button
                            key={choice}
                            type="button"
                            className="pill"
                            onClick={() => {
                                props.onChange(props.choices.filter((v) => v === choice || props.values.includes(v)));
                                setOpen(false);
                            }}
                        >
                            {choice}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

/** The text of a value with the environment variables it references shown as tokens. */
const EnvText = function (props: { value: string }) {
    // The segments of a value never change order, so their position identifies them.
    const segments = parseEnvSegments(props.value).map((segment, position) => ({ ...segment, position }));

    return (
        <>
            {segments.map((segment) =>
                segment.kind === "env" ? (
                    <span key={`env-${segment.position}`} className="env-token">
                        ${segment.name}
                    </span>
                ) : (
                    <span key={`text-${segment.position}`}>{segment.text}</span>
                ),
            )}
        </>
    );
};

export const TagInput = function (props: {
    id?: string;
    values: string[];
    placeholder: string;
    changed?: boolean;
    disabled?: boolean;
    // When set, values can reference these environment variables, which are suggested after typing '$'.
    variables?: AdminEnvironmentVariable[];
    onChange: (_values: string[]) => void;
}) {
    const { t: translate } = useTranslation("admin");
    const [draft, setDraft] = useState("");

    const add = () => {
        const items = draft
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter((item) => item !== "" && !props.values.includes(item));

        if (items.length !== 0) {
            props.onChange([...props.values, ...items]);
        }

        setDraft("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
        } else if (e.key === "Backspace" && draft === "" && props.values.length !== 0) {
            props.onChange(props.values.slice(0, -1));
        }
    };

    return (
        <div className={cx("tag-input", props.changed && "changed")}>
            {props.values.map((item) => (
                <span key={item} className="tag" title={item}>
                    <span className="tag-text">{props.variables ? <EnvText value={item} /> : item}</span>
                    <button
                        type="button"
                        aria-label={translate("Remove {{value}}", { value: item })}
                        disabled={props.disabled}
                        onClick={() => props.onChange(props.values.filter((v) => v !== item))}
                    >
                        <X size={12} strokeWidth={1.75} aria-hidden />
                    </button>
                </span>
            ))}
            {props.variables ? (
                <EnvTokenInput
                    id={props.id}
                    className="tag-draft"
                    value={draft}
                    variables={props.variables}
                    placeholder={props.placeholder}
                    disabled={props.disabled}
                    onChange={setDraft}
                    onKeyDown={handleKeyDown}
                    onBlur={add}
                />
            ) : (
                <input
                    id={props.id}
                    value={draft}
                    placeholder={props.placeholder}
                    aria-label={props.placeholder}
                    disabled={props.disabled}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={add}
                />
            )}
        </div>
    );
};

const ArrayEditor = function (props: RenderProps & { field: Extract<FieldDef, { kind: "array" }> }) {
    const { t: translate } = useTranslation("admin");
    const { field, initial, onChange, value } = props;
    const [expanded, setExpanded] = useState<null | number>(null);

    const raw = getPath(value, field.path);
    const items = Array.isArray(raw) ? (raw as unknown[]) : [];
    const initialRaw = getPath(initial, field.path);
    const initialItems = Array.isArray(initialRaw) ? (initialRaw as unknown[]) : [];

    const update = (next: unknown[]) => onChange(setPath(value, field.path, next.length === 0 ? undefined : next));

    const move = (index: number, delta: number) => {
        const target = index + delta;

        if (target < 0 || target >= items.length) return;

        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        update(next);
        setExpanded(target);
    };

    const asItem = (item: unknown) => (item && typeof item === "object" && !Array.isArray(item) ? (item as Value) : {});

    return (
        <>
            <CardHeader
                title={
                    <div className="title-row" style={{ gap: 8 }}>
                        <h2>{translate(field.label)}</h2>
                        <Badge>{items.length}</Badge>
                    </div>
                }
                subtitle={field.description ? translate(field.description) : undefined}
                actions={
                    <Btn
                        variant="tinted"
                        onClick={() => {
                            update([...items, field.newItem()]);
                            setExpanded(items.length);
                        }}
                    >
                        + {translate(field.addLabel ?? "Add")}
                    </Btn>
                }
            />
            <div className="rows">
                {items.length === 0 ? <div className="empty">{translate("No entries")}</div> : null}
                {items.map((item, index) => {
                    const itemValue = asItem(item);
                    const open = expanded === index;
                    const badge = field.itemBadge?.(itemValue);
                    const meta = field.itemMeta?.(itemValue);
                    const heading = field.itemHeading?.(itemValue, translate);

                    return (
                        // eslint-disable-next-line @eslint-react/no-array-index-key
                        <div key={index} className={cx("row", open && "open")}>
                            <div className="row-h">
                                <IconBtn
                                    className="exp"
                                    aria-expanded={open}
                                    aria-label={translate("Toggle entry {{number}}", { number: index + 1 })}
                                    onClick={() => setExpanded(open ? null : index)}
                                >
                                    <ChevronRight className="chev" size={16} strokeWidth={1.75} aria-hidden />
                                </IconBtn>
                                <span className="num">#{index + 1}</span>
                                {heading ? (
                                    <span className="dom sentence">
                                        {heading.map((part, i) => (
                                            // eslint-disable-next-line @eslint-react/no-array-index-key
                                            <Fragment key={i}>
                                                {i === 0 ? "" : " "}
                                                {part.key ? (
                                                    <b className={cx("hl", part.tone && `tone-${part.tone}`)}>
                                                        {part.text}
                                                    </b>
                                                ) : (
                                                    part.text
                                                )}
                                            </Fragment>
                                        ))}
                                    </span>
                                ) : (
                                    <>
                                        {badge ? (
                                            <Badge tone={badge.tone} className="policy">
                                                {badge.label}
                                            </Badge>
                                        ) : null}
                                        <span className="dom">
                                            {field.itemTitle(itemValue, index) || translate("new entry")}
                                        </span>
                                        {meta ? <span className="meta mono">{meta}</span> : null}
                                    </>
                                )}
                                <div className="acts">
                                    <IconBtn
                                        aria-label={translate("Move up")}
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        <ArrowUp size={16} strokeWidth={1.75} aria-hidden />
                                    </IconBtn>
                                    <IconBtn
                                        aria-label={translate("Move down")}
                                        disabled={index === items.length - 1}
                                        onClick={() => move(index, 1)}
                                    >
                                        <ArrowDown size={16} strokeWidth={1.75} aria-hidden />
                                    </IconBtn>
                                    <IconBtn
                                        danger
                                        aria-label={translate("Remove")}
                                        onClick={() => {
                                            update(items.filter((_, i) => i !== index));
                                            setExpanded(null);
                                        }}
                                    >
                                        <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                                    </IconBtn>
                                </div>
                            </div>
                            {open ? (
                                <FieldGrid
                                    className="row-b"
                                    fields={field.fields}
                                    split={field.splitDurations}
                                    render={(f) => (
                                        <FieldRenderer
                                            key={fieldKey(f)}
                                            field={f}
                                            value={itemValue}
                                            initial={asItem(initialItems[index])}
                                            keyPrefix=""
                                            onChange={(v) => update(items.map((it, i) => (i === index ? v : it)))}
                                        />
                                    )}
                                />
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </>
    );
};
