const NOTION_VERSION = "2026-03-11";
const DEFAULT_ROADMAP_DATA_SOURCE_ID =
  "dbe06fab-cee1-42c4-80a3-5757a6c11030";

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
  if (status === "In Progress") return "running";
  if (status === "Needs Input") return "paused";
  return "ready";
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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_VERSION,
        },
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
