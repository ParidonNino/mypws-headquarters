import { updateNotionWorkblockResponse } from "../../../../lib/notion-tasks";

export async function POST(request: Request) {
  return updateNotionWorkblockResponse(
    request,
    process.env.NOTION_TOKEN,
    process.env.NOTION_WORKBLOCKS_DATA_SOURCE_ID,
  );
}
