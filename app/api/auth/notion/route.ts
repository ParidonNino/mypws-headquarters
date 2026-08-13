import {
  authConfigError,
  callbackUrl,
  effectiveOrigin,
  isSecureRequest,
  readAuthConfig,
} from "../../../../lib/auth-config";
import { notionAuthorizeUrl } from "../../../../lib/notion-oauth";
import { randomState, stateCookie } from "../../../../lib/session";

/** Starts the Notion OAuth login. */
export async function GET(request: Request) {
  const config = readAuthConfig(process.env);
  const configError = authConfigError(config);
  if (configError) {
    return new Response(configError, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Cookies are scoped per host, and 127.0.0.1 and localhost are different
  // hosts. Starting the login on one and returning to the other would drop the
  // state cookie and fail with "ongeldige aanmeldpoging". Send the browser to
  // the canonical origin first so the cookie is always set where the callback
  // will look for it.
  if (config.appOrigin) {
    // Must use the origin the *browser* sees, not the one we were spoken to on.
    // Behind the proxy those differ, and comparing the internal one would
    // redirect to APP_ORIGIN forever.
    const requestOrigin = effectiveOrigin(request, config);
    if (requestOrigin !== config.appOrigin) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL("/api/auth/notion", config.appOrigin).toString(),
        },
      });
    }
  }

  const state = randomState();
  const location = notionAuthorizeUrl({
    clientId: config.clientId!,
    redirectUri: callbackUrl(config, request),
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Round-trip the state through a short-lived cookie so the callback can
      // prove the response belongs to a login this browser actually started.
      "Set-Cookie": stateCookie(state, isSecureRequest(request, config)),
    },
  });
}
