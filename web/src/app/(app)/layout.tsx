import { BottomNav, Sidebar } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <div className="flex min-h-dvh">
      <Sidebar logout={logout} />
      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-10 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
