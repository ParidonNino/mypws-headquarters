import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken } from "../lib/session.ts";

const SESSION_SECRET = "test-session-secret-for-rendered-html";

/** Env with login configured, so the worker's auth gate is active. */
function authEnv() {
  return {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
    NOTION_OAUTH_CLIENT_ID: "test-client-id",
    NOTION_OAUTH_CLIENT_SECRET: "test-client-secret",
    NOTION_WORKSPACE_ID: "test-workspace-id",
    SESSION_SECRET,
  };
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function sessionCookieHeader() {
  const token = await createSessionToken(
    { email: "tester@powerselect.app", userId: "11111111-1111-1111-1111-111111111111" },
    SESSION_SECRET,
  );
  return `powerselect_session=${encodeURIComponent(token)}`;
}

async function fetchWorker(path, { env, headers } = {}) {
  const worker = await loadWorker();
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", ...headers },
    }),
    env ?? authEnv(),
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

/** A signed-in page request. */
async function render() {
  return fetchWorker("/", { headers: { cookie: await sessionCookieHeader() } });
}

test("server-renders My Powerselect Headquarters", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="nl">/i);
  assert.match(html, /<title>My Powerselect Headquarters<\/title>/i);
  assert.match(html, /alt="Powerselect"/);
  assert.match(html, /My Powerselect Headquarters/);
  assert.match(html, /Mijn dag/);
  assert.match(html, /Roadmap/);
  assert.match(html, /Mijn week/);
  assert.match(html, /In te plannen/);
  assert.match(html, /Start/);
  assert.match(html, /Pauze/);
  assert.match(html, /Klaar/);
  assert.match(html, /Tijd aanpassen/);
  assert.match(html, /Voortgang/);
  assert.match(html, /aria-label="Voortgang in procenten"/i);
  assert.match(html, /type="range"/i);
  assert.match(html, /% voltooid/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("renders accessible actions for planning and opening tickets", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /aria-label="Taak toevoegen"/i);
  assert.match(html, /aria-label="Vorige periode"/i);
  assert.match(html, /aria-label="Volgende periode"/i);
  assert.match(html, /Openen/);
  assert.match(html, /Naar lijst/);
  assert.match(html, /Nieuwe taak/);
});

test("redirects an unauthenticated page request to the Notion login", async () => {
  const response = await fetchWorker("/");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/api/auth/notion");
});

test("rejects unauthenticated Notion API calls instead of reaching Notion", async () => {
  for (const path of ["/api/notion/tasks", "/api/notion/workblocks"]) {
    const response = await fetchWorker(path);
    assert.equal(response.status, 401, `${path} must not be public`);
    const payload = await response.json();
    assert.equal(payload.error, "Niet aangemeld");
  }
});

test("rejects a session signed with the wrong secret", async () => {
  const token = await createSessionToken(
    { email: "attacker@example.com", userId: "22222222-2222-2222-2222-222222222222" },
    "a-different-secret",
  );
  const response = await fetchWorker("/", {
    headers: { cookie: `powerselect_session=${encodeURIComponent(token)}` },
  });
  assert.equal(response.status, 302);
});

test("fails closed when login is not configured", async () => {
  const response = await fetchWorker("/", {
    env: {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
  });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /niet geconfigureerd/i);
});

test("refuses to run with OAuth set up but no audience restriction", async () => {
  // Notion OAuth authenticates any Notion account in any workspace, so without
  // a workspace or email restriction a successful login would prove nothing.
  const response = await fetchWorker("/", {
    env: {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      NOTION_OAUTH_CLIENT_ID: "test-client-id",
      NOTION_OAUTH_CLIENT_SECRET: "test-client-secret",
      SESSION_SECRET,
    },
  });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /NOTION_WORKSPACE_ID of ALLOWED_EMAILS/);
});

test("accepts an email allowlist alone as the audience restriction", async () => {
  const response = await fetchWorker("/", {
    env: {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      NOTION_OAUTH_CLIENT_ID: "test-client-id",
      NOTION_OAUTH_CLIENT_SECRET: "test-client-secret",
      ALLOWED_EMAILS: "tester@powerselect.app",
      SESSION_SECRET,
    },
    headers: { cookie: await sessionCookieHeader() },
  });
  assert.equal(response.status, 200);
});

test("serves without a session only when AUTH_DISABLED is exactly true", async () => {
  const base = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };

  const enabled = await fetchWorker("/", {
    env: { ...base, AUTH_DISABLED: "true" },
  });
  assert.equal(enabled.status, 200);

  // Anything other than the exact string must not disable the gate.
  for (const value of ["TRUE", "1", "yes", ""]) {
    const response = await fetchWorker("/", {
      env: { ...base, AUTH_DISABLED: value },
    });
    assert.equal(
      response.status,
      503,
      `AUTH_DISABLED=${JSON.stringify(value)} must not disable auth`,
    );
  }
});
