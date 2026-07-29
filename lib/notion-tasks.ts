const NOTION_VERSION = "2026-03-11";
const DEFAULT_ROADMAP_DATA_SOURCE_ID =
  "dbe06fab-cee1-42c4-80a3-5757a6c11030";
const DEFAULT_WORKBLOCKS_DATA_SOURCE_ID =
  "5130cdd2-c742-4cc7-8417-37832fa90b48";

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  number?: number | null;
  date?: { start?: string; end?: string | null } | null;
  relation?: Array<{ id?: string }>;
  people?: NotionUser[];
};

type NotionUser = {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
  type?: string;
  person?: { email?: string };
};

type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
};

function plainText(property?: NotionProperty) {
  const fragments =
    property?.type === "title" ? property.title : property?.rich_text;
  return fragments?.map((fragment) => fragment.plain_text ?? "").join("") ?? "";
}

function selectName(property?: NotionProperty) {
  return property?.select?.name ?? "";
}

function dayKey(date?: string) {
  if (!date) return undefined;

  const today = new Date();
  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const difference = Math.round(
    (target.getTime() - current.getTime()) / 86_400_000,
  );

  if (difference === -1) return "yesterday";
  if (difference === 0) return "today";
  if (difference === 1) return "tomorrow";
  return undefined;
}

function workStatus(status: string) {
  if (status === "Done") return "done";
  // "In Progress" describes the Notion ticket, not a live timer. The client
  // only promotes a task to "running" when it has a locally active session.
  if (status === "In Progress") return "paused";
  if (status === "Needs Input") return "paused";
  return "ready";
}

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

function validPageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function richText(content: string) {
  if (!content) return [];
  return [
    {
      type: "text",
      text: { content: content.slice(0, 2000) },
    },
  ];
}

async function notionError(response: Response) {
  const detail = (await response.text()).slice(0, 300);
  return Response.json(
    {
      configured: true,
      error: `Notion gaf status ${response.status}`,
      detail,
    },
    { status: response.status },
  );
}

export async function getNotionTasksResponse(
  token?: string,
  configuredDataSourceId?: string,
  configuredWorkblocksDataSourceId?: string,
) {
  if (!token || token === "PLAK_HIER_DE_NOTION_SLEUTEL") {
    return Response.json({
      configured: false,
      reason: "NOTION_TOKEN ontbreekt",
      tasks: [],
    });
  }

  const dataSourceId =
    configuredDataSourceId || DEFAULT_ROADMAP_DATA_SOURCE_ID;

  try {
    const response = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify({
          page_size: 100,
          filter: {
            property: "Task type",
            select: { does_not_equal: "Template" },
          },
          sorts: [
            { property: "Daily order", direction: "ascending" },
            { property: "Priority", direction: "ascending" },
          ],
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return Response.json(
        {
          configured: true,
          error: `Notion gaf status ${response.status}`,
          detail: body.slice(0, 300),
          tasks: [],
        },
        { status: response.status },
      );
    }

    const payload = (await response.json()) as { results?: NotionPage[] };
    const pages = payload.results ?? [];
    const loggedSeconds = new Map<string, number>();
    let people: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      email: string | null;
    }> = [];
    const workblocksDataSourceId =
      configuredWorkblocksDataSourceId || DEFAULT_WORKBLOCKS_DATA_SOURCE_ID;

    try {
      const workblocksResponse = await fetch(
        `https://api.notion.com/v1/data_sources/${workblocksDataSourceId}/query`,
        {
          method: "POST",
          headers: notionHeaders(token),
          body: JSON.stringify({ page_size: 100 }),
        },
      );
      if (workblocksResponse.ok) {
        const workblocksPayload = (await workblocksResponse.json()) as {
          results?: NotionPage[];
        };
        for (const workblock of workblocksPayload.results ?? []) {
          const taskId =
            workblock.properties?.["Roadmap task"]?.relation?.[0]?.id;
          const actualHours =
            workblock.properties?.["Actual hours"]?.number ?? 0;
          if (taskId && actualHours > 0) {
            loggedSeconds.set(
              taskId,
              (loggedSeconds.get(taskId) ?? 0) +
                Math.round(actualHours * 3_600),
            );
          }
        }
      }
    } catch {
      // Roadmap planning stays available when Workblocks is not shared yet.
    }

    try {
      const usersResponse = await fetch(
        "https://api.notion.com/v1/users?page_size=100",
        { headers: notionHeaders(token) },
      );
      if (usersResponse.ok) {
        const usersPayload = (await usersResponse.json()) as {
          results?: NotionUser[];
        };
        people = (usersPayload.results ?? [])
          .filter((user) => user.id && user.name && user.type !== "bot")
          .map((user) => ({
            id: user.id,
            name: user.name ?? "Onbekende gebruiker",
            avatarUrl: user.avatar_url ?? null,
            email: user.person?.email ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "nl"));
      }
    } catch {
      // Owner selection remains optional if the integration cannot list users.
    }

    const titles = new Map(
      pages.map((page) => [page.id, plainText(page.properties?.Task)]),
    );
    const accents = ["blue", "violet", "amber", "mint"] as const;

    const tasks = pages
      .filter(
        (page) =>
          selectName(page.properties?.["Task type"]) !== "Epic" &&
          selectName(page.properties?.Status) !== "Done",
      )
      .map((page, index) => {
        const properties = page.properties ?? {};
        const parentId = properties["Parent task"]?.relation?.[0]?.id;
        const workDate = properties["Work date"]?.date?.start;

        return {
          id: page.id,
          url: page.url,
          title: plainText(properties.Task) || "Naamloze taak",
          epic: (parentId && titles.get(parentId)) || "Powerselect Roadmap",
          parentEpicId: parentId ?? null,
          taskType:
            selectName(properties["Task type"]) === "Feature"
              ? "Feature"
              : "Subtask",
          priority: selectName(properties.Priority) || "Medium",
          estimate: properties["Estimate hours"]?.number ?? 1,
          plannedHours: properties["Planned today hours"]?.number ?? null,
          loggedSeconds: loggedSeconds.get(page.id) ?? 0,
          status: workStatus(selectName(properties.Status)),
          notionStatus: selectName(properties.Status),
          day: dayKey(workDate),
          workDate: workDate ?? null,
          slot: workDate?.includes("T")
            ? new Date(workDate).toLocaleTimeString("nl-NL", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : undefined,
          nextAction: plainText(properties["Next action"]),
          notes: plainText(properties.Notes),
          owner: properties.Owner?.people?.[0]
            ? {
                id: properties.Owner.people[0].id,
                name:
                  properties.Owner.people[0].name ??
                  "Onbekende gebruiker",
                avatarUrl:
                  properties.Owner.people[0].avatar_url ?? null,
              }
            : null,
          accent: accents[index % accents.length],
        };
      });

    const epics = pages
      .filter(
        (page) => selectName(page.properties?.["Task type"]) === "Epic",
      )
      .map((page) => {
        const properties = page.properties ?? {};
        return {
          id: page.id,
          url: page.url,
          title: plainText(properties.Task) || "Naamloze epic",
          status: selectName(properties.Status) || "Backlog",
          priority: selectName(properties.Priority) || "Medium",
          plannedStart: properties["Planned start"]?.date?.start ?? null,
          plannedEnd: properties["Planned end"]?.date?.start ?? null,
          progress: properties["Progress %"]?.number ?? 0,
          estimate: properties["Estimate hours"]?.number ?? 0,
          nextAction: plainText(properties["Next action"]),
        };
      });

    return Response.json({
      configured: true,
      syncedAt: new Date().toISOString(),
      tasks,
      epics,
      people,
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        error: "Notion-koppeling mislukt",
        detail: error instanceof Error ? error.message : "Onbekende fout",
        tasks: [],
      },
      { status: 500 },
    );
  }
}

export async function createNotionTaskResponse(
  request: Request,
  token?: string,
  configuredDataSourceId?: string,
) {
  if (!token || token === "PLAK_HIER_DE_NOTION_SLEUTEL") {
    return Response.json(
      { configured: false, error: "NOTION_TOKEN ontbreekt" },
      { status: 503 },
    );
  }

  try {
    const payload = (await request.json()) as {
      title?: unknown;
      taskType?: unknown;
      priority?: unknown;
      estimate?: unknown;
      nextAction?: unknown;
      notes?: unknown;
      ownerId?: unknown;
      parentEpicId?: unknown;
      epicTitle?: unknown;
      workDate?: unknown;
    };

    if (typeof payload.title !== "string" || !payload.title.trim()) {
      return Response.json({ error: "Geef de taak een titel" }, { status: 400 });
    }
    if (payload.taskType !== "Feature" && payload.taskType !== "Subtask") {
      return Response.json({ error: "Ongeldig taaktype" }, { status: 400 });
    }
    if (
      payload.priority !== "Critical" &&
      payload.priority !== "High" &&
      payload.priority !== "Medium" &&
      payload.priority !== "Low"
    ) {
      return Response.json({ error: "Ongeldige prioriteit" }, { status: 400 });
    }
    if (
      typeof payload.estimate !== "number" ||
      !Number.isFinite(payload.estimate) ||
      payload.estimate < 0 ||
      payload.estimate > 1_000
    ) {
      return Response.json({ error: "Ongeldige inschatting" }, { status: 400 });
    }
    if (
      payload.nextAction !== undefined &&
      typeof payload.nextAction !== "string"
    ) {
      return Response.json(
        { error: "Ongeldige volgende actie" },
        { status: 400 },
      );
    }
    if (payload.notes !== undefined && typeof payload.notes !== "string") {
      return Response.json({ error: "Ongeldige stappen" }, { status: 400 });
    }
    if (
      payload.ownerId !== undefined &&
      payload.ownerId !== null &&
      payload.ownerId !== "" &&
      !validPageId(payload.ownerId)
    ) {
      return Response.json({ error: "Ongeldige eigenaar" }, { status: 400 });
    }
    if (
      payload.parentEpicId !== undefined &&
      payload.parentEpicId !== null &&
      payload.parentEpicId !== "" &&
      !validPageId(payload.parentEpicId)
    ) {
      return Response.json({ error: "Ongeldige epic" }, { status: 400 });
    }
    if (
      payload.workDate !== undefined &&
      payload.workDate !== null &&
      (typeof payload.workDate !== "string" ||
        Number.isNaN(Date.parse(payload.workDate)))
    ) {
      return Response.json({ error: "Ongeldige werkdatum" }, { status: 400 });
    }

    const title = payload.title.trim().slice(0, 160);
    const nextAction =
      typeof payload.nextAction === "string" ? payload.nextAction : "";
    const notes = typeof payload.notes === "string" ? payload.notes : "";
    const properties: Record<string, unknown> = {
      Task: { title: richText(title) },
      "Task type": { select: { name: payload.taskType } },
      Status: { select: { name: "Todo" } },
      Priority: { select: { name: payload.priority } },
      "Estimate hours": { number: payload.estimate },
      "Next action": { rich_text: richText(nextAction) },
      Notes: { rich_text: richText(notes) },
    };

    if (validPageId(payload.ownerId)) {
      properties.Owner = { people: [{ id: payload.ownerId }] };
    }
    if (validPageId(payload.parentEpicId)) {
      properties["Parent task"] = {
        relation: [{ id: payload.parentEpicId }],
      };
    }
    if (typeof payload.workDate === "string") {
      properties["Work date"] = { date: { start: payload.workDate } };
    }

    const dataSourceId =
      configuredDataSourceId || DEFAULT_ROADMAP_DATA_SOURCE_ID;
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties,
      }),
    });
    if (!response.ok) return notionError(response);

    const page = (await response.json()) as NotionPage;
    const workDate =
      typeof payload.workDate === "string" ? payload.workDate : null;
    const epicTitle =
      typeof payload.epicTitle === "string" && payload.epicTitle.trim()
        ? payload.epicTitle.trim().slice(0, 160)
        : "Powerselect Roadmap";

    return Response.json({
      configured: true,
      saved: true,
      task: {
        id: page.id,
        url: page.url,
        title,
        epic: epicTitle,
        parentEpicId: validPageId(payload.parentEpicId)
          ? payload.parentEpicId
          : null,
        taskType: payload.taskType,
        priority: payload.priority,
        estimate: payload.estimate,
        plannedHours: null,
        loggedSeconds: 0,
        status: "ready",
        notionStatus: "Todo",
        day: dayKey(workDate ?? undefined),
        workDate,
        slot: workDate?.includes("T")
          ? new Date(workDate).toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : undefined,
        nextAction,
        notes,
        owner: validPageId(payload.ownerId)
          ? { id: payload.ownerId, name: "Toegewezen" }
          : null,
        accent: "blue",
      },
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        error: "Notion-ticket aanmaken mislukt",
        detail: error instanceof Error ? error.message : "Onbekende fout",
      },
      { status: 500 },
    );
  }
}

export async function updateNotionTaskResponse(
  request: Request,
  token?: string,
) {
  if (!token || token === "PLAK_HIER_DE_NOTION_SLEUTEL") {
    return Response.json(
      { configured: false, error: "NOTION_TOKEN ontbreekt" },
      { status: 503 },
    );
  }

  try {
    const payload = (await request.json()) as {
      pageId?: unknown;
      status?: unknown;
      title?: unknown;
      taskType?: unknown;
      priority?: unknown;
      estimate?: unknown;
      nextAction?: unknown;
      notes?: unknown;
      ownerId?: unknown;
      parentEpicId?: unknown;
      workDate?: unknown;
    };

    if (!validPageId(payload.pageId)) {
      return Response.json({ error: "Ongeldig Notion-ticket" }, { status: 400 });
    }

    const properties: Record<string, unknown> = {};

    if (payload.title !== undefined) {
      if (typeof payload.title !== "string" || !payload.title.trim()) {
        return Response.json(
          { error: "Geef de taak een titel" },
          { status: 400 },
        );
      }
      properties.Task = {
        title: richText(payload.title.trim().slice(0, 160)),
      };
    }

    if (payload.taskType !== undefined) {
      if (payload.taskType !== "Feature" && payload.taskType !== "Subtask") {
        return Response.json({ error: "Ongeldig taaktype" }, { status: 400 });
      }
      properties["Task type"] = { select: { name: payload.taskType } };
    }

    if (payload.priority !== undefined) {
      if (
        payload.priority !== "Critical" &&
        payload.priority !== "High" &&
        payload.priority !== "Medium" &&
        payload.priority !== "Low"
      ) {
        return Response.json(
          { error: "Ongeldige prioriteit" },
          { status: 400 },
        );
      }
      properties.Priority = { select: { name: payload.priority } };
    }

    if (payload.estimate !== undefined) {
      if (
        typeof payload.estimate !== "number" ||
        !Number.isFinite(payload.estimate) ||
        payload.estimate < 0 ||
        payload.estimate > 1_000
      ) {
        return Response.json(
          { error: "Ongeldige inschatting" },
          { status: 400 },
        );
      }
      properties["Estimate hours"] = { number: payload.estimate };
    }

    if (payload.status !== undefined) {
      if (
        payload.status !== "Backlog" &&
        payload.status !== "Todo" &&
        payload.status !== "In Progress" &&
        payload.status !== "Needs Input" &&
        payload.status !== "Done"
      ) {
        return Response.json({ error: "Ongeldige status" }, { status: 400 });
      }
      properties.Status = { select: { name: payload.status } };
    }

    if (payload.nextAction !== undefined) {
      if (typeof payload.nextAction !== "string") {
        return Response.json(
          { error: "Ongeldige volgende actie" },
          { status: 400 },
        );
      }
      properties["Next action"] = { rich_text: richText(payload.nextAction) };
    }

    if (payload.notes !== undefined) {
      if (typeof payload.notes !== "string") {
        return Response.json({ error: "Ongeldige stappen" }, { status: 400 });
      }
      properties.Notes = { rich_text: richText(payload.notes) };
    }

    if (payload.ownerId !== undefined) {
      if (
        payload.ownerId !== null &&
        payload.ownerId !== "" &&
        !validPageId(payload.ownerId)
      ) {
        return Response.json(
          { error: "Ongeldige eigenaar" },
          { status: 400 },
        );
      }
      properties.Owner = {
        people: validPageId(payload.ownerId)
          ? [{ id: payload.ownerId }]
          : [],
      };
    }

    if (payload.parentEpicId !== undefined) {
      if (
        payload.parentEpicId !== null &&
        payload.parentEpicId !== "" &&
        !validPageId(payload.parentEpicId)
      ) {
        return Response.json({ error: "Ongeldige epic" }, { status: 400 });
      }
      properties["Parent task"] = {
        relation: validPageId(payload.parentEpicId)
          ? [{ id: payload.parentEpicId }]
          : [],
      };
    }

    if (payload.workDate !== undefined) {
      if (
        payload.workDate !== null &&
        (typeof payload.workDate !== "string" ||
          Number.isNaN(Date.parse(payload.workDate)))
      ) {
        return Response.json({ error: "Ongeldige werkdatum" }, { status: 400 });
      }
      properties["Work date"] = payload.workDate
        ? { date: { start: payload.workDate } }
        : { date: null };
    }

    if (Object.keys(properties).length === 0) {
      return Response.json({ error: "Geen wijzigingen ontvangen" }, { status: 400 });
    }

    const response = await fetch(
      `https://api.notion.com/v1/pages/${payload.pageId}`,
      {
        method: "PATCH",
        headers: notionHeaders(token),
        body: JSON.stringify({ properties }),
      },
    );

    if (!response.ok) return notionError(response);

    return Response.json({
      configured: true,
      saved: true,
      pageId: payload.pageId,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        error: "Notion-wijziging mislukt",
        detail: error instanceof Error ? error.message : "Onbekende fout",
      },
      { status: 500 },
    );
  }
}

async function updatePage(
  token: string,
  pageId: string,
  properties: Record<string, unknown>,
) {
  return fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(token),
    body: JSON.stringify({ properties }),
  });
}

export async function updateNotionWorkblockResponse(
  request: Request,
  token?: string,
  configuredWorkblocksDataSourceId?: string,
) {
  if (!token || token === "PLAK_HIER_DE_NOTION_SLEUTEL") {
    return Response.json(
      { configured: false, error: "NOTION_TOKEN ontbreekt" },
      { status: 503 },
    );
  }

  try {
    const payload = (await request.json()) as {
      action?: unknown;
      taskId?: unknown;
      taskTitle?: unknown;
      workblockId?: unknown;
      startedAt?: unknown;
      plannedHours?: unknown;
      nextAction?: unknown;
    };

    if (
      payload.action !== "start" &&
      payload.action !== "pause" &&
      payload.action !== "done"
    ) {
      return Response.json({ error: "Ongeldige werkactie" }, { status: 400 });
    }
    if (!validPageId(payload.taskId)) {
      return Response.json({ error: "Ongeldig Notion-ticket" }, { status: 400 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (payload.action === "start") {
      const taskResponse = await updatePage(token, payload.taskId, {
        Status: { select: { name: "In Progress" } },
      });
      if (!taskResponse.ok) return notionError(taskResponse);

      const workblocksDataSourceId =
        configuredWorkblocksDataSourceId || DEFAULT_WORKBLOCKS_DATA_SOURCE_ID;
      const taskTitle =
        typeof payload.taskTitle === "string" && payload.taskTitle.trim()
          ? payload.taskTitle.trim().slice(0, 160)
          : "Powerselect taak";
      const plannedHours =
        typeof payload.plannedHours === "number" &&
        Number.isFinite(payload.plannedHours)
          ? Math.max(0, payload.plannedHours)
          : null;
      const nextAction =
        typeof payload.nextAction === "string" ? payload.nextAction : "";

      const properties: Record<string, unknown> = {
        Werkblok: {
          title: richText(
            `${taskTitle} · ${now.toLocaleDateString("nl-NL", {
              day: "numeric",
              month: "short",
            })}`,
          ),
        },
        "Roadmap task": { relation: [{ id: payload.taskId }] },
        "Work start": { date: { start: nowIso } },
        Werkstatus: { select: { name: "Start" } },
        "Next action": { rich_text: richText(nextAction) },
      };
      if (plannedHours !== null) {
        properties["Planned hours"] = { number: plannedHours };
      }

      const createResponse = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify({
          parent: {
            type: "data_source_id",
            data_source_id: workblocksDataSourceId,
          },
          properties,
        }),
      });
      if (!createResponse.ok) {
        if (createResponse.status === 403 || createResponse.status === 404) {
          return Response.json({
            configured: true,
            saved: true,
            action: "start",
            workblockId: null,
            workblockSaved: false,
            startedAt: nowIso,
            warning:
              "Ticket gestart, maar de Werkblokken-database is nog niet gedeeld met de koppeling.",
          });
        }
        return notionError(createResponse);
      }

      const workblock = (await createResponse.json()) as { id?: string };
      return Response.json({
        configured: true,
        saved: true,
        action: "start",
        workblockId: workblock.id,
        workblockSaved: true,
        startedAt: nowIso,
      });
    }

    const hasWorkblockId =
      payload.workblockId !== undefined &&
      payload.workblockId !== null &&
      payload.workblockId !== "";

    if (hasWorkblockId) {
      if (!validPageId(payload.workblockId)) {
        return Response.json(
          { error: "Ongeldig Notion-werkblok" },
          { status: 400 },
        );
      }
      if (
        typeof payload.startedAt !== "string" ||
        Number.isNaN(Date.parse(payload.startedAt))
      ) {
        return Response.json(
          { error: "Ongeldige starttijd" },
          { status: 400 },
        );
      }

      const actualHours = Math.max(
        0,
        (now.getTime() - Date.parse(payload.startedAt)) / 3_600_000,
      );
      const workblockResponse = await updatePage(token, payload.workblockId, {
        "Work end": { date: { start: nowIso } },
        "Actual hours": { number: Number(actualHours.toFixed(3)) },
        Werkstatus: {
          select: { name: payload.action === "done" ? "Klaar" : "Pauze" },
        },
      });
      if (!workblockResponse.ok) return notionError(workblockResponse);
    }

    if (payload.action === "done") {
      const taskResponse = await updatePage(token, payload.taskId, {
        Status: { select: { name: "Done" } },
      });
      if (!taskResponse.ok) return notionError(taskResponse);
    }

    return Response.json({
      configured: true,
      saved: true,
      action: payload.action,
      workblockSaved: hasWorkblockId,
      endedAt: nowIso,
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        error: "Notion-werkblok mislukt",
        detail: error instanceof Error ? error.message : "Onbekende fout",
      },
      { status: 500 },
    );
  }
}
