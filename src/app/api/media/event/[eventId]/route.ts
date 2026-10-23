import { uploadImage } from "@/server/storage/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) { return uploadImage(request, "EVENT", (await context.params).eventId); }
