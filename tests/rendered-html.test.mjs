import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
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
