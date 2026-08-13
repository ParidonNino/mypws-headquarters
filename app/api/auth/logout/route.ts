import { isSecureRequest } from "../../../../lib/auth-config";
import { clearedSessionCookie } from "../../../../lib/session";

function signOut(request: Request) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": clearedSessionCookie(isSecureRequest(request.url)),
    },
  });
}

export async function POST(request: Request) {
  return signOut(request);
}

export async function GET(request: Request) {
  return signOut(request);
}
