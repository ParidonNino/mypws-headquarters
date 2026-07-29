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
          estimate: properties["Estimate hours"]?.number ?? 1,
          plannedHours: properties["Planned today hours"]?.number ?? null,
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
          accent: accents[index % accents.length],
        };
      });

    return Response.json({
      configured: true,
      syncedAt: new Date().toISOString(),
      tasks,
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
      nextAction?: unknown;
      workDate?: unknown;
    };

    if (!validPageId(payload.pageId)) {
      return Response.json({ error: "Ongeldig Notion-ticket" }, { status: 400 });
    }

    const properties: Record<string, unknown> = {};

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
