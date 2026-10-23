import { describe, expect, it } from "vitest";
import {
  changeTrackingState,
  confirmBirth,
  needsBirthConfirmation,
  resumeTracking,
  snoozeBirthConfirmation,
} from "@/features/children/domain";
import type { Child } from "@/types/domain";

const expecting: Child = {
  id: "child-a",
  name: "Mây",
  lifecycle: "EXPECTING",
  dueDate: "2026-10-17",
};

describe("child lifecycle", () => {
  it("asks for confirmation on and after the due date without changing lifecycle", () => {
    expect(needsBirthConfirmation(expecting, "2026-10-16")).toBe(false);
    expect(needsBirthConfirmation(expecting, "2026-10-17")).toBe(true);
    expect(needsBirthConfirmation(expecting, "2026-11-17")).toBe(true);
    expect(expecting.lifecycle).toBe("EXPECTING");
    expect(expecting.birthDate).toBeUndefined();
  });
  it("only moves to AFTER_BIRTH after a valid explicit confirmation", () => {
    const born = confirmBirth(expecting, "2026-10-16", "08:30", "2026-10-17");
    expect(born).toMatchObject({
      lifecycle: "AFTER_BIRTH",
      birthDate: "2026-10-16",
      birthTime: "08:30",
      dueDate: "2026-10-17",
    });
    expect(expecting.lifecycle).toBe("EXPECTING");
    expect(needsBirthConfirmation(born, "2026-10-17")).toBe(false);
    expect(() =>
      confirmBirth(expecting, "2026-10-18", undefined, "2026-10-17"),
    ).toThrow();
    expect(() =>
      confirmBirth(expecting, "2026-02-30", undefined, "2026-10-17"),
    ).toThrow();
    expect(() =>
      confirmBirth(expecting, "2026-10-16", "25:00", "2026-10-17"),
    ).toThrow();
    expect(() =>
      confirmBirth(born, "2026-10-16", undefined, "2026-10-17"),
    ).toThrow();
  });
  it("supports not-yet-born and remind-later without inferring a birth", () => {
    const later = snoozeBirthConfirmation(expecting, "2026-10-17", 1);
    expect(later.lifecycle).toBe("EXPECTING");
    expect(needsBirthConfirmation(later, "2026-10-17")).toBe(false);
    expect(needsBirthConfirmation(later, "2026-10-18")).toBe(true);
  });
  it("quietly disables reminders when a journey is paused or ended", () => {
    for (const state of ["PAUSED", "ENDED"] as const) {
      const child = changeTrackingState(expecting, state);
      expect(child.reminderEnabled).toBe(false);
      expect(needsBirthConfirmation(child, "2026-10-20")).toBe(false);
      expect(child.dueDate).toBe(expecting.dueDate);
    }
    expect(
      resumeTracking(changeTrackingState(expecting, "PAUSED")).lifecycle,
    ).toBe("EXPECTING");
  });
});
