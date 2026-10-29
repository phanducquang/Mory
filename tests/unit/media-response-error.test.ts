import { describe, expect, it } from "vitest";
import { mediaResponseError } from "@/features/media/response-error";

describe("photo response errors", () => {
  it("explains a non-JSON 413 instead of hiding the proxy's limit", async () => {
    const message = await mediaResponseError(new Response("<html>413 Request Entity Too Large</html>", { status: 413 }));
    expect(message).toContain("HTTP 413");
    expect(message).toContain("giới hạn tải lên");
    expect(message).not.toContain("<html>");
  });
  it("retains the API's precise safe validation/permission error", async () => {
    await expect(mediaResponseError(Response.json({ error: "Bạn chỉ có quyền xem ảnh." }, { status: 403 }))).resolves.toBe("Bạn chỉ có quyền xem ảnh.");
  });
  it.each([400, 401, 408, 415, 502, 504])("keeps an actionable HTTP status when %s returns no JSON", async status => {
    expect(await mediaResponseError(new Response(null, { status }))).toContain(`HTTP ${status}`);
  });
});
