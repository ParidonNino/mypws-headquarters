import {
  createNotionTaskResponse,
  deleteNotionTaskResponse,
  getNotionTasksResponse,
  updateNotionTaskResponse,
} from "../../../../lib/notion-tasks";
import { readAuthConfig } from "../../../../lib/auth-config";
import { readSessionCookie, verifySessionToken } from "../../../../lib/session";

export async function GET(request: Request) {
  // The worker gate has already rejected unauthenticated callers; this reads
  // the session again only to tell the client who it is signed in as.
  const config = readAuthConfig(process.env);
  const session = await verifySessionToken(
    readSessionCookie(request.headers.get("cookie")),
    config.sessionSecret,
  );

  return getNotionTasksResponse(
    process.env.NOTION_TOKEN,
    process.env.NOTION_ROADMAP_DATA_SOURCE_ID,
    process.env.NOTION_WORKBLOCKS_DATA_SOURCE_ID,
    session && { email: session.email, userId: session.userId },
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
