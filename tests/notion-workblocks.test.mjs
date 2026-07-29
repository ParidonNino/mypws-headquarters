import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotionTaskResponse,
  getNotionTasksResponse,
  updateNotionTaskResponse,
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
  globalThis.fetch = async (url) =>
    String(url).includes("/roadmap/")
      ? Response.json({
          results: [
            {
              id: taskId,
              url: `https://app.notion.com/${taskId.replaceAll("-", "")}`,
              properties: {
                Task: {
                  type: "title",
                  title: [{ plain_text: "Database-schema refactor" }],
                },
                "Task type": {
                  type: "select",
                  select: { name: "Subtask" },
                },
                Status: {
                  type: "select",
                  select: { name: "In Progress" },
                },
              },
            },
          ],
        })
      : Response.json({ results: [] });

  try {
    const response = await getNotionTasksResponse(
      "secret",
      "roadmap",
      "workblocks",
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.tasks[0].status, "paused");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adds completed Workblocks time to the roadmap task", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes("/roadmap/")
      ? Response.json({
          results: [
            {
              id: taskId,
              properties: {
                Task: {
                  type: "title",
                  title: [{ plain_text: "Database-schema refactor" }],
                },
                "Task type": {
                  type: "select",
                  select: { name: "Subtask" },
                },
                Status: {
                  type: "select",
                  select: { name: "In Progress" },
                },
              },
            },
          ],
        })
      : Response.json({
          results: [
            {
              id: workblockId,
              properties: {
                "Roadmap task": {
                  type: "relation",
                  relation: [{ id: taskId }],
                },
                "Actual hours": { type: "number", number: 0.5 },
              },
            },
          ],
        });

  try {
    const response = await getNotionTasksResponse(
      "secret",
      "roadmap",
      "workblocks",
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.tasks[0].loggedSeconds, 1_800);
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

test("creates a new roadmap ticket with its selected epic", async () => {
  const originalFetch = globalThis.fetch;
  let notionBody;
  globalThis.fetch = async (_url, init) => {
    notionBody = JSON.parse(init.body);
    return Response.json({
      id: "39641e9d-4d52-8999-a73a-ff053b6c5c4c",
      url: "https://app.notion.com/39641e9d4d528999a73aff053b6c5c4c",
    });
  };

  try {
    const response = await createNotionTaskResponse(
      request({
        title: "Nieuwe migratietaak",
        taskType: "Subtask",
        priority: "High",
        estimate: 3.5,
        nextAction: "Eerst de bestaande migraties nalopen",
        parentEpicId: taskId,
        epicTitle: "Refactor Datafetcher service",
        workDate: "2026-07-30T09:00:00.000Z",
      }),
      "secret",
      "roadmap",
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.task.title, "Nieuwe migratietaak");
    assert.equal(payload.task.epic, "Refactor Datafetcher service");
    assert.equal(payload.task.day, "tomorrow");
    assert.equal(notionBody.parent.data_source_id, "roadmap");
    assert.equal(
      notionBody.properties["Parent task"].relation[0].id,
      taskId,
    );
    assert.equal(notionBody.properties.Status.select.name, "Todo");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an empty roadmap ticket before calling Notion", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return Response.json({});
  };

  try {
    const response = await createNotionTaskResponse(
      request({
        title: " ",
        taskType: "Subtask",
        priority: "Medium",
        estimate: 2,
      }),
      "secret",
      "roadmap",
    );
    assert.equal(response.status, 400);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updates all editable roadmap ticket fields", async () => {
  const originalFetch = globalThis.fetch;
  let notionBody;
  globalThis.fetch = async (_url, init) => {
    notionBody = JSON.parse(init.body);
    return Response.json({});
  };

  try {
    const response = await updateNotionTaskResponse(
      request({
        pageId: taskId,
        title: "Bijgewerkte migratietaak",
        taskType: "Feature",
        priority: "Critical",
        estimate: 5,
        nextAction: "Review inplannen",
        parentEpicId: workblockId,
        workDate: null,
      }),
      "secret",
    );
    assert.equal(response.status, 200);
    assert.equal(
      notionBody.properties.Task.title[0].text.content,
      "Bijgewerkte migratietaak",
    );
    assert.equal(
      notionBody.properties["Task type"].select.name,
      "Feature",
    );
    assert.equal(notionBody.properties.Priority.select.name, "Critical");
    assert.equal(notionBody.properties["Estimate hours"].number, 5);
    assert.equal(
      notionBody.properties["Parent task"].relation[0].id,
      workblockId,
    );
    assert.equal(notionBody.properties["Work date"].date, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
