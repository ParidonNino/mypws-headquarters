import {
  authConfigError,
  callbackUrl,
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

  const state = randomState();
  const location = notionAuthorizeUrl({
    clientId: config.clientId!,
    redirectUri: callbackUrl(config, request.url),
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Round-trip the state through a short-lived cookie so the callback can
      // prove the response belongs to a login this browser actually started.
      "Set-Cookie": stateCookie(state, isSecureRequest(request.url)),
    },
  });
}
