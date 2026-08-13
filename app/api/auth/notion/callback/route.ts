import {
  authConfigError,
  callbackUrl,
  isSecureRequest,
  readAuthConfig,
} from "../../../../../lib/auth-config";
import {
  exchangeNotionCode,
  fetchNotionIdentity,
  isAllowedIdentity,
} from "../../../../../lib/notion-oauth";
import {
  clearedStateCookie,
  createSessionToken,
  readStateCookie,
  sessionCookie,
} from "../../../../../lib/session";

function failure(message: string, status: number, secure: boolean) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Set-Cookie": clearedStateCookie(secure),
    },
  });
}

/** Completes the Notion OAuth login and issues the session cookie. */
export async function GET(request: Request) {
  const config = readAuthConfig(process.env);
  const secure = isSecureRequest(request, config);

  const configError = authConfigError(config);
  if (configError) return failure(configError, 503, secure);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readStateCookie(request.headers.get("cookie"));

  if (url.searchParams.get("error")) {
    return failure("Aanmelden bij Notion is afgebroken.", 400, secure);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    // A state cookie is single-use: any earlier failure clears it. Refreshing
    // this URL therefore lands here rather than showing the real error, so say
    // where to restart instead of just "probeer opnieuw".
    return failure(
      "Ongeldige of verlopen aanmeldpoging.\n\n" +
        "Deze pagina kun je niet verversen — een aanmeldpoging is eenmalig. " +
        "Begin opnieuw op / en let op de foutmelding van de eerste poging.",
      400,
      secure,
    );
  }

  const token = await exchangeNotionCode({
    code,
    redirectUri: callbackUrl(config, request),
    clientId: config.clientId!,
    clientSecret: config.clientSecret!,
  });
  if (!token.ok) return failure(token.error, 502, secure);

  const identity = await fetchNotionIdentity(
    token.accessToken,
    token.workspaceId,
    token.workspaceName,
  );
  if (!identity.ok) return failure(identity.error, 502, secure);

  // Bootstrap aid: workspace_id cannot be known before a first login, so log it
  // once while it is still unset. It is an identifier, not a credential.
  if (!config.workspaceId) {
    console.info(
      `[auth] Notion workspace "${identity.identity.workspaceName ?? "?"}" ` +
        `heeft id ${identity.identity.workspaceId}. ` +
        "Zet dit als NOTION_WORKSPACE_ID in .env.local.",
    );
  }

  if (
    !isAllowedIdentity(identity.identity, {
      expectedWorkspaceId: config.workspaceId,
      allowedEmails: config.allowedEmails,
    })
  ) {
    // Name the account and the workspace that were rejected. Without this the
    // only symptom is a bare 403, and the usual cause — signing in with a
    // different address than the one on the allowlist — is invisible.
    return failure(
      "Dit Notion-account heeft geen toegang tot deze planner.\n\n" +
        `Aangemeld als: ${identity.identity.email}\n` +
        `Workspace:     ${identity.identity.workspaceId}\n\n` +
        "Zet dit adres in ALLOWED_EMAILS, of zet de workspace in " +
        "NOTION_WORKSPACE_ID en maak ALLOWED_EMAILS leeg om iedereen uit die " +
        "workspace toe te laten. Herstart daarna de container.",
      403,
      secure,
    );
  }

  // The OAuth access token has served its purpose — identity — and is not kept.
  const sessionToken = await createSessionToken(
    { email: identity.identity.email, userId: identity.identity.userId },
    config.sessionSecret!,
  );

  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", sessionCookie(sessionToken, secure));
  headers.append("Set-Cookie", clearedStateCookie(secure));
  return new Response(null, { status: 302, headers });
}
