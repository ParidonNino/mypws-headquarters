import { isSecureRequest, readAuthConfig } from "../../../../lib/auth-config";
import { clearedSessionCookie } from "../../../../lib/session";

function signOut(request: Request) {
  const config = readAuthConfig(process.env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": clearedSessionCookie(isSecureRequest(request, config)),
    },
  });
}

export async function POST(request: Request) {
  return signOut(request);
}

export async function GET(request: Request) {
  return signOut(request);
}
