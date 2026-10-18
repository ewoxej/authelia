// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import {
    Ban,
    BellRing,
    CircleOff,
    Fingerprint,
    Hand,
    KeyRound,
    Lock,
    ShieldCheck,
    SkipForward,
    Sparkles,
    Timer,
    Unlock,
    Users,
} from "lucide-react";

import { BadgeTone } from "@views/Admin/Common/ui";
import { FieldDef, HeadingPart, SectionDef, TabDef, Value } from "@views/Admin/Configuration/FormEngine";

const str = (value: unknown, fallback = "") =>
    typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : fallback;

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;
const month = 30 * day;
const year = 365 * day;

const rememberMeOff = [{ label: "Off", value: "-1" }];

const policyChoice: Extract<FieldDef, { kind: "select" }> extends infer T ? Omit<T & object, "label" | "path"> : never =
    {
        display: "seg",
        kind: "select",
        optionIcons: { bypass: Unlock, deny: Ban, one_factor: Lock, two_factor: ShieldCheck },
        optionLabels: { bypass: "Bypass", deny: "Deny", one_factor: "One factor", two_factor: "Two factor" },
        options: ["deny", "bypass", "one_factor", "two_factor"],
    };

const httpMethods = [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
    "CONNECT",
    "TRACE",
    "PROPFIND",
    "PROPPATCH",
    "MKCOL",
    "COPY",
    "MOVE",
    "LOCK",
    "UNLOCK",
];

const accessControlRuleFields: FieldDef[] = [
    {
        description: "Domains this rule matches, i.e. 'app.example.com' or '*.example.com'.",
        kind: "list",
        label: "Domains",
        path: "domain",
        placeholder: "app.example.com",
        wide: true,
    },
    { kind: "list", label: "Domain regular expressions", path: "domain_regex", wide: true },
    {
        description: "Entries like 'user:john' or 'group:admins'. Any entry matching grants the rule.",
        kind: "list",
        label: "Subjects",
        path: "subject",
        placeholder: "group:admins",
        wide: true,
    },
    {
        description: "Network names or CIDR ranges.",
        kind: "list",
        label: "Networks",
        path: "networks",
        wide: true,
    },
    {
        description: "Regular expressions matching the request path.",
        kind: "list",
        label: "Resources",
        path: "resources",
        wide: true,
    },
    { ...policyChoice, label: "Policy", path: "policy" },
    {
        choices: httpMethods,
        description: "Leave all unselected to match every method.",
        kind: "list",
        label: "Methods",
        path: "methods",
    },
];

const sessionCookieFields: FieldDef[] = [
    { kind: "text", label: "Domain", path: "domain", placeholder: "example.com" },
    { kind: "text", label: "Authelia URL", path: "authelia_url", placeholder: "https://auth.example.com" },
    { kind: "text", label: "Default redirection URL", path: "default_redirection_url" },
    { kind: "text", label: "Cookie name", path: "name" },
    { kind: "select", label: "Same site", options: ["lax", "strict", "none"], path: "same_site" },
    { kind: "duration", label: "Inactivity", max: day, min: 10, path: "inactivity" },
    {
        kind: "duration",
        label: "Expiration",
        max: week,
        min: minute,
        path: "expiration",
    },
    {
        kind: "duration",
        label: "Remember me",
        max: year,
        min: hour,
        path: "remember_me",
        specials: rememberMeOff,
    },
];

const oidcClientFields: FieldDef[] = [
    { kind: "text", label: "Client ID", path: "client_id" },
    { kind: "text", label: "Client name", path: "client_name" },
    {
        description: "Store a hashed secret, generate it with 'authelia crypto hash generate pbkdf2 --random'.",
        kind: "password",
        label: "Client secret",
        path: "client_secret",
    },
    { description: "Public clients don't have a secret.", kind: "bool", label: "Public client", path: "public" },
    {
        description: "one_factor, two_factor, or the name of a custom authorization policy.",
        kind: "text",
        label: "Authorization policy",
        path: "authorization_policy",
        placeholder: "two_factor",
    },
    { kind: "bool", label: "Require PKCE", path: "require_pkce" },
    {
        defaultValue: "auto",
        display: "seg",
        kind: "select",
        label: "Consent mode",
        optionIcons: { auto: Sparkles, explicit: Hand, implicit: SkipForward, "pre-configured": Timer },
        optionLabels: { auto: "Auto", explicit: "Explicit", implicit: "Implicit", "pre-configured": "Pre-configured" },
        options: ["auto", "explicit", "implicit", "pre-configured"],
        path: "consent_mode",
    },
    {
        defaultValue: "1w",
        kind: "duration",
        label: "Pre-configured consent duration",
        max: year,
        min: hour,
        path: "pre_configured_consent_duration",
    },
    { kind: "select", label: "PKCE challenge method", options: ["S256", "plain"], path: "pkce_challenge_method" },
    {
        kind: "select",
        label: "Token endpoint auth method",
        options: ["client_secret_basic", "client_secret_post", "client_secret_jwt", "private_key_jwt", "none"],
        path: "token_endpoint_auth_method",
    },
    {
        kind: "list",
        label: "Redirect URIs",
        path: "redirect_uris",
        placeholder: "https://app.example.com/callback",
        wide: true,
    },
    { kind: "list", label: "Scopes", path: "scopes", placeholder: "openid" },
    { kind: "list", label: "Grant types", path: "grant_types", placeholder: "authorization_code" },
    { kind: "list", label: "Response types", path: "response_types", placeholder: "code" },
    { kind: "list", label: "Audience", path: "audience" },
    { kind: "text", label: "ID token signing algorithm", path: "id_token_signed_response_alg", placeholder: "RS256" },
    {
        kind: "text",
        label: "Access token signing algorithm",
        path: "access_token_signed_response_alg",
        placeholder: "none",
    },
    { kind: "text", label: "Userinfo signing algorithm", path: "userinfo_signed_response_alg", placeholder: "none" },
    { kind: "text", label: "Sector identifier URI", path: "sector_identifier_uri" },
];

const oidcJWKFields: FieldDef[] = [
    { kind: "text", label: "Key ID", path: "key_id" },
    {
        kind: "select",
        label: "Algorithm",
        options: ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256", "PS384", "PS512"],
        path: "algorithm",
    },
    { kind: "select", label: "Use", options: ["sig"], path: "use" },
    {
        description: "The private key in PEM format or a template expression which reads it from a file.",
        kind: "textarea",
        label: "Key",
        path: "key",
        secret: true,
    },
    { kind: "textarea", label: "Certificate chain", path: "certificate_chain" },
];

const hash = (algorithm: string, option: string) => `authentication_backend.file.password.${algorithm}.${option}`;

const passwordHashTabs: TabDef[] = [
    {
        fields: [
            {
                kind: "select",
                label: "Variant",
                options: ["argon2id", "argon2i", "argon2d"],
                path: hash("argon2", "variant"),
            },
            { kind: "number", label: "Iterations", min: 1, path: hash("argon2", "iterations"), placeholder: "3" },
            { kind: "number", label: "Memory (KiB)", min: 1, path: hash("argon2", "memory"), placeholder: "65536" },
            { kind: "number", label: "Parallelism", min: 1, path: hash("argon2", "parallelism"), placeholder: "4" },
            { kind: "number", label: "Key length", min: 1, path: hash("argon2", "key_length"), placeholder: "32" },
            { kind: "number", label: "Salt length", min: 1, path: hash("argon2", "salt_length"), placeholder: "16" },
        ],
        label: "Argon2",
        value: "argon2",
    },
    {
        fields: [
            { kind: "select", label: "Variant", options: ["sha512", "sha256"], path: hash("sha2crypt", "variant") },
            {
                kind: "number",
                label: "Iterations",
                min: 1,
                path: hash("sha2crypt", "iterations"),
                placeholder: "50000",
            },
            { kind: "number", label: "Salt length", min: 1, path: hash("sha2crypt", "salt_length"), placeholder: "16" },
        ],
        label: "SHA2 Crypt",
        value: "sha2crypt",
    },
    {
        fields: [
            {
                kind: "select",
                label: "Variant",
                options: ["sha512", "sha384", "sha256", "sha224", "sha1"],
                path: hash("pbkdf2", "variant"),
            },
            { kind: "number", label: "Iterations", min: 1, path: hash("pbkdf2", "iterations") },
            { kind: "number", label: "Salt length", min: 1, path: hash("pbkdf2", "salt_length") },
        ],
        label: "PBKDF2",
        value: "pbkdf2",
    },
    {
        fields: [
            { kind: "select", label: "Variant", options: ["standard", "sha256"], path: hash("bcrypt", "variant") },
            { kind: "number", label: "Cost", max: 31, min: 10, path: hash("bcrypt", "cost"), placeholder: "12" },
        ],
        label: "bcrypt",
        value: "bcrypt",
    },
    {
        fields: [
            { kind: "select", label: "Variant", options: ["scrypt", "yescrypt"], path: hash("scrypt", "variant") },
            { kind: "number", label: "Iterations", min: 1, path: hash("scrypt", "iterations") },
            { kind: "number", label: "Block size", min: 1, path: hash("scrypt", "block_size") },
            { kind: "number", label: "Parallelism", min: 1, path: hash("scrypt", "parallelism") },
            { kind: "number", label: "Key length", min: 1, path: hash("scrypt", "key_length") },
            { kind: "number", label: "Salt length", min: 1, path: hash("scrypt", "salt_length") },
        ],
        label: "scrypt",
        value: "scrypt",
    },
];

export const wholeFileSection = { id: "whole-file", title: "Whole file" };

const policyTone: Record<string, BadgeTone> = {
    bypass: "planned",
    deny: "alert",
    one_factor: "neutral",
    two_factor: "accent",
};

const list = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.map((v) => (Array.isArray(v) ? v.join(" and ") : String(v)))
        : value
          ? [String(value)]
          : [];

const accessRuleHeading = (item: Value, translate: (_key: string, _options?: Record<string, unknown>) => string) => {
    const resources = list(item.resources);
    const subjects = list(item.subject);
    const networks = list(item.networks);
    const domains = [...list(item.domain), ...list(item.domain_regex)];

    const outcome: Record<string, string> = {
        bypass: "skip authentication",
        deny: "are blocked",
        one_factor: "need a password",
        two_factor: "need two factors",
    };

    const parts: HeadingPart[] = [
        { key: true, text: resources.length ? resources.join(", ") : translate("Every path") },
        { text: translate("on") },
        { key: true, text: domains.length ? domains.join(", ") : translate("any domain") },
        { text: translate("from") },
        { key: true, text: subjects.length ? subjects.join(translate(" or ")) : translate("anyone") },
    ];

    if (networks.length) {
        parts.push({ text: translate("on") }, { key: true, text: networks.join(", ") });
    }

    parts.push({
        key: true,
        text: `${translate(outcome[str(item.policy)] ?? "use the default policy")}.`,
        tone: policyTone[str(item.policy)] ?? "neutral",
    });

    return parts;
};

export const sections: SectionDef[] = [
    {
        columns: [["main", "Logging"]],
        description: "Portal theme, the default second factor and logging.",
        fields: [
            {
                defaultValue: "light",
                display: "seg",
                kind: "select",
                label: "Theme",
                options: ["auto", "light", "dark", "grey", "oled"],
                optionSwatches: {
                    auto: "linear-gradient(135deg, #ffffff 50%, #1e1e1e 50%)",
                    dark: "#1e1e1e",
                    grey: "#6b6f76",
                    light: "#ffffff",
                    oled: "#000000",
                },
                path: "theme",
                wide: true,
            },
            {
                defaultValue: "totp",
                description: "The method new users get before they pick their own.",
                display: "seg",
                kind: "select",
                label: "Default 2FA method",
                optionIcons: { mobile_push: BellRing, totp: KeyRound, webauthn: Fingerprint },
                optionLabels: { mobile_push: "Push", totp: "TOTP", webauthn: "WebAuthn" },
                options: ["totp", "webauthn", "mobile_push"],
                path: "default_2fa_method",
            },
            {
                description:
                    "Extra trusted CA certificates for LDAP, SMTP and OIDC connections. Empty uses the system store.",
                kind: "text",
                label: "Certificates directory",
                path: "certificates_directory",
                picker: "directory",
                placeholder: "/config/certificates",
                wide: true,
            },
            {
                description: "Where Authelia writes its log and how much detail goes in.",
                fields: [
                    {
                        defaultValue: "info",
                        description: "debug and trace print request details. Use them only while troubleshooting.",
                        display: "seg",
                        kind: "select",
                        label: "Level",
                        options: ["error", "warn", "info", "debug", "trace"],
                        path: "log.level",
                    },
                    {
                        defaultValue: "text",
                        display: "seg",
                        kind: "select",
                        label: "Format",
                        options: ["text", "json"],
                        path: "log.format",
                    },
                    {
                        kind: "text",
                        label: "File path",
                        path: "log.file_path",
                        picker: "new-file",
                        placeholder: "/config/authelia.log",
                    },
                    {
                        description: "With a file path set, stdout is silent unless this is on.",
                        kind: "bool",
                        label: "Keep stdout",
                        path: "log.keep_stdout",
                    },
                ],
                keyName: "log",
                kind: "group",
                label: "Logging",
            },
        ],
        id: "general",
        keys: ["theme", "default_2fa_method", "certificates_directory", "log"],
        mainDescription: "What users see on the sign-in page.",
        mainTitle: "Portal",
        title: "General",
    },
    {
        description: "Who can reach which resources. Rules run top to bottom and the first match wins.",
        fields: [
            {
                ...policyChoice,
                defaultValue: "deny",
                description: "Applied when no rule matches the request. Keep deny so unlisted domains stay closed.",
                label: "Default policy",
                path: "access_control.default_policy",
            },
            {
                addLabel: "Add rule",
                description: "Use the arrows to change the order.",
                fields: accessControlRuleFields,
                itemHeading: accessRuleHeading,
                itemTitle: (item: Value) => str(item.domain) || str(item.domain_regex),
                kind: "array",
                label: "Rules",
                newItem: () => ({ domain: [], policy: "two_factor" }),
                path: "access_control.rules",
            },
        ],
        id: "access-control",
        keys: ["access_control"],
        mainTitle: "",
        title: "Access Control",
    },
    {
        description: "Session cookies, lifetimes and where sessions are stored.",
        fields: [
            {
                description: "Usually read from a file at startup with a template expression.",
                kind: "password",
                label: "Secret",
                path: "session.secret",
            },
            { kind: "text", label: "Cookie name", path: "session.name", placeholder: "authelia_session" },
            {
                defaultValue: "lax",
                kind: "select",
                label: "Same site",
                options: ["lax", "strict", "none"],
                path: "session.same_site",
            },
            {
                defaultValue: "5m",
                description: "Sign out after this long without a request.",
                kind: "duration",
                label: "Inactivity",
                max: day,
                min: 10,
                path: "session.inactivity",
            },
            {
                defaultValue: "1h",
                description: "Hard limit, even for active users.",
                kind: "duration",
                label: "Expiration",
                max: week,
                min: minute,
                path: "session.expiration",
            },
            {
                defaultValue: "1M",
                description: "Off hides the checkbox on the sign-in page.",
                kind: "duration",
                label: "Remember me",
                max: year,
                min: hour,
                path: "session.remember_me",
                specials: rememberMeOff,
            },
            {
                addLabel: "Add domain",
                description: "One entry per root domain protected by this portal.",
                fields: sessionCookieFields,
                itemMeta: (item: Value) =>
                    item.expiration || item.inactivity || item.remember_me
                        ? "overrides lifetimes"
                        : "inherits lifetimes",
                itemTitle: (item: Value) => str(item.domain),
                kind: "array",
                label: "Cookie domains",
                newItem: () => ({ authelia_url: "https://auth.example.com", domain: "example.com" }),
                path: "session.cookies",
                splitDurations: true,
            },
            {
                description: "Keep sessions in Redis so they survive restarts.",
                fields: [
                    { kind: "text", label: "Host", path: "session.redis.host", placeholder: "redis" },
                    { kind: "number", label: "Port", path: "session.redis.port", placeholder: "6379" },
                    { kind: "text", label: "Username", path: "session.redis.username" },
                    { kind: "password", label: "Password", path: "session.redis.password" },
                    { kind: "number", label: "Database index", path: "session.redis.database_index", placeholder: "0" },
                ],
                kind: "group",
                label: "Redis",
                offNote: "Sessions are kept in memory. Restarting Authelia signs everyone out.",
                togglePath: "session.redis",
            },
        ],
        id: "session",
        keys: ["session"],
        mainDescription: "Shared by every cookie domain below unless a domain overrides it.",
        mainTitle: "Cookie and lifetimes",
        splitDurations: true,
        title: "Session",
    },
    {
        choose: { groups: ["File", "LDAP"], label: "Backend" },
        description: "Where users and passwords come from.",
        fields: [
            {
                invert: true,
                kind: "bool",
                label: "Enable password reset",
                path: "authentication_backend.password_reset.disable",
            },
            {
                invert: true,
                kind: "bool",
                label: "Enable password change",
                path: "authentication_backend.password_change.disable",
            },
            {
                defaultValue: "5m",
                description: "How often user details are refreshed from the backend.",
                kind: "duration",
                label: "Refresh interval",
                max: day,
                min: 10,
                path: "authentication_backend.refresh_interval",
                specials: [
                    { label: "Every request", value: "always" },
                    { label: "Never", value: "disable" },
                ],
            },
            {
                description: "Users stored in a YAML file, manageable from the Users page.",
                fields: [
                    {
                        kind: "text",
                        label: "Path",
                        path: "authentication_backend.file.path",
                        picker: "file",
                        wide: true,
                    },
                    { kind: "bool", label: "Watch for changes", path: "authentication_backend.file.watch" },
                    {
                        kind: "bool",
                        label: "Allow sign in with email",
                        path: "authentication_backend.file.search.email",
                    },
                    {
                        kind: "bool",
                        label: "Case insensitive usernames",
                        path: "authentication_backend.file.search.case_insensitive",
                    },
                    {
                        defaultValue: "argon2",
                        description: "Choose the algorithm new passwords are hashed with, each has its own parameters.",
                        kind: "tabs",
                        label: "Password algorithm",
                        path: "authentication_backend.file.password.algorithm",
                        tabs: passwordHashTabs,
                    },
                ],
                kind: "group",
                label: "File",
                offNote: "The file backend isn't used. Turn it on to keep users in a YAML file instead of a directory.",
                replaces: [{ label: "LDAP", path: "authentication_backend.ldap" }],
                togglePath: "authentication_backend.file",
            },
            {
                description: "Users stored in an LDAP directory.",
                fields: [
                    {
                        kind: "text",
                        label: "Address",
                        path: "authentication_backend.ldap.address",
                        placeholder: "ldaps://ldap.example.com",
                    },
                    {
                        kind: "select",
                        label: "Implementation",
                        options: ["custom", "activedirectory", "rfc2307bis", "freeipa", "lldap", "glauth"],
                        path: "authentication_backend.ldap.implementation",
                    },
                    { kind: "text", label: "Bind user", path: "authentication_backend.ldap.user" },
                    { kind: "password", label: "Bind password", path: "authentication_backend.ldap.password" },
                    { kind: "text", label: "Base DN", path: "authentication_backend.ldap.base_dn" },
                    {
                        kind: "text",
                        label: "Additional users DN",
                        path: "authentication_backend.ldap.additional_users_dn",
                    },
                    {
                        kind: "text",
                        label: "Additional groups DN",
                        path: "authentication_backend.ldap.additional_groups_dn",
                    },
                    { kind: "bool", label: "StartTLS", path: "authentication_backend.ldap.start_tls" },
                    {
                        kind: "text",
                        label: "Users filter",
                        path: "authentication_backend.ldap.users_filter",
                        wide: true,
                    },
                    {
                        kind: "text",
                        label: "Groups filter",
                        path: "authentication_backend.ldap.groups_filter",
                        wide: true,
                    },
                    {
                        defaultValue: "5s",
                        kind: "duration",
                        label: "Timeout",
                        max: 300,
                        min: 1,
                        path: "authentication_backend.ldap.timeout",
                        wide: true,
                    },
                ],
                kind: "group",
                label: "LDAP",
                offNote: "LDAP isn't used. Turn it on to look users up in a directory instead of the file backend.",
                replaces: [{ label: "File", path: "authentication_backend.file" }],
                togglePath: "authentication_backend.ldap",
            },
        ],
        id: "authentication-backend",
        keys: ["authentication_backend"],
        splitDurations: true,
        title: "Authentication Backend",
    },
    {
        description: "One-time passwords, WebAuthn and passkeys, and Duo push notifications.",
        fields: [
            {
                fields: [
                    { kind: "text", label: "Issuer", path: "totp.issuer", placeholder: "authelia.com" },
                    {
                        kind: "select",
                        label: "Algorithm",
                        options: ["SHA1", "SHA256", "SHA512"],
                        path: "totp.algorithm",
                    },
                    { kind: "number", label: "Digits", path: "totp.digits", placeholder: "6" },
                    { kind: "number", label: "Period (seconds)", path: "totp.period", placeholder: "30" },
                    { kind: "number", label: "Skew", path: "totp.skew", placeholder: "1" },
                    { kind: "number", label: "Secret size", path: "totp.secret_size", placeholder: "32" },
                ],
                kind: "group",
                label: "One-Time Password",
                toggle: { invert: true, path: "totp.disable" },
            },
            {
                fields: [
                    {
                        description: "Lets users sign in with a passkey instead of a username and password.",
                        kind: "bool",
                        label: "Enable passkey login",
                        path: "webauthn.enable_passkey_login",
                    },
                    { kind: "text", label: "Display name", path: "webauthn.display_name", placeholder: "Authelia" },
                    {
                        kind: "select",
                        label: "Attestation conveyance",
                        options: ["none", "indirect", "direct"],
                        path: "webauthn.attestation_conveyance_preference",
                    },
                    {
                        kind: "select",
                        label: "User verification",
                        options: ["discouraged", "preferred", "required"],
                        path: "webauthn.selection_criteria.user_verification",
                    },
                    {
                        defaultValue: "60s",
                        kind: "duration",
                        label: "Timeout",
                        max: 10 * minute,
                        min: 10,
                        path: "webauthn.timeout",
                    },
                ],
                kind: "group",
                label: "WebAuthn",
                toggle: { invert: true, path: "webauthn.disable" },
            },
            {
                fields: [
                    { kind: "text", label: "Hostname", path: "duo_api.hostname" },
                    { kind: "text", label: "Integration key", path: "duo_api.integration_key" },
                    { kind: "password", label: "Secret key", path: "duo_api.secret_key" },
                    { kind: "bool", label: "Enable self enrollment", path: "duo_api.enable_self_enrollment" },
                ],
                kind: "group",
                label: "Duo",
                toggle: { invert: true, path: "duo_api.disable" },
            },
        ],
        id: "second-factor",
        keys: ["totp", "webauthn", "duo_api"],
        title: "Second Factor",
    },
    {
        columns: [["Standard", "zxcvbn"]],
        description: "Requirements for new passwords.",
        fields: [
            {
                fields: [
                    { kind: "number", label: "Minimum length", min: 1, path: "password_policy.standard.min_length" },
                    { kind: "number", label: "Maximum length", min: 0, path: "password_policy.standard.max_length" },
                    { kind: "bool", label: "Require uppercase", path: "password_policy.standard.require_uppercase" },
                    { kind: "bool", label: "Require lowercase", path: "password_policy.standard.require_lowercase" },
                    { kind: "bool", label: "Require number", path: "password_policy.standard.require_number" },
                    {
                        kind: "bool",
                        label: "Require special character",
                        path: "password_policy.standard.require_special",
                    },
                ],
                kind: "group",
                label: "Standard",
                toggle: { path: "password_policy.standard.enabled" },
            },
            {
                fields: [
                    {
                        kind: "number",
                        label: "Minimum score",
                        max: 4,
                        min: 1,
                        path: "password_policy.zxcvbn.min_score",
                    },
                ],
                kind: "group",
                label: "zxcvbn",
                toggle: { path: "password_policy.zxcvbn.enabled" },
            },
        ],
        id: "password-policy",
        keys: ["password_policy"],
        title: "Password Policy",
    },
    {
        columns: [["Regulation", "Identity Validation"]],
        description: "Brute force protection and identity verification for sensitive actions.",
        fields: [
            {
                fields: [
                    { kind: "list", label: "Modes", path: "regulation.modes", placeholder: "user" },
                    { kind: "number", label: "Maximum retries", min: 0, path: "regulation.max_retries" },
                    {
                        defaultValue: "2m",
                        kind: "duration",
                        label: "Find time",
                        max: hour,
                        min: 10,
                        path: "regulation.find_time",
                    },
                    {
                        defaultValue: "5m",
                        kind: "duration",
                        label: "Ban time",
                        max: day,
                        min: 10,
                        path: "regulation.ban_time",
                    },
                ],
                kind: "group",
                label: "Regulation",
            },
            {
                fields: [
                    {
                        defaultValue: "5m",
                        kind: "duration",
                        label: "Reset password link lifespan",
                        max: hour,
                        min: minute,
                        path: "identity_validation.reset_password.jwt_lifespan",
                    },
                    {
                        kind: "password",
                        label: "Reset password JWT secret",
                        path: "identity_validation.reset_password.jwt_secret",
                    },
                    {
                        defaultValue: "5m",
                        kind: "duration",
                        label: "Code lifespan",
                        max: 30 * minute,
                        min: minute,
                        path: "identity_validation.elevated_session.code_lifespan",
                    },
                    {
                        defaultValue: "10m",
                        kind: "duration",
                        label: "Elevation lifespan",
                        max: hour,
                        min: minute,
                        path: "identity_validation.elevated_session.elevation_lifespan",
                    },
                    {
                        kind: "number",
                        label: "Code characters",
                        path: "identity_validation.elevated_session.characters",
                    },
                    {
                        kind: "bool",
                        label: "Require second factor",
                        path: "identity_validation.elevated_session.require_second_factor",
                    },
                    {
                        kind: "bool",
                        label: "Skip with second factor",
                        path: "identity_validation.elevated_session.skip_second_factor",
                    },
                ],
                kind: "group",
                label: "Identity Validation",
            },
        ],
        id: "security",
        keys: ["regulation", "identity_validation"],
        title: "Regulation & Verification",
    },
    {
        choose: { groups: ["SMTP", "File System"], label: "Notifier" },
        description: "How emails with one-time codes and password reset links are sent.",
        fields: [
            { invert: true, kind: "bool", label: "Enable startup check", path: "notifier.disable_startup_check" },
            {
                fields: [
                    {
                        kind: "text",
                        label: "Address",
                        path: "notifier.smtp.address",
                        placeholder: "submission://smtp.example.com:587",
                    },
                    {
                        kind: "text",
                        label: "Sender",
                        path: "notifier.smtp.sender",
                        placeholder: "Authelia <admin@example.com>",
                    },
                    { kind: "text", label: "Username", path: "notifier.smtp.username" },
                    { kind: "password", label: "Password", path: "notifier.smtp.password" },
                    { kind: "text", label: "Identifier", path: "notifier.smtp.identifier" },
                    {
                        kind: "text",
                        label: "Subject",
                        path: "notifier.smtp.subject",
                        placeholder: "[Authelia] {title}",
                    },
                    {
                        invert: true,
                        kind: "bool",
                        label: "Enable HTML emails",
                        path: "notifier.smtp.disable_html_emails",
                    },
                    { invert: true, kind: "bool", label: "Require TLS", path: "notifier.smtp.disable_require_tls" },
                    { invert: true, kind: "bool", label: "Enable StartTLS", path: "notifier.smtp.disable_starttls" },
                    {
                        defaultValue: "5s",
                        kind: "duration",
                        label: "Timeout",
                        max: 300,
                        min: 1,
                        path: "notifier.smtp.timeout",
                    },
                ],
                kind: "group",
                label: "SMTP",
                replaces: [{ label: "File System", path: "notifier.filesystem" }],
                togglePath: "notifier.smtp",
            },
            {
                fields: [
                    {
                        kind: "text",
                        label: "File name",
                        path: "notifier.filesystem.filename",
                        picker: "new-file",
                        wide: true,
                    },
                ],
                kind: "group",
                label: "File System",
                replaces: [{ label: "SMTP", path: "notifier.smtp" }],
                togglePath: "notifier.filesystem",
            },
        ],
        id: "notifier",
        keys: ["notifier"],
        mainTitle: "",
        title: "Notifications",
    },
    {
        choose: { groups: ["SQLite", "PostgreSQL", "MySQL"], label: "Database" },
        description: "The database used to store second factor registrations, logs and OpenID Connect sessions.",
        fields: [
            { kind: "password", label: "Encryption key", path: "storage.encryption_key", wide: true },
            {
                fields: [{ kind: "text", label: "Path", path: "storage.local.path", picker: "new-file", wide: true }],
                kind: "group",
                label: "SQLite",
                replaces: [
                    { label: "PostgreSQL", path: "storage.postgres" },
                    { label: "MySQL", path: "storage.mysql" },
                ],
                togglePath: "storage.local",
            },
            {
                fields: [
                    { kind: "text", label: "Address", path: "storage.postgres.address" },
                    { kind: "text", label: "Database", path: "storage.postgres.database" },
                    { kind: "text", label: "Schema", path: "storage.postgres.schema" },
                    { kind: "text", label: "Username", path: "storage.postgres.username" },
                    { kind: "password", label: "Password", path: "storage.postgres.password" },
                    {
                        defaultValue: "5s",
                        kind: "duration",
                        label: "Timeout",
                        max: 300,
                        min: 1,
                        path: "storage.postgres.timeout",
                    },
                ],
                kind: "group",
                label: "PostgreSQL",
                replaces: [
                    { label: "SQLite", path: "storage.local" },
                    { label: "MySQL", path: "storage.mysql" },
                ],
                togglePath: "storage.postgres",
            },
            {
                fields: [
                    { kind: "text", label: "Address", path: "storage.mysql.address" },
                    { kind: "text", label: "Database", path: "storage.mysql.database" },
                    { kind: "text", label: "Username", path: "storage.mysql.username" },
                    { kind: "password", label: "Password", path: "storage.mysql.password" },
                    {
                        defaultValue: "5s",
                        kind: "duration",
                        label: "Timeout",
                        max: 300,
                        min: 1,
                        path: "storage.mysql.timeout",
                    },
                ],
                kind: "group",
                label: "MySQL",
                replaces: [
                    { label: "SQLite", path: "storage.local" },
                    { label: "PostgreSQL", path: "storage.postgres" },
                ],
                togglePath: "storage.mysql",
            },
        ],
        id: "storage",
        keys: ["storage"],
        mainTitle: "",
        title: "Storage",
    },
    {
        description:
            "Single sign on for applications using OpenID Connect. Advanced client options are edited with the YAML editor.",
        fields: [
            { kind: "password", label: "HMAC secret", path: "identity_providers.oidc.hmac_secret", wide: true },
            {
                defaultValue: "public_clients_only",
                display: "seg",
                kind: "select",
                label: "Enforce PKCE",
                optionIcons: { always: ShieldCheck, never: CircleOff, public_clients_only: Users },
                optionLabels: { always: "Always", never: "Never", public_clients_only: "Public clients" },
                options: ["never", "public_clients_only", "always"],
                path: "identity_providers.oidc.enforce_pkce",
                wide: true,
            },
            {
                description: "The minimum entropy of the nonce and state parameters, -1 disables the check.",
                kind: "number",
                label: "Minimum parameter entropy",
                min: -1,
                path: "identity_providers.oidc.minimum_parameter_entropy",
                placeholder: "8",
            },
            {
                fields: [
                    {
                        defaultValue: "1h",
                        kind: "duration",
                        label: "Access token",
                        max: day,
                        min: 5 * minute,
                        path: "identity_providers.oidc.lifespans.access_token",
                    },
                    {
                        defaultValue: "1m",
                        kind: "duration",
                        label: "Authorize code",
                        max: 10 * minute,
                        min: 10,
                        path: "identity_providers.oidc.lifespans.authorize_code",
                    },
                    {
                        defaultValue: "1h",
                        kind: "duration",
                        label: "ID token",
                        max: day,
                        min: 5 * minute,
                        path: "identity_providers.oidc.lifespans.id_token",
                    },
                    {
                        defaultValue: "90m",
                        kind: "duration",
                        label: "Refresh token",
                        max: month,
                        min: 10 * minute,
                        path: "identity_providers.oidc.lifespans.refresh_token",
                    },
                ],
                kind: "group",
                label: "Lifespans",
            },
            {
                fields: oidcClientFields,
                itemTitle: (item: Value) => `${str(item.client_name) || str(item.client_id, "?")}`,
                kind: "array",
                label: "Clients",
                newItem: () => ({
                    authorization_policy: "two_factor",
                    client_id: "",
                    client_name: "",
                    redirect_uris: [],
                    scopes: ["openid", "profile", "email", "groups"],
                }),
                path: "identity_providers.oidc.clients",
            },
            {
                description: "The keys used to sign the tokens. The first key of each algorithm is used by default.",
                fields: oidcJWKFields,
                itemTitle: (item: Value) => `${str(item.key_id) || str(item.algorithm) || "RS256"}`,
                kind: "array",
                label: "Signing keys (JWKS)",
                newItem: () => ({ key: "" }),
                path: "identity_providers.oidc.jwks",
            },
        ],
        id: "openid-connect",
        keys: ["identity_providers"],
        mainTitle: "",
        title: "OpenID Connect",
    },
    {
        columns: [
            ["Server", "NTP"],
            ["Metrics", "Privacy Policy"],
        ],
        description: "Listener, NTP, metrics and the privacy policy.",
        fields: [
            {
                fields: [
                    { kind: "text", label: "Address", path: "server.address", placeholder: "tcp://:9091/" },
                    { kind: "text", label: "Asset path", path: "server.asset_path", picker: "directory" },
                    { invert: true, kind: "bool", label: "Enable health check", path: "server.disable_healthcheck" },
                    { kind: "bool", label: "Enable pprof", path: "server.endpoints.enable_pprof" },
                    { kind: "bool", label: "Enable expvars", path: "server.endpoints.enable_expvars" },
                ],
                kind: "group",
                label: "Server",
            },
            {
                fields: [
                    {
                        kind: "text",
                        label: "Address",
                        path: "ntp.address",
                        placeholder: "udp://time.cloudflare.com:123",
                    },
                    { kind: "number", label: "Version", path: "ntp.version", placeholder: "4" },
                    {
                        defaultValue: "3s",
                        kind: "duration",
                        label: "Maximum desync",
                        max: minute,
                        min: 1,
                        path: "ntp.max_desync",
                    },
                    { invert: true, kind: "bool", label: "Enable startup check", path: "ntp.disable_startup_check" },
                    { invert: true, kind: "bool", label: "Fail on desync", path: "ntp.disable_failure" },
                ],
                kind: "group",
                label: "NTP",
            },
            {
                description: "Prometheus metrics on a separate listener.",
                fields: [
                    { kind: "text", label: "Address", path: "telemetry.metrics.address", placeholder: "tcp://:9959/" },
                ],
                kind: "group",
                label: "Metrics",
                toggle: { path: "telemetry.metrics.enabled" },
            },
            {
                description: "A link to the privacy policy on the sign-in page.",
                fields: [
                    { kind: "bool", label: "Require user acceptance", path: "privacy_policy.require_user_acceptance" },
                    { kind: "text", label: "Policy URL", path: "privacy_policy.policy_url", wide: true },
                ],
                kind: "group",
                label: "Privacy Policy",
                toggle: { path: "privacy_policy.enabled" },
            },
        ],
        id: "system",
        keys: ["server", "ntp", "telemetry", "privacy_policy"],
        title: "System",
    },
    {
        description: "This administration area.",
        fields: [
            {
                description:
                    "Turning this off locks you out of the administration area until it's enabled again in the file.",
                kind: "bool",
                label: "Enabled",
                path: "administration.enabled",
            },
            { invert: true, kind: "bool", label: "Enable restart", path: "administration.disable_restart" },
            {
                kind: "text",
                label: "Administrator group",
                path: "administration.admin_group",
                placeholder: "admins",
                wide: true,
            },
            {
                description:
                    "The directories the file picker can browse. Empty uses the directories of the configuration files.",
                kind: "list",
                label: "File picker directories",
                path: "administration.file_roots",
                placeholder: "/config",
                wide: true,
            },
        ],
        id: "administration",
        keys: ["administration"],
        title: "Administration",
    },
];
