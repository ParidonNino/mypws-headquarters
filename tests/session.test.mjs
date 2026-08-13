import assert from "node:assert/strict";
import test from "node:test";

import {
  clearedSessionCookie,
  createSessionToken,
  randomState,
  readSessionCookie,
  readStateCookie,
  sessionCookie,
  stateCookie,
  verifySessionToken,
} from "../lib/session.ts";
import { isAllowedIdentity } from "../lib/notion-oauth.ts";

const SECRET = "unit-test-secret";
const identity = {
  email: "nino.van.paridon@powerselect.app",
  userId: "39641e9d-4d52-8104-a73a-ff053b6c5c4c",
};

test("round-trips a session through sign and verify", async () => {
  const token = await createSessionToken(identity, SECRET);
  const session = await verifySessionToken(token, SECRET);

  assert.ok(session);
  assert.equal(session.email, identity.email);
  assert.equal(session.userId, identity.userId);
  assert.ok(session.exp > Math.floor(Date.now() / 1_000));
});

test("rejects a token signed with a different secret", async () => {
  const token = await createSessionToken(identity, SECRET);
  assert.equal(await verifySessionToken(token, "other-secret"), null);
});

test("rejects a tampered payload", async () => {
  const token = await createSessionToken(identity, SECRET);
  const [, signature] = token.split(".");

  // Re-encode the payload with an escalated email, keeping the old signature.
  const forgedPayload = Buffer.from(
    JSON.stringify({
      email: "attacker@example.com",
      userId: identity.userId,
      exp: Math.floor(Date.now() / 1_000) + 3_600,
    }),
  ).toString("base64url");

  assert.equal(
    await verifySessionToken(`${forgedPayload}.${signature}`, SECRET),
    null,
  );
});

test("rejects an expired session", async () => {
  const token = await createSessionToken(identity, SECRET, -1);
  assert.equal(await verifySessionToken(token, SECRET), null);
});

test("rejects malformed and empty tokens", async () => {
  for (const value of [null, undefined, "", "no-separator", ".", "a.", ".b"]) {
    assert.equal(await verifySessionToken(value, SECRET), null, `${value}`);
  }
});

test("refuses to verify when no secret is configured", async () => {
  const token = await createSessionToken(identity, SECRET);
  assert.equal(await verifySessionToken(token, undefined), null);
  assert.equal(await verifySessionToken(token, ""), null);
});

test("reads the right cookie out of a combined header", async () => {
  const header =
    "other=1; powerselect_session=abc%20def; powerselect_oauth_state=xyz";
  assert.equal(readSessionCookie(header), "abc def");
  assert.equal(readStateCookie(header), "xyz");
  assert.equal(readSessionCookie(null), null);
  assert.equal(readSessionCookie("unrelated=1"), null);
});

test("marks cookies Secure only for https, and always HttpOnly", () => {
  const insecure = sessionCookie("token", false);
  const secure = sessionCookie("token", true);

  assert.match(insecure, /HttpOnly/);
  assert.match(insecure, /SameSite=Lax/);
  assert.doesNotMatch(
    insecure,
    /Secure/,
    "a Secure cookie would be dropped over http://127.0.0.1",
  );
  assert.match(secure, /Secure/);

  assert.match(clearedSessionCookie(false), /Max-Age=0/);
  assert.match(stateCookie("s", false), /Max-Age=600/);
});

test("generates distinct, non-trivial oauth state values", () => {
  const values = new Set(Array.from({ length: 50 }, () => randomState()));
  assert.equal(values.size, 50);
  for (const value of values) assert.ok(value.length >= 32);
});

test("allows only the configured workspace", () => {
  const base = { ...identity, workspaceId: "ws-powerselect", workspaceName: null };

  assert.equal(
    isAllowedIdentity(base, { expectedWorkspaceId: "ws-powerselect" }),
    true,
  );
  assert.equal(
    isAllowedIdentity(base, { expectedWorkspaceId: "ws-someone-else" }),
    false,
  );
  // Unset workspace id must not be treated as "matches anything configured".
  assert.equal(isAllowedIdentity(base, {}), true);
});

test("treats an empty allowlist as workspace-wide access", () => {
  const base = { ...identity, workspaceId: "ws", workspaceName: null };
  for (const allowedEmails of [undefined, "", "   ", " , "]) {
    assert.equal(isAllowedIdentity(base, { allowedEmails }), true);
  }
});

test("enforces the allowlist when set, case-insensitively", () => {
  const base = { ...identity, workspaceId: "ws", workspaceName: null };

  assert.equal(
    isAllowedIdentity(base, {
      allowedEmails: " NINO.VAN.PARIDON@powerselect.app , ander@powerselect.app ",
    }),
    true,
  );
  assert.equal(
    isAllowedIdentity(base, { allowedEmails: "iemand.anders@powerselect.app" }),
    false,
  );
});
