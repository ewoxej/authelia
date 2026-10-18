// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { FileText, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";

import { useNotifications } from "@contexts/NotificationsContext";
import {
    AdminSaveResult,
    AdminValidationResult,
    getAdminConfigurationFile,
    getAdminConfigurationSection,
    getAdminConfigurationSectionsText,
    postAdminRestart,
    saveAdminConfigurationFile,
    saveAdminConfigurationSections,
    saveAdminConfigurationSectionsText,
    validateAdminConfiguration,
} from "@services/Admin";
import { useAdmin, useAdminErrorHandler } from "@views/Admin/Common/AdminContext";
import ConfirmDialog from "@views/Admin/Common/ConfirmDialog";
import { compact } from "@views/Admin/Common/Fields";
import { formatDateTime } from "@views/Admin/Common/Format";
import { waitForRestart } from "@views/Admin/Common/Restart";
import { Badge, Btn, Card, Dot, Note, PageHeader, Seg, Spinner, cx } from "@views/Admin/Common/ui";
import { SectionDef, SectionForm, Value, countChanges } from "@views/Admin/Configuration/FormEngine";
import SaveDialog, { PendingSave, ValidationResult } from "@views/Admin/Configuration/SaveDialog";
import { sections, wholeFileSection } from "@views/Admin/Configuration/Sections";
import YamlEditor from "@views/Admin/Configuration/YamlEditor";

type Mode = "forms" | "yaml";

const ConfigurationView = function () {
    const { t: translate } = useTranslation("admin");
    const { overview } = useAdmin();
    const handleError = useAdminErrorHandler();
    const { createInfoNotification, createSuccessNotification } = useNotifications();
    const params = useParams();
    const [searchParams, setSearchParams] = useSearchParams();

    const files = useMemo(() => overview.configuration_files ?? [], [overview.configuration_files]);

    const [path, setPath] = useState(files[0]?.path ?? "");
    const [pending, setPending] = useState<null | PendingSave>(null);
    const [restartPending, setRestartPending] = useState(false);
    const [restartOpen, setRestartOpen] = useState(false);
    // Incremented after each save so the editors reload the file.
    const [revision, setRevision] = useState(0);

    const sectionId = params.section ?? sections[0].id;
    const wholeFile = sectionId === wholeFileSection.id;
    const section = sections.find((s) => s.id === sectionId) ?? sections[0];
    const mode: Mode = wholeFile || searchParams.get("mode") === "yaml" ? "yaml" : "forms";
    const file = files.find((f) => f.path === path);

    const setMode = (next: Mode) => {
        const nextParams = new URLSearchParams(searchParams);

        if (next === "yaml") {
            nextParams.set("mode", "yaml");
        } else {
            nextParams.delete("mode");
        }

        setSearchParams(nextParams);
    };

    /** Opens the review dialog for the proposed content of the whole file. */
    const review = useCallback(
        async (after: string, validation: AdminValidationResult, save: () => Promise<boolean>) => {
            const { content: before } = await getAdminConfigurationFile(path);

            setPending({ after, before, save, validation });
        },
        [path],
    );

    const onSaved = useCallback(() => {
        setRevision((r) => r + 1);
        setRestartPending(true);
        createSuccessNotification(translate("The configuration was saved"));
    }, [createSuccessNotification, translate]);

    const handleRestart = async () => {
        try {
            await postAdminRestart();
            setRestartOpen(false);
            createInfoNotification(translate("Authelia is restarting"));

            if (await waitForRestart()) {
                createSuccessNotification(translate("Authelia has restarted"));
                globalThis.location.reload();
            }
        } catch (err) {
            handleError(err, "Failed to restart Authelia");
        }
    };

    if (files.length === 0) {
        return <Note tone="warn">{translate("No configuration files were loaded.")}</Note>;
    }

    const panelProps = { onSaved, path, review };
    const editorKey = `${path}-${revision}-${sectionId}-${mode}`;

    return (
        <section className="wrap narrow">
            <SaveDialog pending={pending} onClose={() => setPending(null)} />
            <ConfirmDialog
                open={restartOpen}
                title="Restart Authelia"
                description={translate("Authelia will be restarted to apply the saved configuration.")}
                confirmLabel="Restart"
                destructive
                onConfirm={handleRestart}
                onClose={() => setRestartOpen(false)}
            />

            <PageHeader
                micro={translate("Configuration")}
                title={
                    <span className="title-row">{translate(wholeFile ? wholeFileSection.title : section.title)}</span>
                }
                description={
                    wholeFile
                        ? translate("The complete configuration file, including keys which don't belong to a section.")
                        : translate(section.description)
                }
                actions={
                    wholeFile ? undefined : (
                        <Seg
                            label={translate("Editor mode")}
                            value={mode}
                            options={[
                                { label: translate("Forms"), value: "forms" },
                                { label: "YAML", value: "yaml" },
                            ]}
                            onChange={setMode}
                        />
                    )
                }
            />

            {wholeFile ? (
                <div className="fileline">
                    <span style={{ alignItems: "center", display: "inline-flex", gap: 7 }}>
                        <FileText size={14} strokeWidth={1.75} aria-hidden />
                        {files.length > 1 ? (
                            <select
                                className="mono tx2"
                                style={{ background: "transparent", border: 0, color: "inherit", fontSize: 12 }}
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                            >
                                {files.map((f) => (
                                    <option key={f.path} value={f.path}>
                                        {f.path}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <span className="mono tx2">{path}</span>
                        )}
                    </span>
                    {file ? (
                        <>
                            <span>·</span>
                            <span>
                                {translate("modified")} <span className="mono">{formatDateTime(file.modified)}</span>
                            </span>
                        </>
                    ) : null}
                    {file && !file.writable ? <Badge tone="alert">{translate("read-only")}</Badge> : null}
                </div>
            ) : file && !file.writable ? (
                <div className="fileline">
                    <Badge tone="alert">{translate("read-only")}</Badge>
                </div>
            ) : null}

            {restartPending ? (
                <Note tone="warn">
                    <span style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12 }}>
                        <span style={{ flex: 1 }}>
                            {translate("The configuration was saved. Restart Authelia to apply the changes.")}
                        </span>
                        {overview.restart_enabled ? (
                            <Btn size="sm" variant="danger" onClick={() => setRestartOpen(true)}>
                                <RotateCw size={14} strokeWidth={1.75} aria-hidden />
                                {translate("Restart now")}
                            </Btn>
                        ) : null}
                    </span>
                </Note>
            ) : null}

            {files.length > 1 ? (
                <Note tone="info">
                    {translate(
                        "Several configuration files are loaded and merged. The forms show and change the values of the selected file only.",
                    )}
                </Note>
            ) : null}

            {wholeFile ? <FileYamlEditor key={editorKey} {...panelProps} /> : null}
            {!wholeFile && mode === "forms" ? (
                <SectionEditor key={editorKey} section={section} {...panelProps} />
            ) : null}
            {!wholeFile && mode === "yaml" ? (
                <SectionYamlEditor key={editorKey} section={section} {...panelProps} />
            ) : null}
        </section>
    );
};

interface PanelProps {
    path: string;
    review: (_after: string, _validation: AdminValidationResult, _save: () => Promise<boolean>) => Promise<void>;
    onSaved: () => void;
}

/** Validates a change, opens the review dialog and saves the change when it's confirmed. */
function useReviewAndSave(props: PanelProps) {
    const handleError = useAdminErrorHandler();
    const [busy, setBusy] = useState(false);

    const reviewAndSave = async (
        validate: () => Promise<AdminSaveResult>,
        save: () => Promise<AdminSaveResult>,
        onValidated?: (_validation: AdminValidationResult) => void,
    ) => {
        setBusy(true);

        try {
            const result = await validate();

            onValidated?.(result.validation);

            await props.review(result.content ?? "", result.validation, async () => {
                try {
                    const saved = await save();

                    onValidated?.(saved.validation);

                    if (saved.saved) {
                        props.onSaved();

                        return true;
                    }

                    handleError(new Error(saved.validation.errors.join("; ")), "The configuration is invalid");
                } catch (err) {
                    handleError(err, "Failed to save the configuration");
                }

                return false;
            });
        } catch (err) {
            handleError(err, "Failed to validate the configuration");
        } finally {
            setBusy(false);
        }
    };

    return { busy, reviewAndSave };
}

const SaveBar = function (props: {
    changes: number;
    busy: boolean;
    hint?: string;
    extra?: ReactNode;
    onReset: () => void;
    onSave: () => void;
}) {
    const { t: translate } = useTranslation("admin");
    const dirty = props.changes > 0;

    return (
        <div className={cx("savebar", dirty && "dirty")}>
            <span className="status tx2">
                {dirty ? (
                    <Badge tone="planned">{translate("{{count}} unsaved changes", { count: props.changes })}</Badge>
                ) : (
                    <>
                        <Dot color="var(--a-accent)" />
                        {translate("No changes")}
                    </>
                )}
            </span>
            <span className="hint">{translate(props.hint ?? "Empty fields use the default value.")}</span>
            {props.extra}
            <Btn disabled={!dirty || props.busy} onClick={props.onReset}>
                {translate("Reset")}
            </Btn>
            <Btn id="admin-config-save" variant="primary" disabled={!dirty || props.busy} onClick={props.onSave}>
                {translate("Review & save")}
            </Btn>
        </div>
    );
};

const SectionEditor = function (props: PanelProps & { section: SectionDef }) {
    const handleError = useAdminErrorHandler();
    const { busy, reviewAndSave } = useReviewAndSave(props);
    const { path, section } = props;

    const [initial, setInitial] = useState<Value>();
    const [value, setValue] = useState<Value>();

    useEffect(() => {
        let cancelled = false;

        Promise.all(section.keys.map((key) => getAdminConfigurationSection(path, key)))
            .then((results) => {
                if (cancelled) return;

                const loaded: Value = {};

                section.keys.forEach((key, i) => {
                    if (results[i].value !== null && results[i].value !== undefined) {
                        loaded[key] = results[i].value;
                    }
                });

                setInitial(loaded);
                setValue(loaded);
            })
            .catch((err) => handleError(err, "Failed to load the configuration"));

        return () => {
            cancelled = true;
        };
    }, [path, section, handleError]);

    const changes = useMemo(() => countChanges(initial, value), [initial, value]);

    if (!value || !initial) {
        return <Spinner />;
    }

    const handleSave = async () => {
        const values: Record<string, unknown> = {};

        for (const key of section.keys) {
            const compacted = compact(value[key]);

            values[key] =
                compacted === undefined ||
                (compacted !== null && typeof compacted === "object" && Object.keys(compacted).length === 0)
                    ? null
                    : compacted;
        }

        await reviewAndSave(
            () => saveAdminConfigurationSections(path, values, true),
            () => saveAdminConfigurationSections(path, values),
        );
    };

    return (
        <>
            <SectionForm section={section} value={value} initial={initial} onChange={setValue} />
            <SaveBar changes={changes} busy={busy} onReset={() => setValue(initial)} onSave={handleSave} />
        </>
    );
};

const changedLines = (a: string, b: string) => {
    const left = a.split("\n");
    const right = b.split("\n");

    let count = Math.abs(left.length - right.length);

    for (let i = 0; i < Math.min(left.length, right.length); i++) {
        if (left[i] !== right[i]) count++;
    }

    return count;
};

/** Edits the YAML text of the keys of one section exactly as it's written in the file. */
const SectionYamlEditor = function (props: PanelProps & { section: SectionDef }) {
    const { t: translate } = useTranslation("admin");
    const handleError = useAdminErrorHandler();
    const { busy, reviewAndSave } = useReviewAndSave(props);
    const { path, section } = props;

    const [initial, setInitial] = useState<string>();
    const [content, setContent] = useState("");
    const [validation, setValidation] = useState<AdminValidationResult>();

    useEffect(() => {
        let cancelled = false;

        getAdminConfigurationSectionsText(path, section.keys)
            .then((result) => {
                if (cancelled) return;

                setInitial(result.content);
                setContent(result.content);
            })
            .catch((err) => handleError(err, "Failed to load the configuration"));

        return () => {
            cancelled = true;
        };
    }, [path, section, handleError]);

    if (initial === undefined) {
        return <Spinner />;
    }

    const validate = () => saveAdminConfigurationSectionsText(path, section.keys, content, true);

    return (
        <YamlPanel
            content={content}
            initial={initial}
            busy={busy}
            validation={validation}
            placeholder={translate("This section isn't set in the file, the default values are used.")}
            onChange={(next) => {
                setContent(next);
                setValidation(undefined);
            }}
            onReset={() => {
                setContent(initial);
                setValidation(undefined);
            }}
            onValidate={async () => {
                try {
                    setValidation((await validate()).validation);
                } catch (err) {
                    handleError(err, "Failed to validate the configuration");
                }
            }}
            onSave={() =>
                reviewAndSave(
                    validate,
                    () => saveAdminConfigurationSectionsText(path, section.keys, content),
                    setValidation,
                )
            }
        />
    );
};

/** Edits the YAML text of the whole configuration file. */
const FileYamlEditor = function (props: PanelProps) {
    const handleError = useAdminErrorHandler();
    const { busy, reviewAndSave } = useReviewAndSave(props);
    const { path } = props;

    const [initial, setInitial] = useState<string>();
    const [content, setContent] = useState("");
    const [validation, setValidation] = useState<AdminValidationResult>();

    useEffect(() => {
        getAdminConfigurationFile(path)
            .then((file) => {
                setInitial(file.content);
                setContent(file.content);
            })
            .catch((err) => handleError(err, "Failed to load the configuration"));
    }, [path, handleError]);

    if (initial === undefined) {
        return <Spinner />;
    }

    const validate = async (): Promise<AdminSaveResult> => ({
        content,
        saved: false,
        validation: await validateAdminConfiguration(path, content),
    });

    return (
        <YamlPanel
            content={content}
            initial={initial}
            busy={busy}
            validation={validation}
            minHeight="60vh"
            onChange={(next) => {
                setContent(next);
                setValidation(undefined);
            }}
            onReset={() => {
                setContent(initial);
                setValidation(undefined);
            }}
            onValidate={async () => {
                try {
                    setValidation((await validate()).validation);
                } catch (err) {
                    handleError(err, "Failed to validate the configuration");
                }
            }}
            onSave={() => reviewAndSave(validate, () => saveAdminConfigurationFile(path, content), setValidation)}
        />
    );
};

const YamlPanel = function (props: {
    content: string;
    initial: string;
    busy: boolean;
    validation?: AdminValidationResult;
    placeholder?: string;
    minHeight?: string;
    onChange: (_content: string) => void;
    onReset: () => void;
    onValidate: () => Promise<void>;
    onSave: () => Promise<void>;
}) {
    const { t: translate } = useTranslation("admin");

    return (
        <>
            <Card flush>
                <YamlEditor
                    value={props.content}
                    placeholder={props.placeholder}
                    minHeight={props.minHeight}
                    onChange={props.onChange}
                />
            </Card>
            {props.validation ? (
                <Card>
                    <ValidationResult validation={props.validation} />
                </Card>
            ) : null}
            <SaveBar
                changes={changedLines(props.initial, props.content)}
                busy={props.busy}
                hint="The text is saved exactly as written, template expressions and comments included."
                extra={
                    <Btn disabled={props.busy} onClick={props.onValidate}>
                        {translate("Validate")}
                    </Btn>
                }
                onReset={props.onReset}
                onSave={props.onSave}
            />
        </>
    );
};

export default ConfigurationView;
