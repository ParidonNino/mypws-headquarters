/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  getNotionTasksResponse,
  updateNotionTaskResponse,
  updateNotionWorkblockResponse,
} from "../lib/notion-tasks";
import { authConfigError, readAuthConfig } from "../lib/auth-config";
import {
  readSessionCookie,
  verifySessionToken,
  type Session,
} from "../lib/session";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  NOTION_TOKEN?: string;
  NOTION_ROADMAP_DATA_SOURCE_ID?: string;
  NOTION_WORKBLOCKS_DATA_SOURCE_ID?: string;
  NOTION_OAUTH_CLIENT_ID?: string;
  NOTION_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  NOTION_WORKSPACE_ID?: string;
  ALLOWED_EMAILS?: string;
  APP_ORIGIN?: string;
  AUTH_DISABLED?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

let warnedAboutDisabledAuth = false;

/**
 * Single authentication gate for the whole worker.
 *
 * It sits ahead of both the Notion fast-paths below and the App Router
 * fall-through, so every route is covered by one check — including the POST
 * and DELETE handlers that are only reachable through the App Router.
 *
 * Returns a Response to short-circuit with, or the verified session.
 */
async function authenticate(
  request: Request,
  env: Env,
  url: URL,
): Promise<{ response: Response } | { session: Session | null }> {
  // Login endpoints must stay reachable, or there is no way to obtain a session.
  if (url.pathname.startsWith("/api/auth/")) return { session: null };

  const config = readAuthConfig(env);

  if (config.disabled) {
    if (!warnedAboutDisabledAuth) {
      warnedAboutDisabledAuth = true;
      console.warn(
        "AUTH_DISABLED=true: serving without authentication. " +
          "Never use this on anything reachable from outside this machine.",
      );
    }
    return { session: null };
  }

  // Fail closed. An unconfigured app must not serve the planner — and the
  // Notion token behind it — to anyone who can reach the port.
  const configError = authConfigError(config);
  if (configError) {
    return {
      response: new Response(configError, {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    };
  }

  const session = await verifySessionToken(
    readSessionCookie(request.headers.get("cookie")),
    config.sessionSecret,
  );
  if (session) return { session };

  if (url.pathname.startsWith("/api/")) {
    return {
      response: Response.json({ error: "Niet aangemeld" }, { status: 401 }),
    };
  }
  return {
    response: new Response(null, {
      status: 302,
      headers: { Location: "/api/auth/notion" },
    }),
  };
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const auth = await authenticate(request, env, url);
    if ("response" in auth) return auth.response;
    const viewer = auth.session;

    if (url.pathname === "/api/notion/tasks" && request.method === "GET") {
      return getNotionTasksResponse(
        env.NOTION_TOKEN,
        env.NOTION_ROADMAP_DATA_SOURCE_ID,
        env.NOTION_WORKBLOCKS_DATA_SOURCE_ID,
        viewer && { email: viewer.email, userId: viewer.userId },
      );
    }

    if (url.pathname === "/api/notion/tasks" && request.method === "PATCH") {
      return updateNotionTaskResponse(request, env.NOTION_TOKEN);
    }

    if (
      url.pathname === "/api/notion/workblocks" &&
      request.method === "POST"
    ) {
      return updateNotionWorkblockResponse(
        request,
        env.NOTION_TOKEN,
        env.NOTION_WORKBLOCKS_DATA_SOURCE_ID,
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
