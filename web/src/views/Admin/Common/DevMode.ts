// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

/**
 * True when the administration UI runs on the Vite development server with authentication disabled (see dev/admin). It
 * is always false in production builds, and the backend also has to be a development build with authentication
 * disabled for the administration API to answer.
 */
export const adminDevNoAuth = import.meta.env.DEV && import.meta.env.VITE_ADMIN_DEV_NO_AUTH === "true";
