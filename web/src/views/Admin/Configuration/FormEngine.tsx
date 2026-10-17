// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { KeyboardEvent, ReactNode, useId, useState } from "react";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge, BadgeTone, Btn, Card, CardHeader, IconBtn, Key, Note, Seg, Toggle, cx } from "@views/Admin/Common/ui";

export type Value = Record<string, unknown>;

type Translate = (_key: string, _options?: Record<string, unknown>) => string;

interface BaseField {
    // Dot separated path relative to the current object, i.e. 'smtp.address'.
    path: string;
    label: string;
    description?: string;
    placeholder?: string;
    wide?: boolean;
}

export type FieldDef =
    | {
          kind: "array";
          path: string;
          label: string;
          description?: string;
          addLabel?: string;
          itemTitle: (_item: Value, _index: number) => string;
          itemBadge?: (_item: Value) => { label: string; tone: BadgeTone } | undefined;
          itemMeta?: (_item: Value) => string | undefined;
          itemSummary?: (_item: Value, _translate: Translate) => ReactNode;
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
          fields: FieldDef[];
      }
    | (BaseField & { kind: "bool"; text?: string })
    | (BaseField & { kind: "list" })
    | (BaseField & { kind: "number"; min?: number; max?: number })
    | (BaseField & { kind: "password" })
    | (BaseField & { kind: "select"; options: string[]; defaultValue?: string; display?: "seg" })
    | (BaseField & { kind: "text" })
    | (BaseField & { kind: "textarea" });

export interface SectionDef {
    id: string;
    title: string;
    description: string;
    // The top level configuration keys this section edits.
    keys: string[];
    // The title and description of the card holding the fields which aren't in a group or array.
    mainTitle?: string;
    mainDescription?: string;
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

const shownKey = (prefix: string, path: string) =>
    prefix && path.startsWith(prefix + ".") ? path.slice(prefix.length + 1) : path;

const fieldKey = (field: FieldDef) => `${field.kind}-${"path" in field ? field.path : field.label}`;

/** Renders the fields of a section: loose fields in a main card, groups and arrays in their own cards. */
export const SectionForm = function (props: { section: SectionDef } & Omit<RenderProps, "keyPrefix">) {
    const { t: translate } = useTranslation("admin");
    const { section } = props;
    const keyPrefix = section.keys.length === 1 ? section.keys[0] : "";

    const loose = section.fields.filter((f) => f.kind !== "group" && f.kind !== "array");
    const render = { ...props, keyPrefix };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {loose.length ? (
                <Card>
                    <CardHeader
                        title={translate(section.mainTitle ?? "Settings")}
                        subtitle={section.mainDescription ? translate(section.mainDescription) : undefined}
                        style={{ alignItems: "flex-start", marginBottom: 18 }}
                    />
                    <div className="grid2">
                        {loose.map((field) => (
                            <FieldRenderer key={fieldKey(field)} field={field} {...render} />
                        ))}
                    </div>
                </Card>
            ) : null}
            {section.fields.map((field) => {
                if (field.kind === "group") {
                    return <GroupCard key={fieldKey(field)} field={field} {...render} />;
                }

                if (field.kind === "array") {
                    return (
                        <Card key={fieldKey(field)}>
                            <ArrayEditor field={field} {...render} />
                        </Card>
                    );
                }

                return null;
            })}
        </div>
    );
};

const GroupCard = function (props: RenderProps & { field: Extract<FieldDef, { kind: "group" }> }) {
    const { t: translate } = useTranslation("admin");
    const { field } = props;

    const toggled = field.togglePath ? getPath(props.value, field.togglePath) !== undefined : true;
    const keyName = field.keyName ?? (field.togglePath ? shownKey(props.keyPrefix, field.togglePath) : undefined);

    return (
        <Card>
            <CardHeader
                title={
                    <div className="title-row" style={{ gap: 8 }}>
                        <h2>{translate(field.label)}</h2>
                        {keyName ? <Key>{keyName}</Key> : null}
                    </div>
                }
                subtitle={field.description ? translate(field.description) : undefined}
                style={{ alignItems: "flex-start", marginBottom: 18 }}
                actions={
                    field.togglePath ? (
                        <Toggle
                            checked={toggled}
                            label={translate(field.label)}
                            onChange={(on) =>
                                props.onChange(setPath(props.value, field.togglePath ?? "", on ? {} : undefined))
                            }
                        />
                    ) : undefined
                }
            />
            {!toggled && field.offNote ? (
                <div style={{ marginBottom: 18 }}>
                    <Note tone="warn">{translate(field.offNote)}</Note>
                </div>
            ) : null}
            <div className={cx("grid2", !toggled && "dim")}>
                {field.fields.map((f) =>
                    f.kind === "group" ? (
                        <div key={fieldKey(f)} className="span2">
                            <SubGroup {...props} field={f} disabled={!toggled} />
                        </div>
                    ) : (
                        <FieldRenderer key={fieldKey(f)} {...props} field={f} disabled={!toggled} />
                    ),
                )}
            </div>
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

const FieldShell = function (props: {
    id?: string;
    label: string;
    path: string;
    keyPrefix: string;
    description?: string;
    wide?: boolean;
    children: ReactNode;
}) {
    const { t: translate } = useTranslation("admin");

    return (
        <div className={cx("fld", props.wide && "span2")}>
            <div className="fld-head">
                <label className="fld-label" htmlFor={props.id}>
                    {translate(props.label)}
                </label>
                <span className="fld-key">{shownKey(props.keyPrefix, props.path)}</span>
            </div>
            {props.children}
            {props.description ? <span className="help">{translate(props.description)}</span> : null}
        </div>
    );
};

export const FieldRenderer = function (props: RenderProps & { field: FieldDef }) {
    const { t: translate } = useTranslation("admin");
    const id = useId();
    const { disabled, field, initial, onChange, value } = props;

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

    const current = getPath(value, field.path);
    const changed = !same(current, getPath(initial, field.path));
    const set = (v: unknown) => onChange(setPath(value, field.path, v));

    const shell = (children: ReactNode, wide = field.wide) => (
        <FieldShell
            id={id}
            label={field.label}
            path={field.path}
            keyPrefix={props.keyPrefix}
            description={field.description}
            wide={wide}
        >
            {children}
        </FieldShell>
    );

    switch (field.kind) {
        case "bool":
            return shell(
                <div className={cx("inline-box", changed && "changed")}>
                    <span style={{ color: "var(--a-tx2)", flex: 1, fontSize: 13 }}>
                        {translate(field.text ?? "Enabled")}
                    </span>
                    <Toggle
                        id={id}
                        checked={current === true}
                        label={translate(field.label)}
                        disabled={disabled}
                        onChange={set}
                    />
                </div>,
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

            if (field.display === "seg") {
                return shell(
                    <div style={{ alignSelf: "flex-start" }}>
                        <Seg
                            label={translate(field.label)}
                            value={text ?? field.defaultValue ?? ""}
                            options={field.options.map((o) => ({ label: o, value: o }))}
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
                        value={text ?? ""}
                        onChange={(e) => set(e.target.value === "" ? undefined : e.target.value)}
                    >
                        <option value="">
                            {field.defaultValue
                                ? translate("Default ({{value}})", { value: field.defaultValue })
                                : translate("(default)")}
                        </option>
                        {field.options.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                        {text && !field.options.includes(text) ? <option value={text}>{text}</option> : null}
                    </select>
                    <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
                </div>,
            );
        }
        case "list":
            if (current !== undefined && typeof current !== "string" && !isStringList(current)) {
                return shell(<ComplexValue value={current} />, true);
            }

            return shell(
                <TagInput
                    id={id}
                    values={typeof current === "string" ? [current] : ((current as string[] | undefined) ?? [])}
                    placeholder={field.placeholder ? translate(field.placeholder) : translate("Add a value")}
                    changed={changed}
                    disabled={disabled}
                    onChange={(v) => set(v.length === 0 ? undefined : v)}
                />,
            );
        case "textarea":
            if (current !== undefined && current !== null && typeof current === "object") {
                return shell(<ComplexValue value={current} />, true);
            }

            return shell(
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
                true,
            );
        default: {
            if (current !== undefined && current !== null && typeof current === "object") {
                return shell(<ComplexValue value={current} />, true);
            }

            const template = isTemplate(current);

            return shell(
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
            );
        }
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

export const TagInput = function (props: {
    id?: string;
    values: string[];
    placeholder: string;
    changed?: boolean;
    disabled?: boolean;
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

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
                <span key={item} className="tag">
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
                        <Key>{shownKey(props.keyPrefix, field.path)}</Key>
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
                                {badge ? (
                                    <Badge tone={badge.tone} className="policy">
                                        {badge.label}
                                    </Badge>
                                ) : null}
                                <span className="dom">
                                    {field.itemTitle(itemValue, index) || translate("new entry")}
                                </span>
                                {meta ? <span className="meta mono">{meta}</span> : null}
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
                                <div className="row-b grid2">
                                    {field.fields.map((f) => (
                                        <FieldRenderer
                                            key={fieldKey(f)}
                                            field={f}
                                            value={itemValue}
                                            initial={asItem(initialItems[index])}
                                            keyPrefix=""
                                            onChange={(v) => update(items.map((it, i) => (i === index ? v : it)))}
                                        />
                                    ))}
                                    {field.itemSummary ? (
                                        <div className="span2">
                                            <Note tone="info">{field.itemSummary(itemValue, translate)}</Note>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </>
    );
};
