import {
  createNotionTaskResponse,
  deleteNotionTaskResponse,
  getNotionTasksResponse,
  updateNotionTaskResponse,
} from "../../../../lib/notion-tasks";

export async function GET() {
  return getNotionTasksResponse(
    process.env.NOTION_TOKEN,
    process.env.NOTION_ROADMAP_DATA_SOURCE_ID,
    process.env.NOTION_WORKBLOCKS_DATA_SOURCE_ID,
  );
}

export async function PATCH(request: Request) {
  return updateNotionTaskResponse(request, process.env.NOTION_TOKEN);
}

export async function POST(request: Request) {
  return createNotionTaskResponse(
    request,
    process.env.NOTION_TOKEN,
    process.env.NOTION_ROADMAP_DATA_SOURCE_ID,
  );
}

export async function DELETE(request: Request) {
  return deleteNotionTaskResponse(request, process.env.NOTION_TOKEN);
}
