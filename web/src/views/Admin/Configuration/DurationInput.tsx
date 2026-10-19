// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { KeyboardEvent, PointerEvent, useMemo, useRef, useState } from "react";

import { useTranslation } from "react-i18next";

import { formatDuration, parseDuration, shortDuration, snapPoints, tickPoints } from "@views/Admin/Common/Duration";
import { Seg, cx } from "@views/Admin/Common/ui";

export interface DurationSpecial {
    // The literal written to the configuration, i.e. '-1' or 'always'.
    value: string;
    label: string;
}

interface Props {
    id?: string;
    label: string;
    // The configured value. Undefined means the default applies.
    value: string | undefined;
    defaultValue?: string;
    // The bounds of the slider in seconds. Values typed in outside of them are accepted.
    min: number;
    max: number;
    specials?: DurationSpecial[];
    changed?: boolean;
    disabled?: boolean;
    onChange: (_value: string | undefined) => void;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** A logarithmic slider which snaps to round values, kept in sync with a text field. */
export const DurationInput = function (props: Props) {
    const { t: translate } = useTranslation("admin");
    const { changed, defaultValue, disabled, max, min, onChange, specials, value } = props;

    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [draft, setDraft] = useState<string>();

    const snaps = useMemo(() => snapPoints(min, max), [min, max]);
    const ticks = useMemo(() => tickPoints(min, max), [min, max]);

    const effective = value ?? defaultValue ?? "";
    const special = specials?.find((s) => s.value === effective);
    const parsed = parseDuration(effective);
    const seconds = "seconds" in parsed && parsed.seconds > 0 ? parsed.seconds : undefined;

    const span = Math.log(max) - Math.log(min);
    const position = (x: number) => clamp(((Math.log(clamp(x, min, max)) - Math.log(min)) / span) * 100, 0, 100);
    const nearest = (x: number) =>
        snaps.reduce((a, b) => (Math.abs(Math.log(b / x)) < Math.abs(Math.log(a / x)) ? b : a));

    const commit = (next: number) => {
        setDraft(undefined);
        onChange(shortDuration(next));
    };

    const fromPointer = (clientX: number) => {
        const rect = trackRef.current?.getBoundingClientRect();

        if (!rect || rect.width === 0) {
            return;
        }

        const percent = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);

        commit(nearest(Math.exp(Math.log(min) + (percent / 100) * span)));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        const current = snaps.indexOf(nearest(seconds ?? min));
        let index = current;

        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            index++;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            index--;
        } else if (e.key === "PageUp") {
            index += 6;
        } else if (e.key === "PageDown") {
            index -= 6;
        } else if (e.key === "Home") {
            index = 0;
        } else if (e.key === "End") {
            index = snaps.length - 1;
        } else {
            return;
        }

        e.preventDefault();
        commit(snaps[clamp(index, 0, snaps.length - 1)]);
    };

    const handleText = (text: string) => {
        setDraft(text);

        const result = parseDuration(text);

        if ("empty" in result) {
            onChange(undefined);
        } else if ("seconds" in result) {
            onChange(text.trim());
        }
    };

    const shown = draft ?? effective;
    const result = parseDuration(shown);
    const invalid = "error" in result;
    const isDefault = value === undefined;

    const handlePointerDown = (e: PointerEvent<HTMLElement>) => {
        if (disabled) {
            return;
        }

        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        fromPointer(e.clientX);
    };

    const slider = (
        <div className="slide-row">
            <div className={cx("slider", special && "off")}>
                <div
                    ref={trackRef}
                    className="track"
                    onPointerDown={handlePointerDown}
                    onPointerMove={(e) => dragging && fromPointer(e.clientX)}
                    onPointerUp={() => setDragging(false)}
                    onPointerCancel={() => setDragging(false)}
                >
                    <div
                        className={cx("fill", isDefault && "is-default")}
                        style={{ width: `${seconds ? position(seconds) : 0}%` }}
                    />
                    {seconds ? (
                        <button
                            type="button"
                            className={cx("thumb", isDefault && "is-default")}
                            role="slider"
                            aria-label={props.label}
                            aria-valuemin={min}
                            aria-valuemax={max}
                            aria-valuenow={seconds}
                            aria-valuetext={formatDuration(seconds)}
                            disabled={disabled}
                            style={{ left: `${position(seconds)}%` }}
                            onKeyDown={handleKeyDown}
                        >
                            <span className="bubble">{formatDuration(seconds)}</span>
                        </button>
                    ) : null}
                </div>
                <div className="ticks" aria-hidden>
                    {ticks.map((tick) => (
                        <span key={tick} style={{ left: `${position(tick)}%` }}>
                            {shortDuration(tick)}
                        </span>
                    ))}
                </div>
            </div>
            <input
                id={props.id}
                className={cx("inp mono", invalid && "bad", changed && "changed")}
                aria-label={translate("{{label}} value", { label: translate(props.label) })}
                placeholder={defaultValue}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                value={shown}
                style={{ width: `calc(${Math.max(4, shown.length)}ch + 30px)` }}
                onChange={(e) => handleText(e.target.value)}
                onBlur={() => setDraft(undefined)}
            />
        </div>
    );

    return (
        <div className="duration">
            {specials && specials.length !== 0 ? (
                <Seg
                    label={translate(props.label)}
                    value={special?.value ?? "duration"}
                    options={[
                        { label: translate("Duration"), value: "duration" },
                        ...specials.map((s) => ({ label: translate(s.label), value: s.value })),
                    ]}
                    onChange={(next) => {
                        if (next !== "duration") {
                            onChange(next);

                            return;
                        }

                        const fallback = defaultValue && !specials.some((s) => s.value === defaultValue);

                        onChange(fallback ? defaultValue : shortDuration(min));
                    }}
                />
            ) : null}
            {special ? null : slider}
            {invalid ? (
                <span className="help err">
                    {translate("Can't read this: {{reason}}.", {
                        reason: translate((result as { error: string }).error),
                    })}
                </span>
            ) : null}
        </div>
    );
};
