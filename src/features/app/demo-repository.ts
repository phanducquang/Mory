import type { DemoData } from "@/types/domain";
import { parseDemoData } from "@/lib/validation";

export interface JourneyRepository {
  load(): DemoData | null;
  save(data: DemoData): void;
  clear(): void;
}
const KEY = "mory-demo-v1";
export const browserJourneyRepository: JourneyRepository = {
  load() {
    const value = localStorage.getItem(KEY);
    if (!value) return null;
    try {
      return parseDemoData(JSON.parse(value));
    } catch {
      throw new Error(
        "Dữ liệu demo không đọc được. Bạn có thể đặt lại dữ liệu trong Cài đặt.",
      );
    }
  },
  save(data) {
    const valid = parseDemoData(data);
    try {
      localStorage.setItem(KEY, JSON.stringify(valid));
    } catch {
      throw new Error(
        "Bộ nhớ trình duyệt đã đầy hoặc bị chặn. Hãy giảm số ảnh và thử lại.",
      );
    }
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};
