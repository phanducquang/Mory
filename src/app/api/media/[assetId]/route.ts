import { readImage, deleteImage } from "@/server/storage/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) { return readImage(request, (await context.params).assetId); }
export async function DELETE(request: Request, context: { params: Promise<{ assetId: string }> }) { return deleteImage(request, (await context.params).assetId); }
