// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";

import { ArrowUp, File, Folder, FolderPlus, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@components/UI/Dialog";
import { AdminFileListing, createAdminDirectory, createAdminSecretFile, getAdminFiles } from "@services/Admin";
import { fromRoot, useFileRoots } from "@views/Admin/Common/FileRoots";
import { Btn, IconBtn, Spinner, cx } from "@views/Admin/Common/ui";

/** What can be picked: an existing file, a directory, or a name for a file which doesn't exist yet. */
export type FileBrowserMode = "directory" | "file" | "new-file";

interface Props {
    open: boolean;
    mode: FileBrowserMode;
    title: string;
    // The current value, the dialog opens in its directory when it can.
    value?: string;
    // Offers to create a new file holding a generated secret, with this name suggested. Only for picking a file.
    generateSecret?: string;
    onSelect: (_path: string) => void;
    onClose: () => void;
}

const join = (directory: string, name: string) => (directory.endsWith("/") ? directory + name : `${directory}/${name}`);

const parentOf = (path: string) => {
    const index = path.lastIndexOf("/");

    return index > 0 ? path.slice(0, index) : "";
};

const formatSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;

    return `${(size / 1024 / 1024).toFixed(1)} MiB`;
};

/** Browses the directories the administration allows on the server and returns the path of the picked item. */
const FileBrowserDialog = function (props: Props) {
    return (
        <Dialog open={props.open} onOpenChange={(next) => !next && props.onClose()}>
            <DialogContent className="adm dialog files">
                <Browser {...props} />
            </DialogContent>
        </Dialog>
    );
};

// Mounted while the dialog is open, so every opening starts from the current value.
const Browser = function (props: Props) {
    const { t: translate } = useTranslation("admin");
    const { mode, onClose, onSelect, value } = props;
    const roots = useFileRoots();

    const start = value?.startsWith("/") && !value.includes("{{") ? parentOf(value) : "";

    const [listing, setListing] = useState<AdminFileListing>();
    const [error, setError] = useState<string>();
    const [picked, setPicked] = useState<string>();
    const [name, setName] = useState(() =>
        mode === "new-file" && value?.startsWith("/") ? (value.split("/").pop() ?? "") : "",
    );

    const [creating, setCreating] = useState<"folder" | "secret">();
    const [newName, setNewName] = useState("");
    const [busy, setBusy] = useState(false);
    const [createError, setCreateError] = useState<string>();

    const load = useCallback(async (path: string, fallback = true) => {
        setError(undefined);
        setPicked(undefined);

        try {
            const result = await getAdminFiles(path);

            // A single allowed directory is opened right away.
            if (path === "" && result.entries.length === 1 && result.entries[0].directory) {
                return load(result.entries[0].name, false);
            }

            setListing(result);
        } catch (err) {
            if (path !== "" && fallback) {
                return load("", false);
            }

            setError(err instanceof Error ? err.message : String(err));
        }
    }, []);

    useEffect(() => {
        load(start).catch(console.error);
    }, [load, start]);

    const atRoots = listing?.path === "";
    const directory = listing?.path ?? "";

    const startCreating = (kind: "folder" | "secret") => {
        setCreating(kind);
        setNewName(kind === "secret" ? (props.generateSecret ?? "") : "");
        setCreateError(undefined);
    };

    const nameInvalid = newName.trim() === "" || newName.includes("/") || newName === "." || newName === "..";

    const handleCreate = async () => {
        if (nameInvalid || !directory) {
            return;
        }

        setBusy(true);
        setCreateError(undefined);

        try {
            const path = join(directory, newName.trim());

            if (creating === "folder") {
                const created = await createAdminDirectory(path);

                setCreating(undefined);
                await load(created.path, false);
            } else {
                const created = await createAdminSecretFile(path);

                onSelect(created.path);
            }
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const result =
        mode === "directory"
            ? directory
            : mode === "file"
              ? picked
              : directory && name.trim() !== ""
                ? join(directory, name.trim())
                : undefined;

    return (
        <>
            <DialogHeader>
                <DialogTitle>{translate(props.title)}</DialogTitle>
            </DialogHeader>

            <div className="files-bar">
                <IconBtn
                    aria-label={translate("Up")}
                    disabled={!listing || listing.parent === null}
                    onClick={() => load(listing?.parent ?? "").catch(console.error)}
                >
                    <ArrowUp size={16} strokeWidth={1.75} aria-hidden />
                </IconBtn>
                <span className="mono files-path" title={fromRoot(directory, roots)}>
                    {atRoots ? translate("Allowed directories") : fromRoot(directory, roots)}
                </span>
                <Btn size="sm" disabled={!listing || atRoots} onClick={() => startCreating("folder")}>
                    <FolderPlus size={14} strokeWidth={1.75} aria-hidden />
                    {translate("New folder")}
                </Btn>
            </div>

            <div className="files-list" role="listbox" aria-label={translate("Files")}>
                {error ? <div className="files-empty err">{error}</div> : null}
                {!listing && !error ? <Spinner /> : null}
                {listing && listing.entries.length === 0 ? (
                    <div className="files-empty">{translate("This directory is empty.")}</div>
                ) : null}
                {listing?.entries.map((entry) => {
                    const full = atRoots ? entry.name : join(directory, entry.name);
                    const selectable = mode === "file" && !entry.directory;

                    return (
                        <button
                            key={entry.name}
                            type="button"
                            role="option"
                            aria-selected={picked === full}
                            className={cx("files-row", picked === full && "on")}
                            disabled={!entry.directory && mode !== "file"}
                            onClick={() => (entry.directory ? load(full) : setPicked(full))}
                            onDoubleClick={() => selectable && onSelect(full)}
                        >
                            {entry.directory ? (
                                <Folder size={15} strokeWidth={1.75} aria-hidden />
                            ) : (
                                <File size={15} strokeWidth={1.75} aria-hidden />
                            )}
                            <span className="mono files-name">{entry.name}</span>
                            {entry.directory ? null : <span className="tx3 files-size">{formatSize(entry.size)}</span>}
                        </button>
                    );
                })}
                {listing?.truncated ? (
                    <div className="files-empty">{translate("Only the first entries are shown.")}</div>
                ) : null}
            </div>

            {mode === "new-file" ? (
                <div className="fld">
                    <div className="fld-head">
                        <label className="fld-label" htmlFor="files-name">
                            {translate("File name")}
                        </label>
                    </div>
                    <input
                        id="files-name"
                        className="inp mono"
                        value={name}
                        disabled={atRoots}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
            ) : null}

            {creating ? (
                <div className="fld">
                    <div className="fld-head">
                        <label className="fld-label" htmlFor="files-new">
                            {translate(creating === "folder" ? "Folder name" : "Secret file name")}
                        </label>
                    </div>
                    <div className="field-with-button">
                        <input
                            id="files-new"
                            className={cx("inp mono", createError && "bad")}
                            value={newName}
                            autoComplete="off"
                            spellCheck={false}
                            autoFocus
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate().catch(console.error)}
                        />
                        <Btn variant="primary" disabled={nameInvalid || busy} onClick={() => handleCreate()}>
                            {translate(creating === "folder" ? "Create folder" : "Generate")}
                        </Btn>
                        <Btn onClick={() => setCreating(undefined)}>{translate("Cancel")}</Btn>
                    </div>
                    {createError ? <span className="help err">{createError}</span> : null}
                    {creating === "secret" ? (
                        <span className="help">
                            {translate(
                                "A random secret is generated and written to a new file which only the user running Authelia can read. It is not shown.",
                            )}
                        </span>
                    ) : null}
                </div>
            ) : null}

            <DialogFooter>
                {mode === "file" && props.generateSecret !== undefined ? (
                    <Btn
                        disabled={!listing || atRoots}
                        style={{ marginRight: "auto" }}
                        onClick={() => startCreating("secret")}
                    >
                        <KeyRound size={14} strokeWidth={1.75} aria-hidden />
                        {translate("Generate secret")}
                    </Btn>
                ) : null}
                <Btn onClick={onClose}>{translate("Cancel")}</Btn>
                <Btn
                    variant="primary"
                    disabled={!result || (mode === "directory" && atRoots)}
                    onClick={() => result && onSelect(result)}
                >
                    {translate(mode === "directory" ? "Select this directory" : "Select")}
                </Btn>
            </DialogFooter>
        </>
    );
};

export default FileBrowserDialog;
