import { EventDetailView } from "@/features/app/views";
import { serverDataEnabled } from "@/server/auth/config";
import { accountServices } from "@/server/services/account-journey";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (serverDataEnabled()) {
    const { journey } = await accountServices();
    let event;
    try { event = await journey.getEvent(id); } catch { notFound(); }
    if (!event) notFound();
    return <EventDetailView id={id} initialEvent={event} />;
  }
  return <EventDetailView id={id} />;
}
