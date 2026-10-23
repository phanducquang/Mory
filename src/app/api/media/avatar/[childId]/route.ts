import { uploadImage } from "@/server/storage/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ childId: string }> }) { return uploadImage(request, "AVATAR", (await context.params).childId); }
