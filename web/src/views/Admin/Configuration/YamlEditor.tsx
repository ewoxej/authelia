// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { Fragment, KeyboardEvent, ReactNode, UIEvent, useRef } from "react";

const reLine = /^(\s*)(- )?([^\s:#'"][^:#]*?|'[^']*'|"[^"]*")(:)(\s|$)(.*)$/;
const reTemplate = /(\{\{.*?\}\})/;

/** Highlights template expressions and the comment of a value. */
function highlightValue(value: string, keyPrefix: string): ReactNode {
    const comment = value.search(/\s#/);
    const body = comment === -1 ? value : value.slice(0, comment);
    const rest = comment === -1 ? "" : value.slice(comment);

    return (
        <>
            {body.split(reTemplate).map((part, i) =>
                // Splitting on a capturing group puts the template expressions at the odd indexes.
                i % 2 === 1 ? (
                    // The parts of a line can repeat, so their position is their identity.
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    <span key={`${keyPrefix}-${i}`} className="t">
                        {part}
                    </span>
                ) : (
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    <span key={`${keyPrefix}-${i}`} className="s">
                        {part}
                    </span>
                ),
            )}
            {rest ? <span className="c">{rest}</span> : null}
        </>
    );
}

export function highlightYaml(text: string): ReactNode {
    return text.split("\n").map((line, index) => {
        const key = `l${index}`;
        let content: ReactNode;

        if (/^\s*#/.test(line)) {
            content = <span className="c">{line}</span>;
        } else {
            const match = reLine.exec(line);

            if (match) {
                const [, indent, dash = "", name, colon, space, value] = match;

                content = (
                    <>
                        {indent}
                        {dash}
                        <span className="k">{name}</span>
                        {colon}
                        {space}
                        {highlightValue(value, key)}
                    </>
                );
            } else {
                content = highlightValue(line, key);
            }
        }

        return (
            <Fragment key={key}>
                {content}
                {"\n"}
            </Fragment>
        );
    });
}

/** A YAML editor: a transparent textarea over a highlighted copy of its text. */
const YamlEditor = function (props: {
    value: string;
    onChange: (_value: string) => void;
    placeholder?: string;
    minHeight?: number | string;
}) {
    const highlightRef = useRef<HTMLPreElement>(null);

    const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
        if (highlightRef.current) {
            highlightRef.current.scrollTop = e.currentTarget.scrollTop;
            highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== "Tab") return;

        e.preventDefault();

        const target = e.currentTarget;
        const { selectionEnd, selectionStart } = target;

        props.onChange(props.value.slice(0, selectionStart) + "  " + props.value.slice(selectionEnd));

        requestAnimationFrame(() => {
            target.selectionStart = target.selectionEnd = selectionStart + 2;
        });
    };

    return (
        <div className="yaml-editor yaml">
            <pre ref={highlightRef} aria-hidden>
                {highlightYaml(props.value)}
            </pre>
            <textarea
                id="admin-config-yaml"
                spellCheck={false}
                wrap="off"
                rows={Math.min(40, Math.max(8, props.value.split("\n").length + 1))}
                style={props.minHeight ? { minHeight: props.minHeight } : undefined}
                placeholder={props.placeholder}
                value={props.value}
                onChange={(e) => props.onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
            />
        </div>
    );
};

export default YamlEditor;
