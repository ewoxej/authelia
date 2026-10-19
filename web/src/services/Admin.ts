// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import axios, { AxiosResponse } from "axios";

import { getBasePath } from "@utils/BasePath";

const basePath = getBasePath();

export const AdminPath = basePath + "/api/admin";

export class AdminRequestError extends Error {
    readonly status: number;
    readonly elevation: boolean;
    readonly secondFactor: boolean;

    constructor(message: string, status: number, elevation = false, secondFactor = false) {
        super(message);
        this.name = "AdminRequestError";
        this.status = status;
        this.elevation = elevation;
        this.secondFactor = secondFactor;
    }
}

export interface AdminConfigurationFile {
    path: string;
    size: number;
    modified: string;
    writable: boolean;
}

export interface AdminSession {
    // Whether the second factor was confirmed recently enough to use the administration API.
    confirmed: boolean;
    // Unix time the confirmation stops granting access.
    expires: number;
    // Whether the session has a knowledge factor (password), otherwise the password confirms the session.
    factor_knowledge: boolean;
}

export interface AdminOverview {
    version: string;
    fork_version: string;
    admin_group: string;
    authentication_backend: "" | "file" | "ldap";
    users_manageable: boolean;
    storage_supported: boolean;
    restart_enabled: boolean;
    configuration_files: AdminConfigurationFile[] | null;
    configuration_filters: null | string[];
    host: string;
    // The portal theme from the configuration, which the administration area uses too.
    theme: string;
    username: string;
    display_name: string;
    components: AdminComponent[] | null;
    regulation: AdminRegulation;
}

export interface AdminComponent {
    name: string;
    detail: string;
    status: "neutral" | "ok" | "warn";
    label: string;
}

export interface AdminRegulation {
    modes: null | string[];
    max_retries: number;
    find_time: number;
    ban_time: number;
}

export type AdminStatsRange = "24h" | "30d" | "7d";

export interface AdminStats {
    range: AdminStatsRange;
    buckets: { start: string; successful: number; failed: number }[];
    total: number;
    successful: number;
    failed: number;
    banned: number;
    unique_ips: number;
    second_factor_share: number;
    users_total: null | number;
    users_disabled: null | number;
    bans_users: number;
    bans_ips: number;
}

export interface AdminUserListItem extends AdminUser {
    second_factor: { method: string; has_totp: boolean; has_webauthn: boolean; has_duo: boolean };
    last_sign_in: null | string;
    banned: boolean;
}

export type AdminLogKind = "" | "2fa" | "banned" | "failed" | "sign-in";

export interface AdminUser {
    username: string;
    display_name: string;
    email: string;
    groups: string[];
    disabled: boolean;
    given_name: string;
    middle_name: string;
    family_name: string;
    nickname: string;
    phone_number: string;
    phone_extension: string;
    zoneinfo: string;
}

export interface AdminTOTP {
    created_at: string;
    last_used_at: null | string;
    issuer: string;
    algorithm: string;
    digits: number;
    period: number;
}

export interface AdminWebAuthnCredential {
    id: number;
    created_at: string;
    last_used_at: null | string;
    rpid: string;
    description: string;
    discoverable: boolean;
    clone_warning: boolean;
}

export interface AdminSecondFactor {
    preferred_method: string;
    totp: AdminTOTP | null;
    webauthn: AdminWebAuthnCredential[];
    duo: { device: string; method: string } | null;
}

export interface AdminBan {
    id: number;
    time: string;
    expires: null | string;
    value: string;
    source: string;
    reason: string;
    active: boolean;
}

export interface AdminUserDetails {
    user: AdminUser;
    read_only: boolean;
    second_factor: AdminSecondFactor;
    bans: AdminBan[];
}

export interface AdminBans {
    users: AdminBan[];
    ips: AdminBan[];
}

export interface AdminAuthenticationLog {
    id: number;
    time: string;
    successful: boolean;
    banned: boolean;
    username: string;
    type: string;
    remote_ip: string;
    request_uri: string;
    request_method: string;
}

export interface AdminConsent {
    id: number;
    client_id: string;
    username: string;
    created_at: string;
    expires_at: null | string;
    scopes: null | string[];
    audience: null | string[];
}

export interface AdminValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface AdminSaveResult {
    saved: boolean;
    validation: AdminValidationResult;
    content?: string;
}

interface AdminResponse<T> {
    status: "KO" | "OK";
    message?: string;
    data?: T & { elevation?: boolean; second_factor?: boolean; first_factor?: boolean };
}

async function request<T>(method: "DELETE" | "GET" | "POST" | "PUT", path: string, data?: unknown): Promise<T> {
    let res: AxiosResponse<AdminResponse<T>>;

    try {
        res = await axios.request<AdminResponse<T>>({
            data,
            method,
            url: AdminPath + path,
            validateStatus: () => true,
        });
    } catch (err) {
        throw new AdminRequestError((err as Error).message, 0);
    }

    const body = res.data;

    if (res.status === 200 && body?.status === "OK") {
        return body.data as T;
    }

    if (
        res.status === 403 &&
        body?.data &&
        (body.data.elevation || body.data.second_factor || body.data.first_factor)
    ) {
        throw new AdminRequestError(
            "Identity verification is required.",
            res.status,
            !!body.data.elevation || !!body.data.first_factor,
            !!body.data.second_factor,
        );
    }

    const message = typeof body === "object" && body?.message ? body.message : `${res.status} ${res.statusText}`;

    throw new AdminRequestError(message, res.status);
}

function query(params: Record<string, number | string | undefined>) {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
            search.set(key, String(value));
        }
    }

    const encoded = search.toString();

    return encoded ? `?${encoded}` : "";
}

const user = (username: string) => `/users/${encodeURIComponent(username)}`;

export const getAdminSession = () => request<AdminSession>("GET", "/session");
export const getAdminOverview = () => request<AdminOverview>("GET", "/overview");
export const postAdminRestart = () => request<undefined>("POST", "/restart");

export const getAdminUsers = () => request<AdminUserListItem[]>("GET", "/users");
export const getAdminStats = (range: AdminStatsRange) => request<AdminStats>("GET", "/stats" + query({ range }));
export const getAdminUser = (username: string) => request<AdminUserDetails>("GET", user(username));
export const createAdminUser = (details: AdminUser, password: string) =>
    request<undefined>("POST", "/users", { ...details, password });
export const updateAdminUser = (details: AdminUser) => request<undefined>("PUT", user(details.username), details);
export const deleteAdminUser = (username: string) => request<undefined>("DELETE", user(username));
export const setAdminUserPassword = (username: string, password: string) =>
    request<undefined>("POST", `${user(username)}/password`, { password });
export const banAdminUser = (username: string, duration: number, reason: string) =>
    request<undefined>("POST", `${user(username)}/ban`, { duration, reason });
export const deleteAdminUserTOTP = (username: string) => request<undefined>("DELETE", `${user(username)}/totp`);
export const deleteAdminUserDuo = (username: string) => request<undefined>("DELETE", `${user(username)}/duo`);
export const deleteAdminUserWebAuthn = (username: string, id: number) =>
    request<undefined>("DELETE", `${user(username)}/webauthn/${id}`);

export const getAdminBans = (history = false) =>
    request<AdminBans>("GET", "/bans" + query({ history: history ? "true" : undefined }));
export const banAdminIP = (ip: string, duration: number, reason: string) =>
    request<undefined>("POST", "/bans/ips", { duration, ip, reason });
export const revokeAdminUserBan = (id: number) => request<undefined>("DELETE", `/bans/users/${id}`);
export const revokeAdminIPBan = (id: number) => request<undefined>("DELETE", `/bans/ips/${id}`);

export interface AdminFileEntry {
    name: string;
    directory: boolean;
    size: number;
    modified: string;
}

export interface AdminFileListing {
    // Empty when the allowed directories are listed.
    path: string;
    // The directory above, empty for the allowed directories and null when already listing them.
    parent: null | string;
    entries: AdminFileEntry[];
    truncated: boolean;
}

export const getAdminFiles = (path = "") =>
    request<AdminFileListing>("GET", "/files" + query({ path: path || undefined }));

export const createAdminDirectory = (path: string) => request<{ path: string }>("POST", "/files/directory", { path });

// The secret is generated on the server and written to the file, it is never sent back.
export const createAdminSecretFile = (path: string) => request<{ path: string }>("POST", "/files/secret", { path });

export const getAdminAuthenticationLogs = (
    filter: { username?: string; q?: string; kind?: AdminLogKind },
    page: number,
    limit: number,
) => request<AdminAuthenticationLog[]>("GET", "/logs" + query({ ...filter, limit, page }));

export const getAdminConsents = (username: string, page: number, limit: number) =>
    request<AdminConsent[]>("GET", "/consents" + query({ limit, page, username }));
export const revokeAdminConsent = (id: number) => request<undefined>("DELETE", `/consents/${id}`);

export const getAdminConfigurationFile = (path: string) =>
    request<{ path: string; content: string }>("GET", "/configuration/file" + query({ path }));
export const saveAdminConfigurationFile = (path: string, content: string) =>
    request<AdminSaveResult>("PUT", "/configuration/file", { content, path });
export const validateAdminConfiguration = (path: string, content: string) =>
    request<AdminValidationResult>("POST", "/configuration/validate", { content, path });
export const getAdminConfigurationSection = <T = unknown>(path: string, section: string) =>
    request<{ path: string; value: null | T }>(
        "GET",
        `/configuration/section/${encodeURIComponent(section)}` + query({ path }),
    );
export const saveAdminConfigurationSections = (path: string, values: Record<string, unknown>, validateOnly = false) =>
    request<AdminSaveResult>("PUT", "/configuration/sections", { path, validate_only: validateOnly, values });
export const getAdminConfigurationSectionsText = (path: string, keys: string[]) =>
    request<{ path: string; content: string }>(
        "GET",
        "/configuration/sections/text" + query({ keys: keys.join(","), path }),
    );
export const saveAdminConfigurationSectionsText = (
    path: string,
    keys: string[],
    content: string,
    validateOnly = false,
) =>
    request<AdminSaveResult>("PUT", "/configuration/sections/text", {
        content,
        keys,
        path,
        validate_only: validateOnly,
    });
