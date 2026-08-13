// Stateless signed-cookie sessions.
//
// The session is an HMAC-SHA256-signed payload carried in an HttpOnly cookie.
// Nothing is stored server-side, which matters here: db/schema.ts is empty and
// .openai/hosting.json has d1: null, so there is no session store to use. The
// Notion OAuth access token is deliberately NOT kept — it is used once during
// login to establish identity and then discarded.
//
// Web Crypto is used rather than node:crypto so the same code runs in the
// Cloudflare Workers runtime and under `vinext dev`.

const SESSION_COOKIE = "powerselect_session";
const STATE_COOKIE = "powerselect_oauth_state";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type Session = {
  /** Verified email of the Notion account that authorised this session. */
  email: string;
  /** Notion user id, used to match the Owner property on roadmap tasks. */
  userId: string;
  /** Expiry, seconds since epoch. */
  exp: number;
};

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  session: Omit<Session, "exp">,
  secret: string,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
) {
  const payload: Session = {
    ...session,
    exp: Math.floor(Date.now() / 1_000) + maxAgeSeconds,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Returns the session when the signature is valid and unexpired, else null.
 * crypto.subtle.verify is used rather than a string comparison so the check is
 * not timing-dependent.
 */
export async function verifySessionToken(
  token: string | null | undefined,
  secret: string | undefined,
): Promise<Session | null> {
  if (!token || !secret) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!body || !signature) return null;

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlDecode(signature),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as Partial<Session>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Math.floor(Date.now() / 1_000)
    ) {
      return null;
    }
    return { email: parsed.email, userId: parsed.userId, exp: parsed.exp };
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function readSessionCookie(cookieHeader: string | null) {
  return readCookie(cookieHeader, SESSION_COOKIE);
}

export function readStateCookie(cookieHeader: string | null) {
  return readCookie(cookieHeader, STATE_COOKIE);
}

/**
 * `Secure` is set only for https requests: the intended local setup serves
 * http://127.0.0.1:3000, where a Secure cookie would be silently dropped.
 * SameSite=Lax so the cookie survives the top-level redirect back from Notion.
 */
function cookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function sessionCookie(
  token: string,
  secure: boolean,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
) {
  return cookie(SESSION_COOKIE, token, maxAgeSeconds, secure);
}

export function stateCookie(state: string, secure: boolean) {
  return cookie(STATE_COOKIE, state, 600, secure);
}

export function clearedCookie(name: string, secure: boolean) {
  return cookie(name, "", 0, secure);
}

export function clearedSessionCookie(secure: boolean) {
  return clearedCookie(SESSION_COOKIE, secure);
}

export function clearedStateCookie(secure: boolean) {
  return clearedCookie(STATE_COOKIE, secure);
}

export function randomState() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)));
}

export const cookieNames = {
  session: SESSION_COOKIE,
  state: STATE_COOKIE,
};
