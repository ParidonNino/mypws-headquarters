import assert from "node:assert/strict";
import test from "node:test";

import {
  getNotionTasksResponse,
  updateNotionWorkblockResponse,
} from "../lib/notion-tasks.ts";

const taskId = "39641e9d-4d52-8104-a73a-ff053b6c5c4c";
const workblockId = "5130cdd2-c742-4cc7-8417-37832fa90b48";

function request(body) {
  return new Request("http://localhost/api/notion/workblocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("treats a Notion In Progress ticket as paused without a live session", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      results: [
        {
          id: taskId,
          url: `https://app.notion.com/${taskId.replaceAll("-", "")}`,
          properties: {
            Task: {
              type: "title",
              title: [{ plain_text: "Database-schema refactor" }],
            },
            "Task type": { type: "select", select: { name: "Subtask" } },
            Status: { type: "select", select: { name: "In Progress" } },
          },
        },
      ],
    });

  try {
    const response = await getNotionTasksResponse("secret", "roadmap");
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.tasks[0].status, "paused");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pauses successfully when Workblocks returned no page id", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Pause without a workblock must not call Notion");
  };

  try {
    const response = await updateNotionWorkblockResponse(
      request({
        action: "pause",
        taskId,
        workblockId: null,
        startedAt: new Date().toISOString(),
      }),
      "secret",
      "workblocks",
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.workblockSaved, false);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("finishes the roadmap ticket even without a Workblocks page", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({});
  };

  try {
    const response = await updateNotionWorkblockResponse(
      request({
        action: "done",
        taskId,
        workblockId: null,
        startedAt: new Date().toISOString(),
      }),
      "secret",
      "workblocks",
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.workblockSaved, false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `https://api.notion.com/v1/pages/${taskId}`);
    assert.equal(requests[0].body.properties.Status.select.name, "Done");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("still closes and records a real Workblocks page", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({});
  };

  try {
    const response = await updateNotionWorkblockResponse(
      request({
        action: "pause",
        taskId,
        workblockId,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
      }),
      "secret",
      "workblocks",
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.workblockSaved, true);
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      `https://api.notion.com/v1/pages/${workblockId}`,
    );
    assert.equal(requests[0].body.properties.Werkstatus.select.name, "Pauze");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
