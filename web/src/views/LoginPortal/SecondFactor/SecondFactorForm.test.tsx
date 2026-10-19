// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { SecondFactorMethod } from "@models/Methods";
import { AuthenticationLevel } from "@services/State";
import { setPreferred2FAMethod } from "@services/UserInfo";
import SecondFactorForm from "@views/LoginPortal/SecondFactor/SecondFactorForm";

const mocks = vi.hoisted(() => ({
    createErrorNotification: vi.fn(),
    flowPresent: false,
    localStorageMethodAvailable: false,
    navigate: vi.fn(),
    setLocalStorageMethod: vi.fn(),
    supportsWebAuthn: true,
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@simplewebauthn/browser", () => ({
    browserSupportsWebAuthn: () => mocks.supportsWebAuthn,
}));

vi.mock("@contexts/LocalStorageMethodContext", () => ({
    useLocalStorageMethodContext: () => ({
        localStorageMethodAvailable: mocks.localStorageMethodAvailable,
        setLocalStorageMethod: mocks.setLocalStorageMethod,
    }),
}));

vi.mock("@hooks/Flow", () => ({
    useFlowPresent: () => mocks.flowPresent,
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: mocks.createErrorNotification,
    }),
}));

vi.mock("@hooks/RouterNavigate", () => ({
    useRouterNavigate: () => mocks.navigate,
}));

vi.mock("@constants/Routes", () => ({
    SecondFactorPasswordSubRoute: "/password",
    SecondFactorPushSubRoute: "/push",
    SecondFactorTOTPSubRoute: "/totp",
    SecondFactorWebAuthnSubRoute: "/webauthn",
    SettingsRoute: "/settings",
    SettingsTwoFactorAuthenticationSubRoute: "/2fa",
}));

vi.mock("@services/UserInfo", () => ({
    setPreferred2FAMethod: vi.fn(),
}));

vi.mock("@layouts/LoginLayout", () => ({
    default: (props: any) => (
        <div data-testid="login-layout" data-title={props.title}>
            {props.lead}
            {props.children}
        </div>
    ),
}));

vi.mock("@components/LogoutButton", () => ({
    default: () => <button data-testid="logout-button">Logout</button>,
}));

vi.mock("@components/SwitchUserButton", () => ({
    default: () => <button data-testid="switch-user-button">Switch User</button>,
}));

vi.mock("@views/LoginPortal/SecondFactor/OneTimePasswordMethod", () => ({
    default: (props: any) => (
        <div data-testid="otp-method" data-registered={String(props.registered)}>
            <button data-testid="otp-register" onClick={() => props.onRegisterClick()} />
            <button data-testid="otp-error" onClick={() => props.onSignInError(new Error("otp failed"))} />
            <button data-testid="otp-success" onClick={() => props.onSignInSuccess("https://example.com")} />
        </div>
    ),
}));

vi.mock("@views/LoginPortal/SecondFactor/WebAuthnMethod", () => ({
    default: (props: any) => (
        <div data-testid="webauthn-method" data-registered={String(props.registered)}>
            <button data-testid="webauthn-register" onClick={() => props.onRegisterClick()} />
            <button data-testid="webauthn-error" onClick={() => props.onSignInError(new Error("key failed"))} />
            <button data-testid="webauthn-success" onClick={() => props.onSignInSuccess("https://example.com")} />
        </div>
    ),
}));

vi.mock("@views/LoginPortal/SecondFactor/PushNotificationMethod", () => ({
    default: (props: any) => (
        <div data-testid="push-method" data-self-enrollment={String(props.duoSelfEnrollment)}>
            <button data-testid="push-selection" onClick={() => props.onSelectionClick()} />
            <button data-testid="push-error" onClick={() => props.onSignInError(new Error("push failed"))} />
            <button data-testid="push-success" onClick={() => props.onSignInSuccess("https://example.com")} />
        </div>
    ),
}));

vi.mock("@views/LoginPortal/SecondFactor/PasswordMethod", () => ({
    default: (props: any) => (
        <div data-testid="password-method">
            <button data-testid="password-success" onClick={() => props.onAuthenticationSuccess(undefined)} />
        </div>
    ),
}));

const setPreferredMock = vi.mocked(setPreferred2FAMethod);

const defaultProps = {
    authenticationLevel: AuthenticationLevel.OneFactor,
    configuration: { available_methods: new Set([SecondFactorMethod.TOTP, SecondFactorMethod.WebAuthn]) },
    duoSelfEnrollment: false,
    factorKnowledge: true,
    onAuthenticationSuccess: vi.fn(),
    onMethodChanged: vi.fn(),
    userInfo: {
        display_name: "John",
        has_duo: false,
        has_totp: true,
        has_webauthn: true,
    },
} as any;

function renderForm(props: Record<string, any> = {}, route = "/totp") {
    const merged = {
        ...defaultProps,
        onAuthenticationSuccess: vi.fn(),
        onMethodChanged: vi.fn(),
        ...props,
    };

    return {
        ...render(
            <MemoryRouter initialEntries={[route]}>
                <SecondFactorForm {...merged} />
            </MemoryRouter>,
        ),
        props: merged,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.flowPresent = false;
    mocks.localStorageMethodAvailable = false;
    mocks.supportsWebAuthn = true;
    setPreferredMock.mockResolvedValue(undefined as any);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("rendering", () => {
    it("renders login layout with the signed in user", async () => {
        renderForm();
        expect(await screen.findByTestId("login-layout")).toHaveAttribute("data-title", "Confirm it's you");
        expect(screen.getByText("John")).toBeInTheDocument();
        expect(screen.getByTestId("logout-button")).toBeInTheDocument();
    });

    it("renders a tab per method when multiple methods are available", () => {
        renderForm();
        expect(screen.getByRole("tablist")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Code" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Security Key" })).toHaveAttribute("aria-selected", "false");
    });

    it("does not render tabs when only one method available", () => {
        renderForm({ configuration: { available_methods: new Set([SecondFactorMethod.TOTP]) } });
        expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });

    it("does not render tabs without the knowledge factor", () => {
        renderForm({ factorKnowledge: false });
        expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });

    it("offers to switch the user instead of signing out when a flow is present", () => {
        mocks.flowPresent = true;

        renderForm();

        expect(screen.getByTestId("switch-user-button")).toBeInTheDocument();
        expect(screen.queryByTestId("logout-button")).not.toBeInTheDocument();
    });

    it("hides the switch user button without a flow", () => {
        renderForm();
        expect(screen.queryByTestId("switch-user-button")).not.toBeInTheDocument();
    });

    it("leaves out the security key when the browser doesn't support WebAuthn", () => {
        mocks.supportsWebAuthn = false;

        renderForm();

        expect(screen.queryByRole("tab", { name: "Security Key" })).not.toBeInTheDocument();
    });
});

describe("method routes", () => {
    it("renders the one-time password method", async () => {
        renderForm({}, "/totp");
        expect(await screen.findByTestId("otp-method")).toHaveAttribute("data-registered", "true");
    });

    it("renders the WebAuthn method", async () => {
        renderForm({}, "/webauthn");
        expect(await screen.findByTestId("webauthn-method")).toHaveAttribute("data-registered", "true");
    });

    it("renders the push notification method", async () => {
        renderForm({ duoSelfEnrollment: true }, "/push");
        expect(await screen.findByTestId("push-method")).toHaveAttribute("data-self-enrollment", "true");
    });

    it("renders the password method", async () => {
        renderForm({}, "/password");
        expect(await screen.findByTestId("password-method")).toBeInTheDocument();
    });
});

describe("method callbacks", () => {
    it("navigates to the settings page to register a one-time password", async () => {
        renderForm({}, "/totp");
        await screen.findByTestId("otp-method");

        fireEvent.click(screen.getByTestId("otp-register"));

        expect(mocks.navigate).toHaveBeenCalledWith("/settings/2fa");
    });

    it("navigates to the settings page to register a WebAuthn credential", async () => {
        renderForm({}, "/webauthn");
        await screen.findByTestId("webauthn-method");

        fireEvent.click(screen.getByTestId("webauthn-register"));

        expect(mocks.navigate).toHaveBeenCalledWith("/settings/2fa");
    });

    it("surfaces one-time password errors as notifications", async () => {
        renderForm({}, "/totp");
        await screen.findByTestId("otp-method");

        fireEvent.click(screen.getByTestId("otp-error"));

        expect(mocks.createErrorNotification).toHaveBeenCalledWith("otp failed");
    });

    it("surfaces WebAuthn errors as notifications", async () => {
        renderForm({}, "/webauthn");
        await screen.findByTestId("webauthn-method");

        fireEvent.click(screen.getByTestId("webauthn-error"));

        expect(mocks.createErrorNotification).toHaveBeenCalledWith("key failed");
    });

    it("surfaces push errors as notifications", async () => {
        renderForm({}, "/push");
        await screen.findByTestId("push-method");

        fireEvent.click(screen.getByTestId("push-error"));

        expect(mocks.createErrorNotification).toHaveBeenCalledWith("push failed");
    });

    it("forwards a successful one-time password sign in", async () => {
        const { props } = renderForm({}, "/totp");
        await screen.findByTestId("otp-method");

        fireEvent.click(screen.getByTestId("otp-success"));

        expect(props.onAuthenticationSuccess).toHaveBeenCalledWith("https://example.com");
    });

    it("forwards a successful password sign in", async () => {
        const { props } = renderForm({}, "/password");
        await screen.findByTestId("password-method");

        fireEvent.click(screen.getByTestId("password-success"));

        expect(props.onAuthenticationSuccess).toHaveBeenCalledWith(undefined);
    });

    it("reports a Duo device selection as a method change", async () => {
        const { props } = renderForm({}, "/push");
        await screen.findByTestId("push-method");

        fireEvent.click(screen.getByTestId("push-selection"));

        expect(props.onMethodChanged).toHaveBeenCalled();
    });
});

describe("method selection", () => {
    it("persists the method on the server when local storage is unavailable", async () => {
        const { props } = renderForm();

        fireEvent.click(screen.getByRole("tab", { name: "Security Key" }));

        await waitFor(() => expect(setPreferredMock).toHaveBeenCalledWith(SecondFactorMethod.WebAuthn));
        expect(mocks.setLocalStorageMethod).not.toHaveBeenCalled();
        await waitFor(() => expect(props.onMethodChanged).toHaveBeenCalled());
    });

    it("stores the method locally when local storage is available", async () => {
        mocks.localStorageMethodAvailable = true;

        const { props } = renderForm();

        fireEvent.click(screen.getByRole("tab", { name: "Security Key" }));

        await waitFor(() => expect(mocks.setLocalStorageMethod).toHaveBeenCalledWith(SecondFactorMethod.WebAuthn));
        expect(setPreferredMock).not.toHaveBeenCalled();
        await waitFor(() => expect(props.onMethodChanged).toHaveBeenCalled());
    });

    it("notifies when the preferred method cannot be persisted", async () => {
        setPreferredMock.mockRejectedValue(new Error("boom"));

        const { props } = renderForm();

        fireEvent.click(screen.getByRole("tab", { name: "Security Key" }));

        await waitFor(() =>
            expect(mocks.createErrorNotification).toHaveBeenCalledWith(
                "There was an issue updating preferred second factor method",
            ),
        );
        await waitFor(() => expect(props.onMethodChanged).toHaveBeenCalled());
    });

    it("does nothing when the current method's tab is clicked", () => {
        const { props } = renderForm();

        fireEvent.click(screen.getByRole("tab", { name: "Code" }));

        expect(setPreferredMock).not.toHaveBeenCalled();
        expect(props.onMethodChanged).not.toHaveBeenCalled();
    });
});
