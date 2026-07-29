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
                Notes: {
                  type: "rich_text",
                  rich_text: [{ plain_text: "Eerst inventariseren" }],
                },
                Owner: {
                  type: "people",
                  people: [{ id: workblockId, name: "Nino van Paridon" }],
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
    assert.equal(payload.tasks[0].notes, "Eerst inventariseren");
    assert.equal(payload.tasks[0].owner.name, "Nino van Paridon");
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

test("loads every roadmap page and resolves nested subtasks to their epic", async () => {
  const originalFetch = globalThis.fetch;
  const featureId = "39641e9d-4d52-8222-a73a-ff053b6c5c4c";
  const epicId = "39641e9d-4d52-8333-a73a-ff053b6c5c4c";
  let roadmapQueries = 0;

  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/roadmap/")) {
      roadmapQueries += 1;
      const body = JSON.parse(init.body);
      if (!body.start_cursor) {
        return Response.json({
          results: [
            {
              id: taskId,
              properties: {
                Task: {
                  type: "title",
                  title: [{ plain_text: "Geneste subtask" }],
                },
                "Task type": {
                  type: "select",
                  select: { name: "Subtask" },
                },
                Status: {
                  type: "select",
                  select: { name: "Done" },
                },
                "Parent task": {
                  type: "relation",
                  relation: [{ id: featureId }],
                },
              },
            },
          ],
          has_more: true,
          next_cursor: "page-2",
        });
      }

      return Response.json({
        results: [
          {
            id: featureId,
            properties: {
              Task: {
                type: "title",
                title: [{ plain_text: "Telemetry feature" }],
              },
              "Task type": {
                type: "select",
                select: { name: "Feature" },
              },
              Status: {
                type: "select",
                select: { name: "In Progress" },
              },
              "Parent task": {
                type: "relation",
                relation: [{ id: epicId }],
              },
            },
          },
          {
            id: epicId,
            properties: {
              Task: {
                type: "title",
                title: [{ plain_text: "Refactor Datafetcher service" }],
              },
              "Task type": {
                type: "select",
                select: { name: "Epic" },
              },
              Status: {
                type: "select",
                select: { name: "In Progress" },
              },
            },
          },
        ],
        has_more: false,
      });
    }

    return Response.json({ results: [], has_more: false });
  };

  try {
    const response = await getNotionTasksResponse(
      "secret",
      "roadmap",
      "workblocks",
    );
    const payload = await response.json();
    const nestedTask = payload.tasks.find((task) => task.id === taskId);

    assert.equal(response.status, 200);
    assert.equal(roadmapQueries, 2);
    assert.equal(nestedTask.status, "done");
    assert.equal(nestedTask.directParentId, featureId);
    assert.equal(nestedTask.parentEpicId, epicId);
    assert.equal(nestedTask.epic, "Refactor Datafetcher service");
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
        notes: "1. Inventariseren\n2. Refactoren",
        ownerId: workblockId,
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
    assert.equal(
      notionBody.properties.Notes.rich_text[0].text.content,
      "1. Inventariseren\n2. Refactoren",
    );
    assert.equal(notionBody.properties.Owner.people[0].id, workblockId);
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
        notes: "1. Review voorbereiden\n2. Feedback verwerken",
        ownerId: taskId,
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
      notionBody.properties.Notes.rich_text[0].text.content,
      "1. Review voorbereiden\n2. Feedback verwerken",
    );
    assert.equal(notionBody.properties.Owner.people[0].id, taskId);
    assert.equal(
      notionBody.properties["Parent task"].relation[0].id,
      workblockId,
    );
    assert.equal(notionBody.properties["Work date"].date, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
