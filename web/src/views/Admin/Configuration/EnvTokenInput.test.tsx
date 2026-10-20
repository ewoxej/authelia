// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";

import { AdminEnvironmentVariable } from "@services/Admin";
import EnvTokenInput from "@views/Admin/Configuration/EnvTokenInput";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const variables: AdminEnvironmentVariable[] = [
    { name: "DOMAIN", set: true, used: true },
    { name: "DOCKER_HOST", set: true, used: false },
    { name: "MISSING", set: false, used: true },
    { name: "OTHER", set: true, used: true },
];

const placeCaret = (node: Node, offset: number) => {
    const range = document.createRange();

    range.setStart(node, offset);
    range.collapse(true);
    globalThis.getSelection()?.removeAllRanges();
    globalThis.getSelection()?.addRange(range);
};

const renderInput = (value: string, onChange = vi.fn()) => {
    render(<EnvTokenInput value={value} variables={variables} onChange={onChange} ariaLabel="Domain" />);

    return { input: screen.getByRole("textbox", { name: "Domain" }), onChange };
};

// Types text at the end of the input the way the browser would, then reports the input.
const typeAtEnd = (input: HTMLElement, text: string) => {
    const node = document.createTextNode(text);

    input.append(node);
    placeCaret(node, text.length);
    fireEvent.input(input);
};

describe("EnvTokenInput", () => {
    it("shows the environment variables as tokens", () => {
        const { input } = renderInput('https://idm.{{ env "DOMAIN" }}/x');

        const token = input.querySelector<HTMLElement>("[data-env]");

        expect(token?.textContent).toBe("$DOMAIN");
        expect(token?.contentEditable).toBe("false");
        expect(input.textContent?.replaceAll("​", "")).toBe("https://idm.$DOMAIN/x");
    });

    it("marks the variables which need a confirmation or aren't set", () => {
        const { input } = renderInput(
            '{{ env "DOCKER_HOST" }}{{ env "MISSING" }}{{ env "UNKNOWN" }}{{ env "DOMAIN" }}',
        );

        const classes = Array.from(input.querySelectorAll<HTMLElement>("[data-env]")).map((t) => t.className);

        expect(classes).toEqual(["env-token confirm", "env-token unset", "env-token unknown", "env-token"]);
    });

    it("suggests the variables after a dollar sign and inserts the chosen one", () => {
        const { input, onChange } = renderInput("");

        typeAtEnd(input, "https://idm.$DO");

        const options = screen.getAllByRole("option");

        expect(options.map((o) => o.textContent)).toEqual(["$DOMAIN", "$DOCKER_HOSTneeds confirmation"]);
        expect(screen.getByText(/saved once the change is confirmed on the server/)).toBeInTheDocument();

        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onChange).toHaveBeenLastCalledWith('https://idm.{{ env "DOCKER_HOST" }}');
        expect(input.querySelector<HTMLElement>("[data-env]")?.dataset.env).toBe("DOCKER_HOST");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("inserts a variable chosen with the mouse", () => {
        const { input, onChange } = renderInput("");

        typeAtEnd(input, "$OT");
        fireEvent.mouseDown(screen.getByRole("option", { name: /OTHER/ }));

        expect(onChange).toHaveBeenLastCalledWith('{{ env "OTHER" }}');
    });

    it("closes the suggestions with escape and keeps the text", () => {
        const { input, onChange } = renderInput("");

        typeAtEnd(input, "price $DO");
        expect(screen.getByRole("listbox")).toBeInTheDocument();

        fireEvent.keyDown(input, { key: "Escape" });

        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(onChange).toHaveBeenLastCalledWith("price $DO");
    });

    it("doesn't suggest anything when no variable matches", () => {
        const { input } = renderInput("");

        typeAtEnd(input, "^/api/.*$");

        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("removes a token as a whole with backspace", () => {
        const { input, onChange } = renderInput('a{{ env "DOMAIN" }}');

        // The caret is after the invisible character which follows the token.
        const after = input.lastChild as Text;

        placeCaret(after, after.length);
        fireEvent.keyDown(input, { key: "Backspace" });

        expect(onChange).toHaveBeenLastCalledWith("a");
        expect(input.querySelector("[data-env]")).toBeNull();
    });

    it("removes a token as a whole with delete", () => {
        const { input, onChange } = renderInput('a{{ env "DOMAIN" }}b');

        placeCaret(input.firstChild as Text, 1);
        fireEvent.keyDown(input, { key: "Delete" });

        expect(onChange).toHaveBeenLastCalledWith("ab");
    });

    it("removes a lone token with backspace when the caret is at the end", () => {
        const { input, onChange } = renderInput('{{ env "DOMAIN" }}');

        input.focus();
        placeCaret(input, input.childNodes.length);
        fireEvent.keyDown(input, { key: "Backspace" });

        expect(onChange).toHaveBeenLastCalledWith("");
        expect(input.querySelector("[data-env]")).toBeNull();
    });

    it("keeps an invisible character before and after a token for the caret", () => {
        const { input } = renderInput('{{ env "DOMAIN" }}');

        expect(Array.from(input.childNodes).map((node) => node.nodeName)).toEqual(["#text", "SPAN", "#text"]);
        expect(input.firstChild?.textContent).toBe("\u200B");
        expect(input.lastChild?.textContent).toBe("\u200B");
    });

    it("puts the caret after a token which is clicked", () => {
        const { input } = renderInput('{{ env "DOMAIN" }}');

        fireEvent.mouseDown(input.querySelector("[data-env]") as HTMLElement);

        const selection = globalThis.getSelection();

        expect(selection?.anchorNode).toBe(input.lastChild);
        expect(selection?.anchorOffset).toBe(1);
    });

    it("moves a caret inside the invisible character after a token to after it", () => {
        const { input } = renderInput('{{ env "DOMAIN" }}');

        placeCaret(input.lastChild as Text, 0);
        fireEvent.click(input);

        expect(globalThis.getSelection()?.anchorOffset).toBe(1);
    });

    it("unwraps text the browser put in an element with the style of a token", () => {
        const { input, onChange } = renderInput('{{ env "DOMAIN" }}');

        const junk = document.createElement("span");

        junk.className = "env-token";
        junk.textContent = "abc";
        input.append(junk);
        placeCaret(junk.firstChild as Text, 3);
        fireEvent.input(input);

        expect(onChange).toHaveBeenLastCalledWith('{{ env "DOMAIN" }}abc');
        expect(input.querySelectorAll("span")).toHaveLength(1);
        expect(input.lastChild?.textContent).toBe("\u200Babc");
        expect(globalThis.getSelection()?.anchorOffset).toBe(4);
    });

    it("drops a token the browser emptied", () => {
        const { input, onChange } = renderInput('a{{ env "DOMAIN" }}b');

        (input.querySelector("[data-env]") as HTMLElement).textContent = "";
        fireEvent.input(input);

        expect(onChange).toHaveBeenLastCalledWith("ab");
        expect(input.querySelector("span")).toBeNull();
    });

    it("leaves backspace to the browser inside text", () => {
        const { input, onChange } = renderInput('{{ env "DOMAIN" }}ab');

        const text = input.lastChild as Text;

        placeCaret(text, text.length);
        fireEvent.keyDown(input, { key: "Backspace" });

        expect(onChange).not.toHaveBeenCalled();
        expect(input.querySelector("[data-env]")).not.toBeNull();
    });

    it("turns a typed expression into a token", () => {
        const { input, onChange } = renderInput("");

        typeAtEnd(input, 'x {{ env "DOMAIN" }}');

        expect(onChange).toHaveBeenLastCalledWith('x {{ env "DOMAIN" }}');
        expect(input.querySelector<HTMLElement>("[data-env]")?.dataset.env).toBe("DOMAIN");
    });

    it("passes enter to the parent when no suggestions are shown", () => {
        const onKeyDown = vi.fn();

        render(
            <EnvTokenInput
                value="x"
                variables={variables}
                onChange={vi.fn()}
                onKeyDown={onKeyDown}
                ariaLabel="Draft"
            />,
        );

        fireEvent.keyDown(screen.getByRole("textbox", { name: "Draft" }), { key: "Enter" });

        expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));
    });

    it("shows the new value when it changes from outside", () => {
        const { rerender } = render(
            <EnvTokenInput value="a" variables={variables} onChange={vi.fn()} ariaLabel="Domain" />,
        );

        rerender(
            <EnvTokenInput value='{{ env "OTHER" }}' variables={variables} onChange={vi.fn()} ariaLabel="Domain" />,
        );

        expect(screen.getByRole("textbox").querySelector<HTMLElement>("[data-env]")?.dataset.env).toBe("OTHER");
    });

    it("can't be edited when disabled", () => {
        render(<EnvTokenInput value="a" variables={variables} onChange={vi.fn()} ariaLabel="Domain" disabled />);

        expect(screen.getByRole("textbox").getAttribute("contenteditable")).toBe("false");
    });
});
