// Shared reader for the auth-related environment variables, so the worker gate
// and the route handlers cannot disagree about what "configured" means.

export type AuthConfig = {
  clientId?: string;
  clientSecret?: string;
  sessionSecret?: string;
  workspaceId?: string;
  allowedEmails?: string;
  appOrigin?: string;
  /**
   * Explicit, deliberate opt-out for working on the UI before the Notion
   * integration exists. Off unless the value is exactly "true". Never set this
   * on anything reachable from outside your machine.
   */
  disabled: boolean;
};

export type AuthEnv = {
  NOTION_OAUTH_CLIENT_ID?: string;
  NOTION_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  NOTION_WORKSPACE_ID?: string;
  ALLOWED_EMAILS?: string;
  APP_ORIGIN?: string;
  AUTH_DISABLED?: string;
};

/**
 * Accepts either the worker's typed `Env` binding or a bare environment record
 * such as `process.env`. The union is needed because an all-optional type is a
 * "weak type" in TypeScript, which an index-signature type cannot satisfy.
 */
export function readAuthConfig(
  source: AuthEnv | Record<string, string | undefined>,
): AuthConfig {
  return {
    clientId: source.NOTION_OAUTH_CLIENT_ID || undefined,
    clientSecret: source.NOTION_OAUTH_CLIENT_SECRET || undefined,
    sessionSecret: source.SESSION_SECRET || undefined,
    workspaceId: source.NOTION_WORKSPACE_ID || undefined,
    allowedEmails: source.ALLOWED_EMAILS || undefined,
    appOrigin: source.APP_ORIGIN || undefined,
    disabled: source.AUTH_DISABLED === "true",
  };
}

/**
 * Returns a human-readable reason when login cannot work, else null. Missing
 * configuration fails closed: an unconfigured app refuses requests rather than
 * serving the planner — and the Notion token behind it — to anyone.
 */
export function authConfigError(config: AuthConfig) {
  const missing: string[] = [];
  if (!config.clientId) missing.push("NOTION_OAUTH_CLIENT_ID");
  if (!config.clientSecret) missing.push("NOTION_OAUTH_CLIENT_SECRET");
  if (!config.sessionSecret) missing.push("SESSION_SECRET");

  // At least one audience restriction is mandatory. Notion OAuth authenticates
  // any Notion account in any workspace, so with neither of these set the login
  // would prove only "is a Notion user" — which is not a restriction at all.
  if (!config.workspaceId && !config.allowedEmails) {
    missing.push("NOTION_WORKSPACE_ID of ALLOWED_EMAILS");
  }

  if (missing.length === 0) return null;
  return (
    `Aanmelden via Notion is niet geconfigureerd. Ontbrekend: ${missing.join(", ")}. ` +
    "Zie README.md, sectie \"Aanmelden via Notion\"."
  );
}

/**
 * The redirect_uri handed to Notion. Prefer APP_ORIGIN so the value cannot be
 * steered by a forged Host header; fall back to the request's own origin for
 * local development.
 */
export function callbackUrl(config: AuthConfig, requestUrl: string) {
  const origin = config.appOrigin ?? new URL(requestUrl).origin;
  return new URL("/api/auth/notion/callback", origin).toString();
}

export function isSecureRequest(requestUrl: string) {
  return new URL(requestUrl).protocol === "https:";
}
