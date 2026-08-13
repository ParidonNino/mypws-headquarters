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
  /**
   * Set only when a reverse proxy terminates TLS in front of the app. Without
   * it the X-Forwarded-* headers are ignored, because any client can send them.
   */
  trustProxy: boolean;
};

export type AuthEnv = {
  NOTION_OAUTH_CLIENT_ID?: string;
  NOTION_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  NOTION_WORKSPACE_ID?: string;
  ALLOWED_EMAILS?: string;
  APP_ORIGIN?: string;
  AUTH_DISABLED?: string;
  TRUST_PROXY?: string;
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
    trustProxy: source.TRUST_PROXY === "true",
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
/**
 * Whether the browser reached us over TLS.
 *
 * Behind a TLS-terminating proxy the app itself is spoken to over plain http,
 * so the browser's real scheme survives only in X-Forwarded-Proto. That header
 * is honoured solely when TRUST_PROXY says a proxy is actually in front —
 * otherwise any client could set it and flip the cookie flags.
 */
export function isSecureRequest(request: Request, config: AuthConfig) {
  if (new URL(request.url).protocol === "https:") return true;
  if (!config.trustProxy) return false;
  const forwarded = request.headers.get("x-forwarded-proto");
  // Proxy chains append, so the client-facing value is the first entry.
  return forwarded?.split(",")[0]?.trim().toLowerCase() === "https";
}

/** The origin the browser sees, which behind a proxy is not the one we serve. */
export function effectiveOrigin(request: Request, config: AuthConfig) {
  const url = new URL(request.url);
  const protocol = isSecureRequest(request, config) ? "https:" : url.protocol;
  const host =
    (config.trustProxy && request.headers.get("x-forwarded-host")) || url.host;
  return `${protocol}//${host}`;
}

export function callbackUrl(config: AuthConfig, request: Request) {
  const origin = config.appOrigin ?? effectiveOrigin(request, config);
  return new URL("/api/auth/notion/callback", origin).toString();
}
