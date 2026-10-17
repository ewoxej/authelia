// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { BadgeTone } from "@views/Admin/Common/ui";
import { FieldDef, SectionDef, Value } from "@views/Admin/Configuration/FormEngine";

const str = (value: unknown, fallback = "") =>
    typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : fallback;

const accessControlRuleFields: FieldDef[] = [
    {
        description: "Domains this rule matches, i.e. 'app.example.com' or '*.example.com'.",
        kind: "list",
        label: "Domains",
        path: "domain",
        placeholder: "app.example.com",
    },
    { kind: "list", label: "Domain regular expressions", path: "domain_regex" },
    { kind: "select", label: "Policy", options: ["two_factor", "one_factor", "bypass", "deny"], path: "policy" },
    {
        description: "Entries like 'user:john' or 'group:admins'. Any entry matching grants the rule.",
        kind: "list",
        label: "Subjects",
        path: "subject",
        placeholder: "group:admins",
    },
    { description: "Network names or CIDR ranges.", kind: "list", label: "Networks", path: "networks" },
    {
        description: "Regular expressions matching the request path.",
        kind: "list",
        label: "Resources",
        path: "resources",
    },
    { description: "HTTP methods, i.e. GET, POST.", kind: "list", label: "Methods", path: "methods" },
];

const sessionCookieFields: FieldDef[] = [
    { kind: "text", label: "Domain", path: "domain", placeholder: "example.com" },
    { kind: "text", label: "Authelia URL", path: "authelia_url", placeholder: "https://auth.example.com" },
    { kind: "text", label: "Default redirection URL", path: "default_redirection_url" },
    { kind: "text", label: "Cookie name", path: "name" },
    { kind: "select", label: "Same site", options: ["lax", "strict", "none"], path: "same_site" },
    { kind: "text", label: "Inactivity", path: "inactivity", placeholder: "5 minutes" },
    { kind: "text", label: "Expiration", path: "expiration", placeholder: "1 hour" },
    { kind: "text", label: "Remember me", path: "remember_me", placeholder: "1 month" },
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
    {
        kind: "select",
        label: "Consent mode",
        options: ["auto", "explicit", "implicit", "pre-configured"],
        path: "consent_mode",
    },
    {
        kind: "text",
        label: "Pre-configured consent duration",
        path: "pre_configured_consent_duration",
        placeholder: "1 week",
    },
    { kind: "bool", label: "Require PKCE", path: "require_pkce" },
    { kind: "select", label: "PKCE challenge method", options: ["S256", "plain"], path: "pkce_challenge_method" },
    { kind: "list", label: "Redirect URIs", path: "redirect_uris", placeholder: "https://app.example.com/callback" },
    { kind: "list", label: "Scopes", path: "scopes", placeholder: "openid" },
    { kind: "list", label: "Grant types", path: "grant_types", placeholder: "authorization_code" },
    { kind: "list", label: "Response types", path: "response_types", placeholder: "code" },
    { kind: "list", label: "Audience", path: "audience" },
    {
        kind: "select",
        label: "Token endpoint auth method",
        options: ["client_secret_basic", "client_secret_post", "client_secret_jwt", "private_key_jwt", "none"],
        path: "token_endpoint_auth_method",
    },
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
    },
    { kind: "textarea", label: "Certificate chain", path: "certificate_chain" },
];

const hash = (algorithm: string, option: string) => `authentication_backend.file.password.${algorithm}.${option}`;

const passwordHashFields: FieldDef[] = [
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
        kind: "group",
        label: "Argon2",
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
        kind: "group",
        label: "SHA2 Crypt",
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
        kind: "group",
        label: "PBKDF2",
    },
    {
        fields: [
            { kind: "select", label: "Variant", options: ["standard", "sha256"], path: hash("bcrypt", "variant") },
            { kind: "number", label: "Cost", max: 31, min: 10, path: hash("bcrypt", "cost"), placeholder: "12" },
        ],
        kind: "group",
        label: "bcrypt",
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
        kind: "group",
        label: "scrypt",
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

const accessRuleSummary = (item: Value, translate: (_key: string, _options?: Record<string, unknown>) => string) => {
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

    return translate("Requests to {{what}} on {{where}} from {{who}}{{networks}} {{outcome}}.", {
        networks: networks.length ? translate(" on {{networks}}", { networks: networks.join(", ") }) : "",
        outcome: translate(outcome[str(item.policy)] ?? "use the default policy"),
        what: resources.length ? resources.join(", ") : translate("every path"),
        where: domains.length ? domains.join(", ") : translate("any domain"),
        who: subjects.length ? subjects.join(translate(" or ")) : translate("anyone"),
    });
};

export const sections: SectionDef[] = [
    {
        description: "Portal theme, the default second factor and logging.",
        fields: [
            {
                defaultValue: "light",
                kind: "select",
                label: "Theme",
                options: ["auto", "light", "dark", "grey", "oled"],
                path: "theme",
            },
            {
                defaultValue: "totp",
                description: "The method new users get before they pick their own.",
                kind: "select",
                label: "Default 2FA method",
                options: ["totp", "webauthn", "mobile_push"],
                path: "default_2fa_method",
            },
            {
                description:
                    "Extra trusted CA certificates for LDAP, SMTP and OIDC connections. Empty uses the system store.",
                kind: "text",
                label: "Certificates directory",
                path: "certificates_directory",
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
                        kind: "select",
                        label: "Format",
                        options: ["text", "json"],
                        path: "log.format",
                    },
                    { kind: "text", label: "File path", path: "log.file_path", placeholder: "/config/authelia.log" },
                    {
                        description: "With a file path set, stdout is silent unless this is on.",
                        kind: "bool",
                        label: "Keep stdout",
                        path: "log.keep_stdout",
                        text: "Also print to stdout",
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
                defaultValue: "deny",
                description: "Keep deny so unlisted domains stay closed.",
                kind: "select",
                label: "Default policy",
                options: ["deny", "bypass", "one_factor", "two_factor"],
                path: "access_control.default_policy",
            },
            {
                addLabel: "Add rule",
                description: "Use the arrows to change the order.",
                fields: accessControlRuleFields,
                itemBadge: (item: Value) =>
                    item.policy
                        ? { label: str(item.policy), tone: policyTone[str(item.policy)] ?? "neutral" }
                        : undefined,
                itemMeta: (item: Value) => list(item.subject)[0] ?? list(item.resources)[0],
                itemSummary: accessRuleSummary,
                itemTitle: (item: Value) => str(item.domain) || str(item.domain_regex),
                kind: "array",
                label: "Rules",
                newItem: () => ({ domain: [], policy: "two_factor" }),
                path: "access_control.rules",
            },
        ],
        id: "access-control",
        keys: ["access_control"],
        mainDescription: "Applied when no rule matches the request.",
        mainTitle: "Defaults",
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
                description: "Sign out after this long without a request.",
                kind: "text",
                label: "Inactivity",
                path: "session.inactivity",
                placeholder: "5 minutes",
            },
            {
                description: "Hard limit, even for active users.",
                kind: "text",
                label: "Expiration",
                path: "session.expiration",
                placeholder: "1 hour",
            },
            {
                description: "Set to -1 to hide the checkbox on the sign-in page.",
                kind: "text",
                label: "Remember me",
                path: "session.remember_me",
                placeholder: "1 month",
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
        title: "Session",
    },
    {
        description: "Where users and passwords come from.",
        fields: [
            { kind: "bool", label: "Disable password reset", path: "authentication_backend.password_reset.disable" },
            { kind: "bool", label: "Disable password change", path: "authentication_backend.password_change.disable" },
            {
                description: "How often user details are refreshed, i.e. '5 minutes', 'always' or 'disable'.",
                kind: "text",
                label: "Refresh interval",
                path: "authentication_backend.refresh_interval",
            },
            {
                description: "Users stored in a YAML file, manageable from the Users page.",
                fields: [
                    { kind: "text", label: "Path", path: "authentication_backend.file.path", wide: true },
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
                        kind: "select",
                        label: "Password algorithm",
                        options: ["argon2", "sha2crypt", "pbkdf2", "bcrypt", "scrypt"],
                        path: "authentication_backend.file.password.algorithm",
                    },
                    ...passwordHashFields,
                ],
                kind: "group",
                label: "File",
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
                    { kind: "text", label: "Base DN", path: "authentication_backend.ldap.base_dn" },
                    { kind: "text", label: "Bind user", path: "authentication_backend.ldap.user" },
                    { kind: "password", label: "Bind password", path: "authentication_backend.ldap.password" },
                    {
                        kind: "text",
                        label: "Additional users DN",
                        path: "authentication_backend.ldap.additional_users_dn",
                    },
                    {
                        kind: "text",
                        label: "Users filter",
                        path: "authentication_backend.ldap.users_filter",
                        wide: true,
                    },
                    {
                        kind: "text",
                        label: "Additional groups DN",
                        path: "authentication_backend.ldap.additional_groups_dn",
                    },
                    {
                        kind: "text",
                        label: "Groups filter",
                        path: "authentication_backend.ldap.groups_filter",
                        wide: true,
                    },
                    { kind: "bool", label: "StartTLS", path: "authentication_backend.ldap.start_tls" },
                    { kind: "text", label: "Timeout", path: "authentication_backend.ldap.timeout" },
                ],
                kind: "group",
                label: "LDAP",
            },
        ],
        id: "authentication-backend",
        keys: ["authentication_backend"],
        title: "Authentication Backend",
    },
    {
        description: "One-time passwords, WebAuthn and passkeys, and Duo push notifications.",
        fields: [
            {
                fields: [
                    { kind: "bool", label: "Disable", path: "totp.disable" },
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
            },
            {
                fields: [
                    { kind: "bool", label: "Disable", path: "webauthn.disable" },
                    { kind: "bool", label: "Enable passkey login", path: "webauthn.enable_passkey_login" },
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
                    { kind: "text", label: "Timeout", path: "webauthn.timeout", placeholder: "60 seconds" },
                ],
                kind: "group",
                label: "WebAuthn",
            },
            {
                fields: [
                    { kind: "bool", label: "Disable", path: "duo_api.disable" },
                    { kind: "text", label: "Hostname", path: "duo_api.hostname" },
                    { kind: "text", label: "Integration key", path: "duo_api.integration_key" },
                    { kind: "password", label: "Secret key", path: "duo_api.secret_key" },
                    { kind: "bool", label: "Enable self enrollment", path: "duo_api.enable_self_enrollment" },
                ],
                kind: "group",
                label: "Duo",
            },
        ],
        id: "second-factor",
        keys: ["totp", "webauthn", "duo_api"],
        title: "Second Factor",
    },
    {
        description: "Requirements for new passwords.",
        fields: [
            {
                fields: [
                    { kind: "bool", label: "Enabled", path: "password_policy.standard.enabled" },
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
            },
            {
                fields: [
                    { kind: "bool", label: "Enabled", path: "password_policy.zxcvbn.enabled" },
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
            },
        ],
        id: "password-policy",
        keys: ["password_policy"],
        title: "Password Policy",
    },
    {
        description: "Brute force protection and identity verification for sensitive actions.",
        fields: [
            {
                fields: [
                    { kind: "list", label: "Modes", path: "regulation.modes", placeholder: "user" },
                    { kind: "number", label: "Maximum retries", min: 0, path: "regulation.max_retries" },
                    { kind: "text", label: "Find time", path: "regulation.find_time", placeholder: "2 minutes" },
                    { kind: "text", label: "Ban time", path: "regulation.ban_time", placeholder: "5 minutes" },
                ],
                kind: "group",
                label: "Regulation",
            },
            {
                fields: [
                    {
                        kind: "text",
                        label: "Reset password link lifespan",
                        path: "identity_validation.reset_password.jwt_lifespan",
                    },
                    {
                        kind: "password",
                        label: "Reset password JWT secret",
                        path: "identity_validation.reset_password.jwt_secret",
                    },
                    {
                        kind: "text",
                        label: "Code lifespan",
                        path: "identity_validation.elevated_session.code_lifespan",
                    },
                    {
                        kind: "text",
                        label: "Elevation lifespan",
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
        description: "How emails with one-time codes and password reset links are sent.",
        fields: [
            { kind: "bool", label: "Disable startup check", path: "notifier.disable_startup_check" },
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
                    { kind: "text", label: "Timeout", path: "notifier.smtp.timeout" },
                    { kind: "bool", label: "Disable HTML emails", path: "notifier.smtp.disable_html_emails" },
                    { kind: "bool", label: "Disable require TLS", path: "notifier.smtp.disable_require_tls" },
                    { kind: "bool", label: "Disable StartTLS", path: "notifier.smtp.disable_starttls" },
                ],
                kind: "group",
                label: "SMTP",
            },
            {
                fields: [{ kind: "text", label: "File name", path: "notifier.filesystem.filename", wide: true }],
                kind: "group",
                label: "File System",
            },
        ],
        id: "notifier",
        keys: ["notifier"],
        title: "Notifications",
    },
    {
        description: "The database used to store second factor registrations, logs and OpenID Connect sessions.",
        fields: [
            { kind: "password", label: "Encryption key", path: "storage.encryption_key", wide: true },
            {
                fields: [{ kind: "text", label: "Path", path: "storage.local.path", wide: true }],
                kind: "group",
                label: "SQLite",
            },
            {
                fields: [
                    { kind: "text", label: "Address", path: "storage.postgres.address" },
                    { kind: "text", label: "Database", path: "storage.postgres.database" },
                    { kind: "text", label: "Schema", path: "storage.postgres.schema" },
                    { kind: "text", label: "Username", path: "storage.postgres.username" },
                    { kind: "password", label: "Password", path: "storage.postgres.password" },
                    { kind: "text", label: "Timeout", path: "storage.postgres.timeout" },
                ],
                kind: "group",
                label: "PostgreSQL",
            },
            {
                fields: [
                    { kind: "text", label: "Address", path: "storage.mysql.address" },
                    { kind: "text", label: "Database", path: "storage.mysql.database" },
                    { kind: "text", label: "Username", path: "storage.mysql.username" },
                    { kind: "password", label: "Password", path: "storage.mysql.password" },
                    { kind: "text", label: "Timeout", path: "storage.mysql.timeout" },
                ],
                kind: "group",
                label: "MySQL",
            },
        ],
        id: "storage",
        keys: ["storage"],
        title: "Storage",
    },
    {
        description:
            "Single sign on for applications using OpenID Connect. Advanced client options are edited with the YAML editor.",
        fields: [
            { kind: "password", label: "HMAC secret", path: "identity_providers.oidc.hmac_secret", wide: true },
            {
                kind: "select",
                label: "Enforce PKCE",
                options: ["never", "public_clients_only", "always"],
                path: "identity_providers.oidc.enforce_pkce",
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
                    { kind: "text", label: "Access token", path: "identity_providers.oidc.lifespans.access_token" },
                    { kind: "text", label: "Authorize code", path: "identity_providers.oidc.lifespans.authorize_code" },
                    { kind: "text", label: "ID token", path: "identity_providers.oidc.lifespans.id_token" },
                    { kind: "text", label: "Refresh token", path: "identity_providers.oidc.lifespans.refresh_token" },
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
        title: "OpenID Connect",
    },
    {
        description: "Listener, NTP, metrics and the privacy policy.",
        fields: [
            {
                fields: [
                    { kind: "text", label: "Address", path: "server.address", placeholder: "tcp://:9091/" },
                    { kind: "text", label: "Asset path", path: "server.asset_path" },
                    { kind: "bool", label: "Disable health check", path: "server.disable_healthcheck" },
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
                    { kind: "text", label: "Maximum desync", path: "ntp.max_desync", placeholder: "3 seconds" },
                    { kind: "bool", label: "Disable startup check", path: "ntp.disable_startup_check" },
                    { kind: "bool", label: "Disable failure", path: "ntp.disable_failure" },
                ],
                kind: "group",
                label: "NTP",
            },
            {
                fields: [
                    { kind: "bool", label: "Enabled", path: "telemetry.metrics.enabled" },
                    { kind: "text", label: "Address", path: "telemetry.metrics.address", placeholder: "tcp://:9959/" },
                ],
                kind: "group",
                label: "Metrics",
            },
            {
                fields: [
                    { kind: "bool", label: "Enabled", path: "privacy_policy.enabled" },
                    { kind: "bool", label: "Require user acceptance", path: "privacy_policy.require_user_acceptance" },
                    { kind: "text", label: "Policy URL", path: "privacy_policy.policy_url", wide: true },
                ],
                kind: "group",
                label: "Privacy Policy",
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
            { kind: "text", label: "Administrator group", path: "administration.admin_group", placeholder: "admins" },
            { kind: "bool", label: "Disable restart", path: "administration.disable_restart" },
        ],
        id: "administration",
        keys: ["administration"],
        title: "Administration",
    },
];
