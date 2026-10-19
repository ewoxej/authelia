// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ComponentProps, ReactNode, useEffect, useState } from "react";

import { AlertTriangle, Info, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";

import "@views/Admin/admin.css";

const cx = (...classes: (false | null | string | undefined)[]) => classes.filter(Boolean).join(" ");

const prefersDark = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/**
 * Applies the theme of the configuration ('light', 'dark', 'grey', 'oled' or 'auto') to the administration area while
 * it's mounted. Until the configuration is loaded the theme of the portal is used.
 */
export function useAdminTheme(theme: string | undefined) {
    const [dark, setDark] = useState(prefersDark);

    useEffect(() => {
        const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

        if (!query) {
            return;
        }

        const listener = (e: MediaQueryListEvent) => setDark(e.matches);

        query.addEventListener("change", listener);

        return () => query.removeEventListener("change", listener);
    }, []);

    const configured = theme || document.documentElement.dataset.theme || "auto";
    const resolved = configured === "auto" ? (dark ? "dark" : "light") : configured;

    useEffect(() => {
        document.documentElement.dataset.adminTheme = resolved;
    }, [resolved]);

    useEffect(
        () => () => {
            delete document.documentElement.dataset.adminTheme;
        },
        [],
    );
}

type ButtonVariant = "danger" | "primary" | "secondary" | "tinted";

export const Btn = function ({
    className,
    size,
    variant = "secondary",
    ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" }) {
    return (
        <button
            type="button"
            className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
            {...props}
        />
    );
};

export const IconBtn = function ({ className, danger, ...props }: ComponentProps<"button"> & { danger?: boolean }) {
    return <button type="button" className={cx("icon-btn", danger && "danger", className)} {...props} />;
};

export type BadgeTone = "accent" | "alert" | "high" | "neutral" | "planned";

export const Badge = function (props: { tone?: BadgeTone; className?: string; children: ReactNode }) {
    return <span className={cx("badge", `b-${props.tone ?? "neutral"}`, props.className)}>{props.children}</span>;
};

export const Key = function (props: { children: ReactNode }) {
    return <span className="key">{props.children}</span>;
};

export const Dot = function (props: { color: string }) {
    return <span className="dot" style={{ background: props.color }} />;
};

export function Seg<T extends string>(props: {
    value: T;
    options: { value: T; label: ReactNode }[];
    onChange: (_value: T) => void;
    label: string;
    className?: string;
}) {
    return (
        <div className={cx("seg", props.className)} role="group" aria-label={props.label}>
            {props.options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={option.value === props.value}
                    onClick={() => props.onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export const Card = function (props: { flush?: boolean; className?: string; children: ReactNode }) {
    return <div className={cx("card", props.flush && "flush", props.className)}>{props.children}</div>;
};

export const CardHeader = function (props: {
    title: ReactNode;
    subtitle?: ReactNode;
    period?: ReactNode;
    actions?: ReactNode;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div className={cx("card-h", props.className)} style={props.style}>
            <div className="t">
                {typeof props.title === "string" ? <h2>{props.title}</h2> : props.title}
                {props.subtitle ? <span className="s">{props.subtitle}</span> : null}
                {props.period ? <span className="period">{props.period}</span> : null}
            </div>
            {props.actions}
        </div>
    );
};

export const PageHeader = function (props: {
    title: ReactNode;
    description?: ReactNode;
    micro?: ReactNode;
    keyName?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="ph">
            <div className="ph-text">
                {props.micro ? <span className="micro">{props.micro}</span> : null}
                <div className="title-row">
                    <h1>{props.title}</h1>
                    {props.keyName ? <Key>{props.keyName}</Key> : null}
                </div>
                {props.description ? <p>{props.description}</p> : null}
            </div>
            {props.actions}
        </div>
    );
};

export const Stat = function (props: {
    label: ReactNode;
    value: ReactNode;
    sub?: ReactNode;
    size?: "lg" | "sm";
    onCard?: boolean;
    color?: string;
}) {
    return (
        <div className={cx("stat", props.onCard && "on-card")}>
            <div className="l">{props.label}</div>
            <div className={cx("v", props.size)} style={props.color ? { color: props.color } : undefined}>
                {props.value}
            </div>
            {props.sub ? <div className="s">{props.sub}</div> : null}
        </div>
    );
};

export const SearchBox = function (props: {
    value: string;
    onChange: (_value: string) => void;
    placeholder: string;
    style?: React.CSSProperties;
    id?: string;
}) {
    return (
        <label className="search" style={props.style}>
            <Search size={15} strokeWidth={1.75} aria-hidden />
            <span className="sr">{props.placeholder}</span>
            <input
                id={props.id}
                placeholder={props.placeholder}
                value={props.value}
                onChange={(e) => props.onChange(e.target.value)}
            />
        </label>
    );
};

export const Toggle = function (props: {
    checked: boolean;
    onChange: (_checked: boolean) => void;
    label: string;
    id?: string;
    disabled?: boolean;
}) {
    return (
        <button
            id={props.id}
            type="button"
            className="tgl"
            role="switch"
            aria-checked={props.checked}
            aria-label={props.label}
            disabled={props.disabled}
            onClick={() => props.onChange(!props.checked)}
        >
            <span />
        </button>
    );
};

export const Note = function (props: { tone: "alert" | "info" | "warn"; children: ReactNode; className?: string }) {
    const Icon = props.tone === "info" ? Info : AlertTriangle;

    return (
        <div className={cx("note", props.tone, props.className)}>
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            <span>{props.children}</span>
        </div>
    );
};

export const Avatar = function (props: { name: string; me?: boolean; size?: number }) {
    const initials =
        props.name
            .split(/[\s._@-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || "?";

    const style = props.size
        ? { fontSize: Math.round(props.size * 0.38), height: props.size, width: props.size }
        : undefined;

    return (
        <span className={cx("avatar", props.me && "me")} style={style} title={props.name}>
            {initials}
        </span>
    );
};

export const Spinner = function () {
    const { t: translate } = useTranslation("admin");

    return (
        <div className="tx3" style={{ padding: 24, textAlign: "center" }}>
            {translate("Loading…")}
        </div>
    );
};

export { cx };
