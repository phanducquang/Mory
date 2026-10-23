import { TimelineView } from "@/features/app/views";
import { serverDataEnabled } from "@/server/auth/config";
import { loadInitialTimeline } from "@/server/services/account-journey";
export default async function Page() {
  return <TimelineView eventsOnly initialPage={serverDataEnabled() ? await loadInitialTimeline(true) : undefined} />;
}
