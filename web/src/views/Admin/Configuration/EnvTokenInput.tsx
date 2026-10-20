// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ClipboardEvent, KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { useTranslation } from "react-i18next";

import { AdminEnvironmentVariable } from "@services/Admin";
import { cx } from "@views/Admin/Common/ui";
import { envExpression, envQuery, filterEnvVariables, parseEnvSegments } from "@views/Admin/Configuration/EnvTokens";

// Keeps a text node next to each token so the caret has somewhere to sit before and after it. It's removed when the
// value is read and isn't counted as a character.
const ZWSP = "\u200B";

interface Menu {
    node: Text;
    // The offset of the caret in node, the typed '$name' ends there.
    offset: number;
    length: number;
    query: string;
    active: number;
}

const tokenState = (name: string, variables: AdminEnvironmentVariable[]) => {
    const variable = variables.find((v) => v.name === name);

    if (!variable) return variables.length === 0 ? "" : "unknown";
    if (!variable.set) return "unset";

    return variable.used ? "" : "confirm";
};

const createToken = (name: string) => {
    const token = document.createElement("span");

    token.className = "env-token";
    token.contentEditable = "false";
    token.dataset.env = name;
    token.textContent = `$${name}`;

    return token;
};

// A token which the browser emptied or changed while editing around it is no longer a token.
const isToken = (node: Node | null | undefined): node is HTMLElement =>
    node instanceof HTMLElement && !!node.dataset.env && node.textContent === `$${node.dataset.env}`;

const visible = (text: string) => text.replaceAll(ZWSP, "").replaceAll(/[\r\n]/g, " ");

/** Builds the DOM of a value: text nodes and tokens, with an invisible character around each token for the caret. */
const build = (value: string) => {
    const nodes: Node[] = [];
    let last: Node | undefined;

    for (const segment of parseEnvSegments(value)) {
        if (segment.kind === "text") {
            // The text after a token goes in the node which follows it, like the browser does when typing there.
            if (last instanceof Text) {
                last.data += segment.text;
            } else {
                last = document.createTextNode(segment.text);
                nodes.push(last);
            }

            continue;
        }

        if (!last) {
            nodes.push(document.createTextNode(ZWSP));
        }

        nodes.push(createToken(segment.name));
        last = document.createTextNode(ZWSP);
        nodes.push(last);
    }

    return nodes;
};

const serialize = (node: Node): string => {
    let out = "";

    node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            out += visible(child.textContent ?? "");
        } else if (isToken(child)) {
            out += envExpression(child.dataset.env ?? "");
        } else if (child instanceof HTMLElement && child.dataset.env) {
            // A broken token was removed.
        } else if (child.nodeName !== "BR") {
            out += serialize(child);
        }
    });

    return out;
};

// Describes the DOM so it can be compared with the one built for the value.
const signature = (nodes: ArrayLike<Node>) =>
    Array.from(nodes)
        .map((node) =>
            node.nodeType === Node.TEXT_NODE ? `t:${node.textContent}` : isToken(node) ? `e:${node.dataset.env}` : "x",
        )
        .join("|");

const isBlank = (node: Node | null) =>
    !!node && node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").replaceAll(ZWSP, "") === "";

const placeCaret = (node: Node, offset: number) => {
    const selection = globalThis.getSelection();
    const range = document.createRange();

    range.setStart(node, offset);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
};

/** Returns the position of the caret counted in characters of text, with each token counting as one. */
const caretPosition = (root: HTMLElement) => {
    const selection = globalThis.getSelection();
    const anchor = selection?.anchorNode;

    if (!selection?.rangeCount || !anchor || !root.contains(anchor)) return null;

    let position = 0;

    for (const [index, child] of Array.from(root.childNodes).entries()) {
        if (anchor === root && index === selection.anchorOffset) return position;

        if (child === anchor) {
            return position + visible((child.textContent ?? "").slice(0, selection.anchorOffset)).length;
        }

        if (child.contains(anchor)) {
            if (isToken(child)) return position + 1;

            const range = document.createRange();

            range.setStart(child, 0);
            range.setEnd(anchor, selection.anchorOffset);

            return position + visible(range.toString()).length;
        }

        position += isToken(child) ? 1 : visible(child.textContent ?? "").length;
    }

    return position;
};

/** Returns the position right after the token. */
const tokenEnd = (root: HTMLElement, token: Node) => {
    let position = 0;

    for (const child of Array.from(root.childNodes)) {
        position += isToken(child) ? 1 : visible(child.textContent ?? "").length;

        if (child === token) break;
    }

    return position;
};

const contentLength = (nodes: ArrayLike<Node>) =>
    Array.from(nodes).reduce(
        (length, node) => length + (isToken(node) ? 1 : visible(node.textContent ?? "").length),
        0,
    );

/** Puts the caret at a position counted like caretPosition does, after the invisible character next to a token. */
const placeCaretAt = (root: HTMLElement, position: number) => {
    let remaining = position;

    for (const [index, child] of Array.from(root.childNodes).entries()) {
        if (isToken(child)) {
            if (remaining === 0) {
                placeCaret(root, index);

                return;
            }

            remaining -= 1;

            continue;
        }

        const text = child.textContent ?? "";
        let offset = 0;

        for (;;) {
            while (offset < text.length && text[offset] === ZWSP) offset += 1;

            if (remaining === 0 || offset >= text.length) break;

            offset += 1;
            remaining -= 1;
        }

        if (remaining === 0) {
            placeCaret(child, offset);

            return;
        }
    }

    placeCaret(root, root.childNodes.length);
};

/**
 * Rebuilds the DOM when editing left it different from the one built for its value: text the browser wrapped in an
 * element with the style of a token, a token it emptied, or a missing invisible character. The caret keeps its place.
 */
const normalize = (root: HTMLElement) => {
    const value = serialize(root);
    const nodes = build(value);

    if (signature(nodes) !== signature(root.childNodes)) {
        // The change is usually just before the caret, i.e. an expression which becomes a token, so the caret keeps its
        // distance from the end.
        const position = caretPosition(root);
        const before = contentLength(root.childNodes);

        root.replaceChildren(...nodes);

        if (position !== null) {
            placeCaretAt(root, Math.max(0, contentLength(root.childNodes) - (before - position)));
        }
    }

    return value;
};

/** Moves a caret which ended up in or right before the invisible character after a token to after it. */
const fixCaret = (root: HTMLElement) => {
    const selection = globalThis.getSelection();
    const anchor = selection?.anchorNode;

    if (!selection?.isCollapsed || !anchor || !root.contains(anchor)) return;

    const token = anchor === root ? null : anchor.nodeType === Node.TEXT_NODE ? anchor.parentNode : anchor;

    if (isToken(token)) {
        placeCaretAt(root, caretPosition(root) ?? 0);

        return;
    }

    if (anchor.nodeType === Node.TEXT_NODE && isToken(anchor.previousSibling)) {
        const text = anchor.textContent ?? "";

        if (selection.anchorOffset === 0 && text.startsWith(ZWSP)) {
            placeCaret(anchor, 1);
        }
    } else if (anchor === root && isToken(root.childNodes[selection.anchorOffset - 1])) {
        const next = root.childNodes[selection.anchorOffset];

        if (next?.nodeType === Node.TEXT_NODE && next.textContent?.startsWith(ZWSP)) {
            placeCaret(next, 1);
        }
    }
};

/**
 * A single line text input which shows the environment variables a value references as tokens. Typing '$' suggests
 * the variables, a chosen one is written as '{{ env "NAME" }}' and a token is removed as a whole.
 */
const EnvTokenInput = function (props: {
    id?: string;
    value: string;
    variables: AdminEnvironmentVariable[];
    onChange: (_value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    ariaLabel?: string;
    // Called for the keys the input doesn't handle itself while no suggestions are shown.
    onKeyDown?: (_event: KeyboardEvent<HTMLDivElement>) => void;
    onBlur?: () => void;
}) {
    const { t: translate } = useTranslation("admin");
    const { onChange, value, variables } = props;
    const ref = useRef<HTMLDivElement>(null);
    const renderedRef = useRef<null | string>(null);
    const dismissedRef = useRef<{ node: Text; start: number } | null>(null);
    const [menu, setMenu] = useState<Menu | null>(null);
    const listId = useId();

    const items = menu ? filterEnvVariables(variables, menu.query) : [];
    const open = !!menu && items.length !== 0;

    // The DOM is only rebuilt when the value changes from outside, so typing keeps the caret where it is.
    useLayoutEffect(() => {
        if (ref.current && renderedRef.current !== value) {
            ref.current.replaceChildren(...build(value));
            renderedRef.current = value;
        }
    }, [value]);

    // The state of each token depends on the variables, which are loaded once for all inputs.
    useEffect(() => {
        ref.current?.querySelectorAll<HTMLElement>("[data-env]").forEach((token) => {
            const state = tokenState(token.dataset.env ?? "", variables);

            token.className = cx("env-token", state);
            token.title = state
                ? translate(
                      state === "confirm"
                          ? "The configuration doesn't use this environment variable yet, saving it has to be confirmed on the server"
                          : "This environment variable isn't set",
                  )
                : translate("Environment variable");
        });
    });

    const emit = useCallback(() => {
        if (!ref.current) return;

        const next = normalize(ref.current);

        renderedRef.current = next;
        onChange(next);
    }, [onChange]);

    const updateMenu = useCallback(() => {
        const selection = globalThis.getSelection();
        const node = selection?.anchorNode;

        if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !ref.current?.contains(node)) {
            setMenu(null);

            return;
        }

        const offset = selection.anchorOffset;
        const query = envQuery((node.textContent ?? "").slice(0, offset));

        if (!query) {
            dismissedRef.current = null;
            setMenu(null);

            return;
        }

        const start = offset - query.length;

        if (dismissedRef.current?.node === node && dismissedRef.current.start === start) {
            setMenu(null);

            return;
        }

        setMenu((current) => ({
            active: current?.node === node && current.query === query.query ? current.active : 0,
            length: query.length,
            node: node as Text,
            offset,
            query: query.query,
        }));
    }, []);

    // Normalizing also turns a pasted or typed expression into a token.
    const handleInput = () => {
        emit();
        updateMenu();
    };

    const handleCaret = () => {
        if (ref.current) fixCaret(ref.current);

        updateMenu();
    };

    const choose = (name: string) => {
        if (!menu) return;

        const range = document.createRange();
        const after = document.createTextNode(ZWSP);

        range.setStart(menu.node, menu.offset - menu.length);
        range.setEnd(menu.node, menu.offset);
        range.deleteContents();
        range.insertNode(after);
        range.insertNode(createToken(name));

        placeCaret(after, 1);
        setMenu(null);
        emit();
    };

    // Returns the token right before or after the caret, ignoring the invisible characters between them.
    const adjacentToken = (backward: boolean) => {
        const selection = globalThis.getSelection();
        const node = selection?.anchorNode;

        if (!selection?.isCollapsed || !node || !ref.current) return null;

        let sibling: ChildNode | null | undefined;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? "";
            const side = backward ? text.slice(0, selection.anchorOffset) : text.slice(selection.anchorOffset);

            if (side.replaceAll(ZWSP, "") !== "") return null;

            sibling = backward ? node.previousSibling : node.nextSibling;
        } else if (node === ref.current) {
            sibling = ref.current.childNodes[backward ? selection.anchorOffset - 1 : selection.anchorOffset];
        }

        while (sibling && isBlank(sibling)) {
            sibling = backward ? sibling.previousSibling : sibling.nextSibling;
        }

        return isToken(sibling) ? sibling : null;
    };

    const removeToken = (token: HTMLElement) => {
        const root = ref.current;

        if (!root) return;

        const previous = token.previousSibling;
        const next = token.nextSibling;

        token.remove();

        if (isBlank(next)) next?.remove();

        if (previous?.nodeType === Node.TEXT_NODE) {
            placeCaret(previous, previous.textContent?.length ?? 0);
        } else {
            placeCaret(root, previous ? Array.from(root.childNodes).indexOf(previous as ChildNode) + 1 : 0);
        }

        emit();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (open && menu) {
            switch (e.key) {
                case "ArrowDown":
                case "ArrowUp": {
                    e.preventDefault();

                    const step = e.key === "ArrowDown" ? 1 : -1;

                    setMenu({ ...menu, active: (menu.active + step + items.length) % items.length });

                    return;
                }
                // Tab keeps moving the focus, so leaving a field which ends with '$' doesn't insert a variable.
                case "Enter":
                    e.preventDefault();
                    choose(items[Math.min(menu.active, items.length - 1)].name);

                    return;
                case "Escape":
                    e.preventDefault();
                    dismissedRef.current = { node: menu.node, start: menu.offset - menu.length };
                    setMenu(null);

                    return;
            }
        }

        if (e.key === "Backspace" || e.key === "Delete") {
            const token = adjacentToken(e.key === "Backspace");

            if (token) {
                e.preventDefault();
                removeToken(token);

                return;
            }
        }

        if (e.key === "Enter") {
            e.preventDefault();
        }

        props.onKeyDown?.(e);
    };

    const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();

        const text = e.clipboardData.getData("text/plain").replaceAll(/[\r\n]+/g, " ");

        // insertText keeps the undo history, it's deprecated but there's no replacement for editable elements yet.
        if (!document.execCommand?.("insertText", false, text)) {
            const selection = globalThis.getSelection();
            const range = selection?.rangeCount ? selection.getRangeAt(0) : null;

            if (range) {
                const node = document.createTextNode(text);

                range.deleteContents();
                range.insertNode(node);
                placeCaret(node, text.length);
            }

            handleInput();
        }
    };

    const active = open && menu ? items[Math.min(menu.active, items.length - 1)] : undefined;
    const confirmations = items.some((item) => !item.used);

    return (
        <div className="env-input-wrap">
            <div
                ref={ref}
                id={props.id}
                role="textbox"
                aria-label={props.ariaLabel ?? props.placeholder}
                aria-disabled={props.disabled || undefined}
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={active ? `${listId}-${active.name}` : undefined}
                contentEditable={!props.disabled}
                suppressContentEditableWarning
                spellCheck={false}
                data-placeholder={props.placeholder}
                className={cx("env-input", value === "" && "is-empty", props.disabled && "disabled", props.className)}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={(e) => {
                    if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") handleCaret();
                }}
                onMouseDown={(e) => {
                    // Clicking a token puts the caret after it instead of selecting it.
                    const token = (e.target as HTMLElement).closest?.("[data-env]");

                    if (token && ref.current?.contains(token) && !props.disabled) {
                        e.preventDefault();
                        ref.current.focus();
                        placeCaretAt(ref.current, tokenEnd(ref.current, token));
                        updateMenu();
                    }
                }}
                onClick={handleCaret}
                onPaste={handlePaste}
                onDrop={(e) => e.preventDefault()}
                onBlur={() => {
                    setMenu(null);
                    props.onBlur?.();
                }}
            />
            {open && menu ? (
                <div className="env-menu" role="listbox" id={listId} aria-label={translate("Environment variables")}>
                    {items.map((item, index) => (
                        <div
                            key={item.name}
                            id={`${listId}-${item.name}`}
                            role="option"
                            aria-selected={index === menu.active}
                            className={cx("env-option", index === menu.active && "active")}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                choose(item.name);
                            }}
                        >
                            <span className="env-option-name">${item.name}</span>
                            {!item.set ? <span className="env-option-note">{translate("not set")}</span> : null}
                            {!item.used ? (
                                <span className="env-option-note confirm">{translate("needs confirmation")}</span>
                            ) : null}
                        </div>
                    ))}
                    {confirmations ? (
                        <p className="env-menu-note">
                            {translate(
                                "Variables the configuration doesn't use yet are saved once the change is confirmed on the server.",
                            )}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export default EnvTokenInput;
