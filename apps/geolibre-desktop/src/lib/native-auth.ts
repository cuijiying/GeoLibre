// Native (self-hosted) sign-in gate for SaaS deployments that run their own
// account system against `geolibre_server_api` instead of federating to Clerk
// or Auth0 — the default for a self-operated SaaS where the identity provider
// is the same Postgres that stores projects.
//
// Configured with one URL (`VITE_GEOLIBRE_NATIVE_AUTH_URL`, the server API
// origin) plus an optional brand name for the sign-in screen. The browser
// talks to the API directly: `POST /api/accounts` (sign-up),
// `POST /api/auth/token` (sign-in), `DELETE /api/auth/token` (sign-out), and
// `GET /api/account` (session check + quota usage). The issued bearer token
// is the same credential the share client uses, so signing in once unlocks
// both the app and project sharing.

import { readDeploymentEnvValue, type EnvRecord } from "./deployment-env";

export const NATIVE_AUTH_URL_ENV = "VITE_GEOLIBRE_NATIVE_AUTH_URL";

export const BRAND_NAME_ENV = "VITE_GEOLIBRE_BRAND_NAME";

export const DEFAULT_BRAND_NAME = "GeoLibre Cloud GIS";

const TOKEN_STORAGE_KEY = "geolibre.native-auth.token";
const ACCOUNT_STORAGE_KEY = "geolibre.native-auth.account";

/** The account shape returned by the server API (see account_usage_json). */
export interface NativeAccount {
  id: string;
  username: string | null;
  plan: string;
  createdAt: string;
  projectCount?: number;
  projectLimit?: number | null;
}

/**
 * Resolve the self-hosted auth API origin for a web deployment.
 *
 * The URL receives the visitor's credentials, so it is validated the same way
 * the share and collab URLs are: HTTPS everywhere, HTTP only on loopback for
 * development. An invalid value is treated as "not configured" — refusing to
 * fall back to a plaintext endpoint is what keeps a paste error from silently
 * turning into a credential leak.
 *
 * `webApp` carries the same meaning as in clerk-auth.ts: a build-time fact,
 * never a runtime signal the visitor controls.
 */
export function resolveNativeAuthUrl(
  webApp: boolean,
  deploymentEnv?: EnvRecord,
  buildEnv?: EnvRecord,
): string | undefined {
  if (!webApp) return undefined;
  const raw = readDeploymentEnvValue(NATIVE_AUTH_URL_ENV, deploymentEnv, buildEnv)?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) {
      return url.origin;
    }
  } catch {
    // Fall through to undefined.
  }
  return undefined;
}

/**
 * Resolve the product name shown on the native sign-in screen.
 *
 * A SaaS operator rebrands the deployment without forking the UI; unset keeps
 * the default product name.
 */
export function resolveBrandName(
  deploymentEnv?: EnvRecord,
  buildEnv?: EnvRecord,
): string {
  return (
    readDeploymentEnvValue(BRAND_NAME_ENV, deploymentEnv, buildEnv)?.trim() ||
    DEFAULT_BRAND_NAME
  );
}

/** The stored session token, or null when signed out. */
export function readNativeToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode, disabled cookies); the gate then
    // behaves as signed out rather than crashing the boot.
    return null;
  }
}

function writeNativeSession(token: string, account: NativeAccount): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  } catch {
    // Best-effort persistence: the in-memory state still signs the visitor in
    // for this tab; only the reload restore is lost.
  }
}

/** Clear the stored session (sign-out, or a token the server rejected). */
export function clearNativeSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  } catch {
    // Ignore — clearing is best-effort.
  }
}

/** Extract the contract error string from an API response. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Non-JSON error body (proxy HTML, network reset): use the fallback.
  }
  return fallback;
}

/** Sign in with an existing account; persists the session on success. */
export async function nativeSignIn(
  apiUrl: string,
  username: string,
  password: string,
): Promise<NativeAccount> {
  const response = await fetch(`${apiUrl}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, `sign-in failed (${response.status})`));
  }
  const body = (await response.json()) as { account: NativeAccount; token: string };
  writeNativeSession(body.token, body.account);
  return body.account;
}

/** Register a new account; persists the session on success. */
export async function nativeSignUp(
  apiUrl: string,
  username: string,
  password: string,
): Promise<NativeAccount> {
  const response = await fetch(`${apiUrl}/api/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, `sign-up failed (${response.status})`));
  }
  const body = (await response.json()) as { account: NativeAccount; token: string };
  writeNativeSession(body.token, body.account);
  return body.account;
}

/**
 * Validate a stored token and refresh the cached account (quota usage
 * included). Returns null when the token is invalid or expired, clearing the
 * stored session so the next boot does not retry it.
 */
export async function fetchNativeAccount(
  apiUrl: string,
  token: string,
): Promise<NativeAccount | null> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Network failure: keep the session and let the caller decide (the gate
    // shows a retry screen rather than discarding the token).
    throw new Error("network error reaching the auth server");
  }
  if (response.status === 401) {
    clearNativeSession();
    return null;
  }
  if (!response.ok) {
    throw new Error(await readError(response, `account check failed (${response.status})`));
  }
  const body = (await response.json()) as { account: NativeAccount };
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(body.account));
  } catch {
    // Best-effort cache refresh.
  }
  return body.account;
}

/** Sign out: revoke the token server-side (best effort) and clear locally. */
export async function nativeSignOut(apiUrl: string, token: string): Promise<void> {
  try {
    await fetch(`${apiUrl}/api/auth/token`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } finally {
    clearNativeSession();
  }
}
