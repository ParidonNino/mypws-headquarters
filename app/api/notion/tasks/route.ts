import { getNotionTasksResponse } from "../../../../lib/notion-tasks";

export async function GET() {
  return getNotionTasksResponse(
    process.env.NOTION_TOKEN,
    process.env.NOTION_ROADMAP_DATA_SOURCE_ID,
  );
}
