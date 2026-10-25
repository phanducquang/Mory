import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventForm } from "@/features/events/event-form";
import type { Event } from "@/types/domain";

const props = { childId: "child-test", onSave: () => {}, onClose: () => {} };
const event: Event = { id: "event-test", childId: props.childId, title: "Kỷ niệm", date: "2026-10-25", type: "memory", description: "", images: [], reminder: false, createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z" };

describe("event photo workflow", () => {
  it("keeps the inline file chooser available for demo events", () => {
    const html = renderToStaticMarkup(createElement(EventForm, props));
    expect(html).toContain('type="file"');
    expect(html).toContain("Chọn ảnh kỷ niệm");
  });
  it("directs account users to add photos after creation without accepting demo images that would be discarded", () => {
    const html = renderToStaticMarkup(createElement(EventForm, { ...props, imageMode: "after-save" }));
    expect(html).toContain("Lưu sự kiện để mở trang chi tiết và thêm ảnh.");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("chưa được bật");
  });
  it("directs edits to the existing photo manager rather than asking to create the event again", () => {
    const html = renderToStaticMarkup(createElement(EventForm, { ...props, event, imageMode: "after-save" }));
    expect(html).toContain("Thêm hoặc xóa ảnh trong trang chi tiết sự kiện.");
    expect(html).not.toContain("Lưu sự kiện để mở");
    expect(html).not.toContain('type="file"');
  });
  it("reports a disabled capability only when server media is disabled", () => {
    const html = renderToStaticMarkup(createElement(EventForm, { ...props, imageMode: "disabled" }));
    expect(html).toContain("Tính năng ảnh chưa được bật trên máy chủ này.");
    expect(html).not.toContain('type="file"');
  });
});
