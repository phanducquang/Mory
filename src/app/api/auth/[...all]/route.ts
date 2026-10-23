import { getServerRuntime } from "@/server/runtime";
import { serverDataEnabled } from "@/server/auth/config";
import { readAuthConfig } from "@/server/auth/config";
import { handleAuthenticationRequest } from "@/server/auth/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  if (!serverDataEnabled()) return Response.json({ error: "Chế độ tài khoản chưa được bật." }, { status: 503 });
  const config = readAuthConfig();
  return handleAuthenticationRequest(getServerRuntime().auth, config.baseURL, request, config.emailEnabled, getServerRuntime().db);
}
export { handle as GET, handle as POST };
