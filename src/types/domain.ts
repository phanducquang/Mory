/** Calendar dates are YYYY-MM-DD strings; timestamps are ISO 8601 strings. */
export type DateOnly = string;
export type ChildLifecycle = "EXPECTING" | "AFTER_BIRTH" | "PAUSED" | "ENDED";
export type CalendarRule = "SAME_DAY" | "MINUS_ONE" | "MINUS_TWO";
export type LeapMonthRule = "REGULAR_MONTH" | "LEAP_MONTH" | "NEXT_AVAILABLE";

export interface Child {
  id: string;
  familyId?: string;
  name: string;
  nickname?: string;
  lifecycle: ChildLifecycle;
  dueDate?: DateOnly;
  birthDate?: DateOnly;
  birthTime?: string;
  gender?: "female" | "male" | "other" | "unspecified";
  avatar?: string;
  calendarRule?: CalendarRule;
  leapMonthRule?: LeapMonthRule;
  reminderEnabled?: boolean;
  trackingUntilAge?: number;
  privacy?: "FAMILY_ONLY";
  dueReminderSnoozedUntil?: DateOnly;
}

export type EventType = "memory" | "milestone" | "health" | "activity";
export interface Event {
  id: string;
  childId: string;
  title: string;
  /** The event's date, never its creation timestamp. */
  date: DateOnly;
  time?: string;
  type: EventType;
  description: string;
  images: string[];
  reminder: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneState =
  "SUGGESTED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "COMPLETED" | "SKIPPED";
export type MilestoneKind =
  | "due"
  | "full-month"
  | "first-birthday"
  | "birthday"
  | "development"
  | "custom";
export interface ChildMilestone {
  id: string;
  childId: string;
  key: string;
  title: string;
  kind: MilestoneKind;
  state: MilestoneState;
  suggestedDate?: DateOnly;
  confirmedDate?: DateOnly;
  ceremonyDate?: DateOnly;
  needsDateConfirmation: boolean;
  description: string;
  age?: number;
  eventId?: string;
}
export type Milestone = ChildMilestone;

export interface MilestoneDefinition {
  key: string;
  title: string;
  kind: MilestoneKind;
  calendar: "SOLAR" | "VIETNAMESE_LUNAR" | "FAMILY_CHOICE";
}

export interface DemoData {
  children: Child[];
  events: Event[];
  activeChildId: string;
  milestones?: ChildMilestone[];
}

export interface User {
  id: string;
  displayName: string;
  email?: string;
}
export interface Family {
  id: string;
  name: string;
  createdAt: string;
}
export interface FamilyMember {
  id: string;
  familyId: string;
  userId: string;
  role: "OWNER" | "PARENT" | "VIEWER";
}
export interface JourneyEntry {
  id: string;
  childId: string;
  eventId?: string;
  body: string;
  date: DateOnly;
  createdAt: string;
}
export interface MediaAsset {
  id: string;
  familyId: string;
  childId: string;
  objectKey: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  width?: number;
  height?: number;
  createdAt: string;
}
export interface Reminder {
  id: string;
  childId: string;
  eventId?: string;
  milestoneId?: string;
  scheduledAt: string;
  enabled: boolean;
}
export interface UserPreference {
  userId: string;
  timezone: "Asia/Ho_Chi_Minh";
  locale: "vi-VN";
  notificationsEnabled: boolean;
}
