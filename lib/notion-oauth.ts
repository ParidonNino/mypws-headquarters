// Notion OAuth 2.0 (public integration) used purely as a login mechanism.
//
// Flow: redirect to Notion -> user authorises -> Notion redirects back with a
// code -> exchange it for an access token -> call /v1/users/me to read the
// authorising account's verified email and user id -> discard the token.
//
// The access token is not retained. Roadmap reads and writes keep using the
// single NOTION_TOKEN integration credential, so every signed-in user sees the
// same roadmap regardless of which pages they happened to tick in the OAuth
// picker.

const NOTION_VERSION = "2026-03-11";
const AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const ME_URL = "https://api.notion.com/v1/users/me";

export type NotionIdentity = {
  email: string;
  userId: string;
  workspaceId: string;
  workspaceName: string | null;
};

export function notionAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  // owner=user is required for the token response to describe a person rather
  // than a workspace-owned bot, which is what makes identity available.
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", options.state);
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  workspace_id?: string;
  workspace_name?: string | null;
};

export async function exchangeNotionCode(options: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<
  | { ok: true; accessToken: string; workspaceId: string; workspaceName: string | null }
  | { ok: false; error: string }
> {
  const credentials = btoa(`${options.clientId}:${options.clientSecret}`);
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: options.code,
        redirect_uri: options.redirectUri,
      }),
    });
  } catch {
    return { ok: false, error: "Notion niet bereikbaar" };
  }

  if (!response.ok) {
    return { ok: false, error: "Notion weigerde de aanmelding" };
  }

  const payload = (await response.json()) as TokenResponse;
  if (!payload.access_token || !payload.workspace_id) {
    return { ok: false, error: "Onvolledig antwoord van Notion" };
  }

  return {
    ok: true,
    accessToken: payload.access_token,
    workspaceId: payload.workspace_id,
    workspaceName: payload.workspace_name ?? null,
  };
}

type MeResponse = {
  bot?: {
    owner?: {
      type?: string;
      user?: {
        id?: string;
        person?: { email?: string };
      };
    };
  };
};

/**
 * Reads the authorising person from GET /v1/users/me. For an OAuth token
 * created with owner=user, bot.owner.user.person.email is the account's
 * verified email address.
 */
export async function fetchNotionIdentity(
  accessToken: string,
  workspaceId: string,
  workspaceName: string | null,
): Promise<{ ok: true; identity: NotionIdentity } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(ME_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": NOTION_VERSION,
      },
    });
  } catch {
    return { ok: false, error: "Notion niet bereikbaar" };
  }

  if (!response.ok) {
    return { ok: false, error: "Kon de Notion-gebruiker niet ophalen" };
  }

  const payload = (await response.json()) as MeResponse;
  const email = payload.bot?.owner?.user?.person?.email;
  const userId = payload.bot?.owner?.user?.id;
  if (!email || !userId) {
    return {
      ok: false,
      error:
        "Deze integratie hoort niet bij een persoonlijk account. " +
        "Autoriseer opnieuw met owner=user.",
    };
  }

  return {
    ok: true,
    identity: {
      email: email.toLowerCase(),
      userId,
      workspaceId,
      workspaceName,
    },
  };
}

/**
 * Gate on workspace first: anyone who can authorise against the Powerselect
 * workspace is in. ALLOWED_EMAILS narrows that further when set, and is
 * ignored when empty so the workspace check stays the single source of truth.
 */
export function isAllowedIdentity(
  identity: NotionIdentity,
  options: { expectedWorkspaceId?: string; allowedEmails?: string },
) {
  if (
    options.expectedWorkspaceId &&
    identity.workspaceId !== options.expectedWorkspaceId
  ) {
    return false;
  }

  const allowed = (options.allowedEmails ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(identity.email);
}
