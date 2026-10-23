import { JourneyProvider } from "@/features/app/journey-provider";
import { AppShell } from "@/components/layout/app-shell";
import { createDemoData } from "@/lib/demo-data";
import { serverDataEnabled } from "@/server/auth/config";
import { loadAccountSnapshot } from "@/server/services/account-journey";
import { ServerJourneyProvider } from "@/features/app/server-journey-provider";
export const dynamic = "force-dynamic";
export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (serverDataEnabled()) return <ServerJourneyProvider initialSnapshot={await loadAccountSnapshot()}><AppShell>{children}</AppShell></ServerJourneyProvider>;
  return (
    <JourneyProvider initialData={createDemoData()}>
      <AppShell>{children}</AppShell>
    </JourneyProvider>
  );
}
