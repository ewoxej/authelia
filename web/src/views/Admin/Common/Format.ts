// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

const valid = (value: null | string | undefined): Date | null => {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) || date.getFullYear() <= 1 ? null : date;
};

export function formatDateTime(value: null | string | undefined): string {
    return valid(value)?.toLocaleString() ?? "-";
}

/** Formats a date like '17 Oct · 14:52'. */
export function formatShort(value: null | string | undefined, locale?: string): string {
    const date = valid(value);

    if (!date) {
        return "-";
    }

    const day = date.toLocaleDateString(locale, { day: "2-digit", month: "short" });
    const time = date.toLocaleTimeString(locale, { hour: "2-digit", hour12: false, minute: "2-digit" });

    return `${day} · ${time}`;
}

export function formatTime(value: null | string | undefined, locale?: string): string {
    const date = valid(value);

    return date
        ? date.toLocaleTimeString(locale, { hour: "2-digit", hour12: false, minute: "2-digit", second: "2-digit" })
        : "-";
}

/** Formats the difference to now like '7 minutes ago' or 'in 3 minutes'. */
export function formatRelative(value: null | string | undefined, locale?: string): string {
    const date = valid(value);

    if (!date) {
        return "-";
    }

    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["year", 31536000],
        ["month", 2592000],
        ["week", 604800],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
    ];

    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) {
            return formatter.format(Math.round(seconds / size), unit);
        }
    }

    return formatter.format(seconds, "second");
}

/** Formats a number of seconds like '5 min' or '2 h'. */
export function formatSeconds(seconds: number): { value: string; unit: string } {
    if (seconds % 86400 === 0 && seconds >= 86400) return { unit: "d", value: String(seconds / 86400) };
    if (seconds % 3600 === 0 && seconds >= 3600) return { unit: "h", value: String(seconds / 3600) };
    if (seconds % 60 === 0 && seconds >= 60) return { unit: "min", value: String(seconds / 60) };

    return { unit: "s", value: String(seconds) };
}

export function formatNumber(value: number, locale?: string): string {
    return value.toLocaleString(locale);
}
