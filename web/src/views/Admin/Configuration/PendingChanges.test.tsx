// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from "@testing-library/react";

import { AdminPendingChange, cancelAdminPendingChange, getAdminPendingChanges } from "@services/Admin";
import PendingChanges, { pendingPollInterval } from "@views/Admin/Configuration/PendingChanges";

const mocks = vi.hoisted(() => ({
    createErrorNotification: vi.fn(),
    createInfoNotification: vi.fn(),
    createSuccessNotification: vi.fn(),
    handleError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: mocks.createErrorNotification,
        createInfoNotification: mocks.createInfoNotification,
        createSuccessNotification: mocks.createSuccessNotification,
    }),
}));

vi.mock("@views/Admin/Common/AdminContext", () => ({
    useAdminErrorHandler: () => mocks.handleError,
}));

vi.mock("@services/Admin", () => ({
    cancelAdminPendingChange: vi.fn(),
    getAdminPendingChanges: vi.fn(),
}));

const getMock = vi.mocked(getAdminPendingChanges);
const cancelMock = vi.mocked(cancelAdminPendingChange);

const change = (status: AdminPendingChange["status"]): AdminPendingChange => ({
    command: "authelia admin changes apply k3f9x2ab",
    created: "2026-10-20T10:00:00Z",
    expires: "2026-10-21T10:00:00Z",
    id: "k3f9x2ab",
    path: "/config/configuration.yml",
    reasons: ["uses the environment variable 'DB_HOST', which the configuration doesn't use yet"],
    status,
    username: "john",
});

describe("PendingChanges", () => {
    beforeEach(() => {
        // Only the polling is faked, React and the testing library use timeouts themselves.
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows a pending change with its reasons and command", async () => {
        getMock.mockResolvedValue([change("pending")]);

        render(<PendingChanges refresh={0} onApplied={vi.fn()} />);

        await act(async () => {});

        expect(screen.getByText("A change waits for a confirmation on the server")).toBeInTheDocument();
        expect(screen.getByText(/uses the environment variable 'DB_HOST'/)).toBeInTheDocument();
        expect(screen.getByText("authelia admin changes apply k3f9x2ab")).toBeInTheDocument();
    });

    it.each([
        ["applied", "createSuccessNotification", "The change was confirmed on the server", true],
        ["rejected", "createErrorNotification", "The change was rejected on the server", false],
        ["expired", "createInfoNotification", "The change expired before it was confirmed", false],
    ] as const)("reports when the change was %s on the server", async (status, notification, message, applied) => {
        const onApplied = vi.fn();

        getMock.mockResolvedValueOnce([change("pending")]).mockResolvedValue([change(status)]);

        render(<PendingChanges refresh={0} onApplied={onApplied} />);

        await act(async () => {});
        await act(async () => {
            await vi.advanceTimersByTimeAsync(pendingPollInterval);
        });

        expect(mocks[notification]).toHaveBeenCalledWith(message);
        expect(onApplied).toHaveBeenCalledTimes(applied ? 1 : 0);
        expect(screen.queryByText("A change waits for a confirmation on the server")).not.toBeInTheDocument();

        // Nothing waits anymore, so it stops checking.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(pendingPollInterval * 3);
        });

        expect(getMock).toHaveBeenCalledTimes(2);
    });

    it("doesn't report changes which were decided before they were shown", async () => {
        const onApplied = vi.fn();

        getMock.mockResolvedValue([change("applied")]);

        render(<PendingChanges refresh={0} onApplied={onApplied} />);

        await act(async () => {});

        expect(onApplied).not.toHaveBeenCalled();
        expect(mocks.createSuccessNotification).not.toHaveBeenCalled();
    });

    it("withdraws a change", async () => {
        getMock.mockResolvedValue([change("pending")]);
        cancelMock.mockResolvedValue(undefined);

        render(<PendingChanges refresh={0} onApplied={vi.fn()} />);

        await act(async () => {});
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
        });

        expect(cancelMock).toHaveBeenCalledWith("k3f9x2ab");
        expect(screen.queryByText("A change waits for a confirmation on the server")).not.toBeInTheDocument();
    });

    it("loads the changes again when one was submitted", async () => {
        getMock.mockResolvedValue([]);

        const { rerender } = render(<PendingChanges refresh={0} onApplied={vi.fn()} />);

        await act(async () => {});

        getMock.mockResolvedValue([change("pending")]);
        rerender(<PendingChanges refresh={1} onApplied={vi.fn()} />);

        await act(async () => {});

        expect(screen.getByText("A change waits for a confirmation on the server")).toBeInTheDocument();
    });
});
